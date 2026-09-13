import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import ts from 'typescript'

const jsx = (type, props) => ({ type, props })
function load(path, mocks = {}) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText
  new Function('exports', 'require', code)(exports, name => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (name in mocks) return mocks[name]
    if (name.startsWith('.')) return load(`${resolve(dirname(path), name)}.ts`, mocks)
    throw Error(`Unmocked module: ${name}`)
  })
  return exports
}
const model = load('src/models/message.ts')
const actions = load('src/ui/messageActions.ts')
const row = (patch = {}) => ({ id: 'message', pair_id: 'pair', sender_id: 'author', text: 'Original', song: null,
  created_at: '2026-09-01T00:00:00Z', opened_at: null, read_at: null, ...patch })
const message = patch => model.messageFromRow(row(patch))
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }
function tree(node) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(tree)
  return [node, ...tree(node.props?.children)]
}

test('only the author can modify live messages; invitations and tombstones are not editable', () => {
  assert.equal(actions.canEditMessage(message(), 'author'), true)
  assert.equal(actions.canModifyMessage(message(), 'recipient'), false)
  assert.equal(actions.canModifyMessage(message(), ''), false)
  const invitation = message({ text: 'https://dnmusic-app.vercel.app/jam/abcd1234' })
  assert.equal(actions.canEditMessage(invitation, 'author'), false)
  assert.equal(actions.canModifyMessage(invitation, 'author'), true)
  const deleted = message({ deleted_at: '2026-09-02T00:00:00Z', song: { path: 'private/audio', title: 'Secret' } })
  assert.equal(actions.canModifyMessage(deleted, 'author'), false)
  assert.equal(actions.messageCopyText(deleted), '')
  assert.equal(deleted.song, null)
  assert.equal(deleted.text, 'Mensaje eliminado')
  assert.equal(actions.validMessageText(message(), '  '), false)
  assert.equal(actions.validMessageText(message(), 'x'.repeat(2001)), false)
  assert.equal(actions.validMessageText(message({ song: { path: 'audio', title: 'Song' } }), '  '), true)
})

function service() {
  let event, status
  const queries = [], rpcs = [], changes = [], errors = []
  const channel = { on(_type, _filter, fn) { event = fn; return this }, subscribe(fn) { status = fn; return this } }
  const supabase = {
    channel: () => channel, removeChannel() {},
    from: () => ({ select: () => ({ eq: () => ({ order: () => new Promise(resolve => queries.push(resolve)) }) }) }),
    rpc: (name, params) => new Promise(resolve => rpcs.push({ name, params, resolve })),
  }
  const api = load('src/services/messages.ts', { '../lib/supabase': { getSupabase: () => supabase } })
  const stop = api.subscribeToMessages('pair', messages => changes.push(messages), error => errors.push(error))
  return { api, queries, rpcs, changes, errors, stop, event: value => event(value), reconnect: () => status('SUBSCRIBED') }
}

test('RPC waits for the confirmed row; late RPC and realtime never resurrect deleted content or lose receipts', async () => {
  const f = service()
  f.queries.shift()({ data: [row()], error: null }); await flush()
  const pending = f.api.editMessage('pair', 'message', ' Edited ', 'Original')
  assert.equal(f.rpcs[0].params.p_text, 'Edited')
  assert.equal(f.changes.at(-1)[0].text, 'Original')
  f.event({ eventType: 'UPDATE', new: row({ text: 'Mensaje eliminado', deleted_at: '2026-09-02T00:01:00Z' }) })
  f.rpcs[0].resolve({ data: row({ text: 'Edited', edited_at: '2026-09-02T00:00:00Z' }), error: null })
  await pending
  f.event({ eventType: 'UPDATE', new: row({ read_at: '2026-09-02T00:00:30Z' }) })
  assert.equal(f.changes.at(-1)[0].text, 'Mensaje eliminado')
  assert.ok(f.changes.at(-1)[0].deletedAt)
  assert.ok(f.changes.at(-1)[0].readAt)
  assert.equal(f.changes.at(-1)[0].song, null)
  f.stop()
})

test('a newer edit wins over a delayed older edit and reconnect repairs missed edits and hard deletions', async () => {
  const f = service()
  f.queries.shift()({ data: [row(), row({ id: 'gone' })], error: null }); await flush()
  f.event({ eventType: 'UPDATE', new: row({ text: 'Newest', edited_at: '2026-09-03T00:00:00Z' }) })
  f.event({ eventType: 'UPDATE', new: row({ text: 'Older', edited_at: '2026-09-02T00:00:00Z' }) })
  assert.equal(f.changes.at(-1).find(m => m.id === 'message').text, 'Newest')
  f.reconnect()
  f.queries.shift()({ data: [row({ text: 'Missed while offline', edited_at: '2026-09-04T00:00:00Z' })], error: null }); await flush()
  assert.equal(f.changes.at(-1).length, 1)
  assert.equal(f.changes.at(-1)[0].text, 'Missed while offline')
  f.reconnect()
  f.event({ eventType: 'UPDATE', new: row({ text: 'Arrived during SELECT', edited_at: '2026-09-06T00:00:00Z' }) })
  f.queries.shift()({ data: [row({ text: 'Stale snapshot', edited_at: '2026-09-05T00:00:00Z' })], error: null }); await flush()
  assert.equal(f.changes.at(-1)[0].text, 'Arrived during SELECT')
  f.stop()
})

test('old backend and denied RPC leave the message unchanged and return useful errors', async () => {
  const f = service()
  f.queries.shift()({ data: [row()], error: null }); await flush()
  const pending = f.api.deleteMessage('pair', 'message')
  f.rpcs[0].resolve({ data: null, error: { code: 'PGRST202', message: 'missing function' } })
  await assert.rejects(pending, /servidor todavía no tiene habilitada/)
  assert.equal(f.changes.at(-1)[0].text, 'Original')
  const denied = f.api.editMessage('pair', 'message', 'Denied', 'Original')
  f.rpcs[1].resolve({ data: null, error: { code: '42501', message: 'message_author_required' } })
  await assert.rejects(denied, /propios mensajes/)
  assert.equal(f.changes.at(-1)[0].text, 'Original')
  f.stop()
})

function dialog(kind = 'edit', userId = 'author') {
  let cursor = 0, closes = 0
  const state = [], requests = [], notices = []
  const react = {
    useEffect() {},
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], v => { state[i] = v }] },
    useRef(initial) { const i = cursor++; return state[i] ??= { current: initial } },
  }
  const mocks = {
    react,
    'react-native': { Modal: 'Modal', View: 'View', Text: 'Text', ScrollView: 'ScrollView', KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'ios' } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '../services/messages': Object.fromEntries(['editMessage', 'deleteMessage'].map(name => [name, (...args) => new Promise((resolve, reject) => requests.push({ name, args, resolve, reject }))])),
    '../state/session': { refreshConversations: async () => {} }, '../state/aviso': { avisar: (...args) => notices.push(args) },
    './CampoMensaje': { CampoMensaje: 'CampoMensaje' }, './Button': { PrimaryButton: 'PrimaryButton', GhostButton: 'GhostButton' }, './Confirmar': { Confirmar: 'Confirmar' },
  }
  const { MessageActionDialog } = load('src/ui/MessageActionDialog.tsx', mocks)
  const render = () => { cursor = 0; return tree(MessageActionDialog({ target: { kind, pairId: 'pair', userId, message: message() }, onClose: () => closes++ })) }
  return { render, requests, notices, get closes() { return closes }, get: type => render().find(node => node.type === type)?.props }
}

test('editing has its own draft; failures retain it; double save only sends one RPC', async () => {
  const d = dialog()
  d.get('CampoMensaje').onChangeText('Updated caption')
  const save = d.get('PrimaryButton').onPress
  save(); save()
  assert.equal(d.requests.length, 1)
  assert.deepEqual(d.requests[0].args, ['pair', 'message', 'Updated caption', 'Original'])
  d.requests[0].reject(Error('Offline')); await flush()
  assert.equal(d.get('CampoMensaje').value, 'Updated caption')
  assert.equal(d.closes, 0)
  assert.ok(d.render().some(node => node.props.children === 'Offline'))
  d.get('PrimaryButton').onPress()
  d.requests[1].resolve(message({ text: 'Updated caption' })); await flush()
  assert.equal(d.closes, 1)
  assert.deepEqual(d.notices, [['Mensaje editado']])
})

test('deletion requires confirmation; cancel never calls the server; failure is visible and never reports success', async () => {
  const cancel = dialog('delete')
  cancel.get('Confirmar').onCancelar()
  assert.equal(cancel.requests.length, 0)
  assert.equal(cancel.closes, 1)
  const d = dialog('delete')
  const confirm = d.get('Confirmar').onConfirmar
  confirm(); confirm()
  assert.equal(d.requests.length, 1)
  d.requests[0].reject(Error('Not authorized')); await flush()
  assert.deepEqual(d.notices, [['Not authorized', true]])
  assert.equal(d.closes, 1)
  const other = dialog('delete', 'recipient')
  other.get('Confirmar').onConfirmar()
  assert.equal(other.requests.length, 0)
})

test('a bubble exposes the same actions via native hold and visible menu; recipients cannot edit or delete', () => {
  const symbols = new Proxy({}, { get: (_, key) => String(key) })
  const { ChatBubble } = load('src/ui/ChatBubble.tsx', {
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', Image: 'Image', Platform: { OS: 'ios' }, StyleSheet: { absoluteFill: {} } },
    './Menu': { Menu: 'Menu', MantenerApretado: 'MantenerApretado' },
    './useClicDerecho': { useClicDerecho: () => ({ gestos: { onContextMenu() {} }, punto: null, cerrar() {} }) },
    '../lib/portapapeles': { copiarAlPortapapeles: async () => true }, '../state/aviso': { avisar() {} },
    './IconButton': { IconButton: 'IconButton' }, './CancionCompartida': { CancionCompartida: 'CancionCompartida' }, './InvitacionJam': { InvitacionJam: 'InvitacionJam' },
    '../lib/artwork': { artworkSource: () => null }, './MessageCard': { formatMessageDate: () => '10:00' },
    './Onda': { Onda: 'Onda', usePicos: () => null }, './SeekBar': { SeekBar: 'SeekBar', formatClock: () => '0:00' },
    './icons': symbols, './estadoControl': { estadoControlWeb: () => ({}) },
  })
  let opened = 0, edited = 0
  const props = { message: message(), mine: true, userId: 'author', onPress: () => opened++, onPlay() {}, onSeek() {}, onEdit: () => edited++, onDelete() {} }
  const nodes = tree(ChatBubble(props))
  const hold = nodes.find(node => node.type === 'MantenerApretado').props
  const menu = nodes.find(node => node.type === 'Menu').props
  assert.equal(hold.items, menu.items)
  assert.notEqual(menu.sinDisparador, true, 'keyboard and VoiceOver have a visible alternative')
  assert.equal(nodes.some(node => typeof node.props.onContextMenu === 'function'), true)
  nodes.find(node => node.type === 'Pressable').props.onLongPress()
  assert.equal(opened, 0)
  menu.items.find(item => item.label === 'Editar mensaje').onPress()
  assert.equal(edited, 1)
  const recipient = tree(ChatBubble({ ...props, mine: false, userId: 'recipient' })).find(node => node.type === 'Menu').props
  assert.ok(!recipient.items.some(item => item.label === 'Editar mensaje' || item.destructive))
})


test('first successful channel join repairs edits between the initial SELECT and subscription', async () => {
  const f = service()
  f.queries.shift()({ data: [row()], error: null }); await flush()
  f.reconnect() // first SUBSCRIBED, not a reconnect yet
  assert.equal(f.queries.length, 1)
  f.queries.shift()({ data: [row({ deleted_at: '2026-09-03T00:00:00Z' })], error: null }); await flush()
  assert.equal(f.changes.at(-1)[0].text, 'Mensaje eliminado')
  f.stop()
})

test('edit ordering preserves PostgreSQL microseconds, including normalized timezone offsets', () => {
  const newest = message({ text: 'Newest', edited_at: '2026-09-03T00:00:00.123999Z' })
  const older = message({ text: 'Older', edited_at: '2026-09-03T02:00:00.123001+02:00' })
  assert.equal(newest.editedAt.getTime(), older.editedAt.getTime())
  assert.equal(model.mergeMessage(newest, older).text, 'Newest')
  assert.equal(model.mergeMessage(older, newest).text, 'Newest')
})
