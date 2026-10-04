import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const jsx = (type, props) => ({ type, props })
const components = Object.fromEntries(['BottomSheet', 'Button', 'Form', 'Group', 'Host', 'NavigationStack', 'ProgressView', 'Section', 'Text', 'TextField'].map(k => [k, k]))
components.Toolbar = Object.assign('Toolbar', {})
// Slot names let the assertions inspect the native toolbar without loading iOS.
components.Toolbar = { Content: 'Toolbar.Content' }
components.useNativeState = initial => { let value = initial; return { get: () => value, set: next => { value = next } } }
const api = {}
const source = ts.transpileModule(readFileSync('src/ui/HojaNombreListaNativa.ios.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
new Function('exports', 'require', source)(api, id => {
  if (id === 'react') return { useEffect: fn => fn() }
  if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx }
  if (id === '@expo/ui/swift-ui') return components
  if (id === '@expo/ui/swift-ui/modifiers') return new Proxy({}, { get: (_, name) => (...args) => ({ name, args }) })
  throw new Error(id)
})
function nodes(node, type) {
  if (Array.isArray(node)) return node.flatMap(n => nodes(n, type))
  if (!node || typeof node !== 'object') return []
  if (typeof node.type === 'function') return nodes(node.type(node.props), type)
  return [...(node.type === type ? [node] : []), ...nodes(node.props?.children, type)]
}
const hasDisabled = node => node.props.modifiers.some(m => m.name === 'disabled' && m.args[0])
test('iOS usa un solo sheet SwiftUI, campo y toolbar nativos; mantiene el presentador al cerrar', () => {
  let cancelled = 0
  const editor = { borrador: { valor: 'Lista', ocupado: false, error: null }, cancelar: () => cancelled++, cambiar() {}, guardar() {} }
  const tree = api.HojaNombreListaNativa({ editor })
  assert.equal(nodes(tree, 'BottomSheet').length, 1)
  assert.equal(nodes(tree, 'Modal').length, 0)
  assert.equal(nodes(tree, 'Form').length, 1)
  const input = nodes(tree, 'TextField')[0]
  assert.equal(input.props.maxLength, 60)
  assert.equal(input.props.autoFocus, true)
  assert.deepEqual(nodes(tree, 'Button').map(b => b.props.label), ['Cancelar', 'Guardar'])
  nodes(tree, 'BottomSheet')[0].props.onIsPresentedChange(false)
  assert.equal(cancelled, 1)
  const closed = api.HojaNombreListaNativa({ editor: { ...editor, borrador: null } })
  assert.equal(nodes(closed, 'BottomSheet')[0].props.isPresented, false)
  assert.equal(nodes(closed, 'Host').length, 1)
})
test('guardando bloquea campo, acciones y arrastre; vacío no permite guardar y el error queda en el formulario', () => {
  const editor = { borrador: { valor: 'Lista', ocupado: true, error: null }, cambiar() {}, guardar() {}, cancelar() {} }
  const tree = api.HojaNombreListaNativa({ editor })
  assert.ok(nodes(tree, 'Button').every(hasDisabled))
  assert.ok(hasDisabled(nodes(tree, 'TextField')[0]))
  assert.ok(nodes(tree, 'Group')[0].props.modifiers.some(m => m.name === 'interactiveDismissDisabled' && m.args[0]))
  assert.equal(nodes(tree, 'ProgressView').length, 1)
  editor.borrador = { valor: ' ', ocupado: false, error: 'No se pudo guardar.' }
  const retry = api.HojaNombreListaNativa({ editor })
  assert.ok(hasDisabled(nodes(retry, 'Button').find(b => b.props.label === 'Guardar')))
  assert.equal(nodes(retry, 'Section')[0].props.footer.props.children, 'No se pudo guardar.')
})
