import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const changes = []
let data
const jsx = (type, props) => ({ type, props })
const modules = {
  'react/jsx-runtime': { jsx, jsxs: jsx },
  '../state/discord': { HAY_DISCORD: true, DISCORD_APPLICATION_ID: '1548502947623739552', useDiscord: () => data, configurarDiscord: config => changes.push(config) },
  './Ajustes': { FilaAccion: 'action', FilaDato: 'data', GrupoAjustes: 'group' },
  './DiscordIcon': { DiscordIcon: 'logo' },
  './AjustesDiscordRemoto': { AjustesDiscordRemoto: 'remote' },
  './discordEtiquetas': { ESTADOS_DISCORD: { disabled: 'No conectado', unconfigured: 'Conexión sin configurar', disconnected: 'Discord no está disponible', connecting: 'Buscando Discord…', ready: 'Conectado · esperando música', published: 'Canción enviada a Discord', error: 'No se pudo conectar' } },
}
const exports = {}
new Function('exports', 'require', ts.transpileModule(readFileSync('src/ui/AjustesDiscord.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText)(exports, id => { assert.ok(id in modules, id); return modules[id] })
function nodes(tree, type) {
  if (!tree || typeof tree !== 'object') return []
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, type))
  return [...(tree.type === type ? [tree] : []), ...nodes(tree.props?.children, type)]
}
function render(status, enabled = status !== 'disabled') {
  data = { estado: { enabled, status, applicationId: 'old-custom-id' }, cargado: true, guardando: false, error: null }
  const wrapper = exports.AjustesDiscord()
  return wrapper.type(wrapper.props)
}
test('Conectar Discord enables the configured DMusic application with explicit action', () => {
  changes.length = 0
  const ui = render('disabled')
  const action = nodes(ui, 'action').find(n => n.props.rotulo === 'Conectar Discord')
  assert.ok(action); assert.equal(action.props.disabled, false)
  assert.equal(changes.length, 0, 'rendering must never grant sharing permission')
  action.props.onPress()
  assert.deepEqual(changes, [{ enabled: true, applicationId: '1548502947623739552' }])
})
test('connecting can cancel, missing Discord can retry, connected idle differs from publishing', () => {
  const connecting = nodes(render('connecting'), 'action')
  assert.equal(connecting[0].props.busy, true)
  assert.equal(connecting[1].props.rotulo, 'Cancelar conexión')
  connecting[1].props.onPress(); assert.equal(changes.at(-1).enabled, false)
  assert.ok(nodes(render('disconnected'), 'action').some(n => n.props.rotulo === 'Reintentar conexión'))
  assert.equal(nodes(render('ready'), 'data')[0].props.valor, 'Conectado · esperando música')
  assert.equal(nodes(render('published'), 'data')[0].props.valor, 'Canción enviada a Discord')
  const action = nodes(render('ready'), 'action').find(n => n.props.rotulo === 'Desconectar Discord')
  assert.equal(action.props.rotulo, 'Desconectar Discord'); action.props.onPress()
  assert.equal(changes.at(-1).enabled, false)
})


test('sin puente de escritorio los ajustes ofrecen el control remoto, sin intentar IPC local', () => {
  modules['../state/discord'].HAY_DISCORD = false
  try {
    const before = changes.length
    assert.equal(exports.AjustesDiscord().type, 'remote')
    assert.equal(changes.length, before)
  } finally { modules['../state/discord'].HAY_DISCORD = true }
})

const remoto = {}
const llamadasRemotas = []
modules['../state/discordRemoto'] = {
  useDiscordRemoto: () => ({ dispositivos: [], conexion: 'conectado', pendiente: null, error: null }),
  configurarDiscordRemoto: (...args) => llamadasRemotas.push(args),
  cancelarDiscordRemoto: () => llamadasRemotas.push('cancelar'),
}
new Function('exports', 'require', ts.transpileModule(readFileSync('src/ui/AjustesDiscordRemoto.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText)(remoto, id => { assert.ok(id in modules, id); return modules[id] })
const pc = (status, enabled = status !== 'disabled') => ({ deviceId: 'pc-1', nombre: 'Linux', estado: { status, enabled } })
function vistaRemota(dispositivos, overrides = {}) {
  return remoto.ContenidoDiscordRemoto({ dispositivos, conexion: 'conectado', pendiente: null, error: null,
    onCambiar: (...args) => llamadasRemotas.push(args), onCancelar: () => llamadasRemotas.push('cancelar'), ...overrides })
}

test('iOS sólo conecta la PC elegida mediante una acción explícita', () => {
  llamadasRemotas.length = 0
  const ui = vistaRemota([pc('disabled')])
  assert.equal(llamadasRemotas.length, 0)
  const action = nodes(ui, 'action').find(n => n.props.rotulo === 'Conectar Discord')
  assert.ok(action)
  action.props.onPress()
  assert.deepEqual(llamadasRemotas, [['pc-1', true]])
})

test('iOS distingue publicación, reintento y revocación sin aparentar vínculo directo', () => {
  const ui = vistaRemota([pc('published')])
  assert.ok(nodes(ui, 'data').some(n => n.props.valor === 'Canción enviada a Discord'))
  const action = nodes(ui, 'action').find(n => n.props.rotulo === 'Desconectar Discord')
  action.props.onPress()
  assert.deepEqual(llamadasRemotas.at(-1), ['pc-1', false])
  assert.ok(nodes(ui, 'data').some(n => n.props.valor === 'A través de tu computadora'))
  nodes(vistaRemota([pc('error')]), 'action').find(n => n.props.rotulo === 'Reintentar conexión').props.onPress()
  assert.deepEqual(llamadasRemotas.at(-1), ['pc-1', true])
})

test('iOS no ofrece acciones remotas sin conexión ni PCs disponibles; la espera se puede cancelar', () => {
  for (const ui of [vistaRemota([]), vistaRemota([pc('published')], { conexion: 'desconectado' })]) {
    assert.equal(nodes(ui, 'action').length, 0)
    assert.ok(nodes(ui, 'group').some(n => n.props.pie?.includes('todavía no está disponible')))
  }
  const ui = vistaRemota([pc('disabled')], { pendiente: 'pc-1' })
  const actions = nodes(ui, 'action')
  assert.ok(actions.find(n => n.props.busy && n.props.disabled))
  actions.find(n => n.props.rotulo === 'Cancelar solicitud').props.onPress()
  assert.equal(llamadasRemotas.at(-1), 'cancelar')
})

test('muestra la cuenta real y permite renovar una conexión READY sin prometer visibilidad', () => {
  const ui = exports.ContenidoDiscord({ estado: { enabled: true, applicationId: 'id', status: 'ready', account: 'amigo' }, cargado: true, guardando: false, error: null, onCambiar: v => changes.push(v) })
  assert.ok(nodes(ui, 'data').some(n => n.props.valor === '@amigo'))
  nodes(ui, 'action').find(n => n.props.rotulo === 'Reintentar conexión').props.onPress()
  assert.equal(changes.at(-1), true)
  assert.ok(nodes(ui, 'group').some(n => n.props.pie?.includes('visibilidad para tus amigos depende de Discord')))
})
