import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const changes = []
let data
const jsx = (type, props) => ({ type, props })
const modules = {
  'react/jsx-runtime': { jsx, jsxs: jsx },
  '../state/discord': { DISCORD_APPLICATION_ID: '1548502947623739552', useDiscord: () => data, configurarDiscord: config => changes.push(config) },
  './Ajustes': { FilaAccion: 'action', FilaDato: 'data', GrupoAjustes: 'group' },
  './DiscordIcon': { DiscordIcon: 'logo' },
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
  assert.equal(nodes(render('published'), 'data')[0].props.valor, 'Mostrando tu música')
  const action = nodes(render('ready'), 'action')[0]
  assert.equal(action.props.rotulo, 'Desconectar Discord'); action.props.onPress()
  assert.equal(changes.at(-1).enabled, false)
})
