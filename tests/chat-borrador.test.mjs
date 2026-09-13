import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

// Run the actual composer with inert UI/services: these tests cannot send messages.
function fixture({ request = false } = {}) {
  let index = 0, guard, fail = false, resets = 0
  const states = [], calls = [], navigations = [], effects = [], timers = [], modules = new Map()
  const recipient = { id: 'fixture', username: 'local', displayName: null, avatarPath: null }
  let draft = { text: 'Un borrador', song: { title: 'Tema', artist: 'Prueba', durationMs: 15000 }, recipient, chooseRecipient: false }
  const generic = id => {
    if (!modules.has(id)) modules.set(id, new Proxy({}, { get(target, key) { return target[key] ??= function Component() {} } }))
    return modules.get(id)
  }
  const jsx = (type, props) => ({ type, props })
  const exports = {}
  runInNewContext(ts.transpileModule(readFileSync(new URL('../app/compose.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, AbortController, setTimeout: fn => timers.push(fn), clearTimeout() {}, window: { addEventListener() {}, removeEventListener() {} }, require(id) {
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (id === 'react') return {
      useState(value) { const i = index++; if (!(i in states)) states[i] = typeof value === 'function' ? value() : value; return [states[i], next => states[i] = typeof next === 'function' ? next(states[i]) : next] },
      useRef(value) { const i = index++; return states[i] ??= { current: value } },
      useMemo: fn => fn(), useEffect(fn) { effects.push(fn) },
    }
    if (id === 'react-native') return { ...generic(id), Platform: { OS: 'web' }, useWindowDimensions: () => ({ width: 390, height: 844 }) }
    if (id === 'expo-router') return { useRouter: () => ({ push: path => navigations.push(path) }) }
    if (id === 'expo-router/react-navigation') return {
      useNavigation: () => ({ dispatch: action => navigations.push(action) }),
      usePreventRemove: (enabled, callback) => guard = { enabled, callback },
    }
    if (id.endsWith('/volver')) return { volver: () => guard.enabled ? guard.callback({ data: { action: { type: 'BACK' } } }) : navigations.push({ type: 'BACK' }) }
    if (id.endsWith('/draft')) return { useDraft: () => draft, setDraft: patch => draft = { ...draft, ...patch }, resetDraft: () => { resets++; draft = { text: '', song: null, recipient: null, chooseRecipient: false } } }
    if (id.endsWith('/session')) return {
      useContact: () => recipient, useConversations: () => request ? [] : [{ contact: recipient }], getSession: () => ({ user: { id: 'self' } }),
      openContactConversation: async () => 'mock-pair', refreshConversations: async () => {},
    }
    if (id.endsWith('/messages')) return { sendMessage: async (...args) => { calls.push(args); if (fail) throw new Error('Fallo simulado') } }
    if (id.endsWith('/contacts')) return { ...generic(id), contactLabel: () => 'Local', contactTitle: () => 'Local', toContact: c => ({ id: c.id, username: c.username, displayName: c.displayName, avatarPath: c.avatarPath }), searchContacts: async () => [{ ...recipient, pairId: 'mock-pair', solicitud: null }], sendContactRequest: async uid => { calls.push(['request', uid]); return 'enviada' } }
    if (id.endsWith('/shell')) return { usePiso: () => 16, useKeyboardH: () => 0 }
    if (id.endsWith('/icons')) return { ...generic(id), ICON_COLOR: {} }
    return generic(id)
  } })
  function flatten(node) {
    if (!node || typeof node !== 'object') return []
    if (Array.isArray(node)) return node.flatMap(flatten)
    return [node, ...Object.values(node.props || {}).flatMap(flatten)]
  }
  function render() { index = 0; return flatten(exports.default()) }
  return {
    async loadResults() { effects.splice(0).forEach(fn => fn()); timers.splice(0).forEach(fn => fn()); await Promise.resolve(); await Promise.resolve() },
    render, calls, navigations, get draft() { return draft }, get resets() { return resets }, setFail: value => fail = value,
    get: (nodes, prop, value) => nodes.find(n => n.props?.[prop] === value)?.props,
  }
}

test('cancelar la salida conserva el borrador; descartar lo limpia solo al confirmar', () => {
  const f = fixture()
  f.render().find(n => typeof n.props?.onCerrar === 'function').props.onCerrar()
  assert.equal(f.resets, 0)
  f.get(f.render(), 'titulo', '¿Descartar el mensaje?').onCancelar()
  assert.equal(f.draft.text, 'Un borrador')
  assert.equal(f.draft.song.title, 'Tema')
  f.render().find(n => typeof n.props?.onCerrar === 'function').props.onCerrar()
  f.get(f.render(), 'titulo', '¿Descartar el mensaje?').onConfirmar()
  assert.equal(f.resets, 1)
  assert.equal(f.draft.song, null)
  assert.equal(f.navigations.length, 1)
  assert.equal(f.calls.length, 0)
})

test('fallo conserva texto y fragmento; reintento y doble clic hacen un solo envío', async () => {
  const f = fixture()
  f.setFail(true)
  await f.get(f.render(), 'label', 'Enviar mensaje').onPress()
  assert.equal(f.resets, 0)
  assert.equal(f.draft.text, 'Un borrador')
  assert.ok(f.get(f.render(), 'children', 'No se pudo enviar: Fallo simulado'))
  f.setFail(false)
  const send = f.get(f.render(), 'label', 'Enviar mensaje').onPress
  const pending = send()
  await send()
  assert.equal(f.get(f.render(), 'label', 'Enviar mensaje').busy, true)
  await pending
  assert.equal(f.calls.length, 2) // one failure, one success
  assert.equal(f.calls[1][2].song.title, 'Tema')
  assert.equal(f.resets, 1)
  assert.equal(f.navigations.length, 1)
})

test('una cuenta sin relación conserva el flujo de solicitud, sin enviar contenido', async () => {
  const f = fixture({ request: true })
  await f.get(f.render(), 'label', 'Enviar solicitud').onPress()
  assert.deepEqual(f.calls, [['request', 'fixture']])
  assert.equal(f.resets, 1)
})


test('visitar un perfil desde resultados y volver conserva texto, canción y selector sin enviar', async () => {
  const f = fixture()
  f.get(f.render(), 'label', 'Cambiar destinatario').onPress()
  f.render()
  await f.loadResults()
  const list = f.render().find(n => typeof n.props?.renderItem === 'function').props
  const account = list.data[0]
  const row = list.renderItem({ item: account }).props
  const before = f.draft
  row.onVerPerfil()
  assert.equal(f.navigations[0].pathname, '/perfil/[usuario]')
  assert.equal(f.navigations[0].params.usuario, 'local')
  assert.equal(f.draft, before)
  // A pushed profile is popped independently; the underlying composer renders again.
  f.navigations.pop()
  assert.ok(f.render().find(n => typeof n.props?.renderItem === 'function'))
  assert.equal(f.draft.text, 'Un borrador')
  assert.equal(f.draft.song.title, 'Tema')
  assert.equal(f.draft.recipient, null)
  row.onAbrir()
  assert.equal(f.draft.recipient.id, account.id)
  assert.equal(f.draft.text, 'Un borrador')
  assert.equal(f.draft.song.title, 'Tema')
  assert.equal(f.resets, 0)
  assert.equal(f.calls.length, 0)
})
