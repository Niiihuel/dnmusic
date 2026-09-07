import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const jsx = (type, props) => ({ type, props })
function compile(source, dependencies = {}, globals = {}) {
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } })
  const exports = {}
  new Function('exports', 'require', ...Object.keys(globals), outputText)(exports, id => {
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' }
    if (id in dependencies) return dependencies[id]
    throw Error(id)
  }, ...Object.values(globals))
  return exports
}
function nodes(node, type) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(n => nodes(n, type))
  return [...(node.type === type ? [node] : []), ...nodes(node.props?.children, type)]
}
const index = readFileSync('app/index.tsx', 'utf8')
const start = index.indexOf('          {!suelto ? (\n            <View pointerEvents="box-none"')
assert.ok(start >= 0)
const end = index.indexOf('\n          {caraCentro', start)
const toolbar = index.slice(start, end)
function navigation(options = {}) {
  const calls = []
  const defaults = {
    suelto: false, music: true, canGoBack: true, canGoForward: true,
    caraSonando: null, pendientesChats: 0, leftCollapsed: true, rightCollapsed: true, showDetail: true,
    ICON_COLOR: {}, router: { push: route => calls.push(['route', route]) },
    ...Object.fromEntries(['LinearGradient', 'View', 'Text', 'BotonLateral', 'IconBack', 'IconForward', 'IconInbox', 'IconMusic', 'Menu'].map(k => [k, k])),
    ...Object.fromEntries(['toggleView', 'goBack', 'goForward', 'cambiarModo', 'dejarCara', 'changeGlobalSearch', 'setMusic', 'setStack', 'setAt', 'setLeftCollapsed', 'setRightPlegado', 'endSession'].map(k => [k, (...args) => calls.push([k, ...args])])),
  }
  const { render } = compile(`export function render(){return <>${toolbar}</>}`, {}, { ...defaults, ...options })
  const tree = render()
  return { tree, calls, button: label => nodes(tree, 'BotonLateral').find(n => n.props.label === label)?.props,
    menu: label => nodes(tree, 'Menu')[0].props.items.find(i => i.label === label) }
}

test('navegación del contenido conserva atrás y adelante independientes, con estado de historial', () => {
  const n = navigation()
  n.button('Atrás').onPress()
  n.button('Adelante').onPress()
  assert.deepEqual(n.calls, [['goBack'], ['goForward']])
  const empty = navigation({ canGoBack: false, canGoForward: false })
  assert.equal(empty.button('Atrás').disabled, true)
  assert.equal(empty.button('Adelante').disabled, true)
})

test('solo atrás/adelante flotan sobre el gradiente; no hay franja, inbox ni menú', () => {
  const n = navigation()
  assert.deepEqual(nodes(n.tree, 'BotonLateral').map(n => n.props.label), ['Atrás', 'Adelante'])
  assert.equal(nodes(n.tree, 'Menu').length, 0)
  const overlay = nodes(n.tree, 'View')[0]
  assert.equal(overlay.props.style.position, 'absolute')
  assert.equal(overlay.props.pointerEvents, 'box-none')
  assert.equal(nodes(n.tree, 'LinearGradient')[0].props.pointerEvents, 'none')
  const chat = navigation({ music: false })
  chat.button('Atrás').onPress()
  assert.deepEqual(chat.calls, [['cambiarModo']])
  assert.equal(nodes(navigation({ suelto: true }).tree, 'View').length, 0)
})

test('el control lateral conserva tooltip, foco, callback y 44px en táctil', () => {
  for (const fine of [true, false]) {
    let presses = 0
    const onFocus = () => {}
    const { BotonLateral } = compile(readFileSync('src/ui/CabeceraLateral.tsx', 'utf8'), {
      'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable' },
      '../lib/teclado': { TECLADO_FISICO: fine },
      './Tooltip': { useConTooltip: label => { assert.equal(label, 'Nueva conversación'); return { gestos: { onFocus } } } },
    })
    const button = BotonLateral({ label: 'Nueva conversación', icono: null, onPress: () => presses++ })
    assert.equal(button.props.onFocus, onFocus)
    assert.equal(button.props.accessibilityLabel, 'Nueva conversación')
    assert.equal(button.props.style.height, fine ? 32 : 44)
    button.props.onPress()
    assert.equal(presses, 1)
  }
})



test('el chat no afirma presencia con un rótulo fijo independiente de datos', () => {
  for (const path of ['app/index.tsx', 'src/ui/MessageDetailBody.tsx', 'src/ui/ChatBubble.tsx']) {
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const fixed = []
    function visit(node) {
      // Dynamic status expressions are intentionally allowed for the presence service.
      if (ts.isJsxElement(node)) {
        for (const child of node.children) {
          const literal = ts.isJsxText(child) ? child.text : ts.isJsxExpression(child) && child.expression && ts.isStringLiteral(child.expression) ? child.expression.text : ''
          if (/^en l[ií]nea[.!]?$/i.test(literal.trim())) fixed.push(literal)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    assert.deepEqual(fixed, [], path)
  }
})
