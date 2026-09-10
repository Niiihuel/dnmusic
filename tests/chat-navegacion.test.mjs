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
    caraCentro: null, pistaSonando: null, caraSonando: null, pendientesChats: 0, leftCollapsed: true, rightCollapsed: true, showDetail: true,
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
  assert.equal(nodes(chat.tree, 'LinearGradient').length, 0, 'el velo de navegación no oscurece la cabecera propia del chat')
  assert.equal(nodes(navigation({ music: false, caraCentro: 'letra', pistaSonando: {} }).tree, 'LinearGradient').length, 1, 'al abrir letra sobre chat vuelve el velo del contenido')
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
      // El escritorio arrastra la ventana desde el encabezado; el control se sale de esa zona.
      './BandaVentana': { ARRASTRE_VENTANA: 'dn-arrastrar', SIN_ARRASTRE: 'dn-no-arrastrar' },
    })
    const button = BotonLateral({ label: 'Nueva conversación', icono: null, onPress: () => presses++ })
    assert.equal(button.props.onFocus, onFocus)
    assert.equal(button.props.accessibilityLabel, 'Nueva conversación')
    assert.equal(button.props.style.height, fine ? 32 : 44)
    assert.match(button.props.className, /dn-no-arrastrar/)
    button.props.onPress()
    assert.equal(presses, 1)
  }
})



test('la pestaña tocada antes de montar Inicio se entrega al registrar su controlador', () => {
  let current
  const store = {
    createStore(initial) {
      current = initial
      return {
        get: () => current,
        set: patch => { current = { ...current, ...patch } },
        subscribe: () => () => {},
      }
    },
    useStore: () => current,
  }
  const shell = compile(readFileSync('src/state/shell.ts', 'utf8'), { './store': store })
  const recibidas = []
  shell.setTab('chats')
  assert.equal(current.tab, 'chats')
  shell.registerTabHandler(tab => recibidas.push(tab))
  assert.deepEqual(recibidas, ['chats'])
  shell.registerTabHandler(null)
})

test('el botón Volver de iOS usa el chevron y un área estándar de 44 puntos', () => {
  const { BotonVolver } = compile(readFileSync('src/ui/BotonVolver.tsx', 'utf8'), {
    'react-native': { Platform: { OS: 'ios' }, Pressable: 'Pressable' },
    './Glass': { BotonVidrio: 'BotonVidrio' },
    './estadoControl': { estadoControlWeb: () => ({}) },
    './icons': { ICON_COLOR: { foreground: '#fff' }, IconChevronLeft: 'IconChevronLeft' },
  })
  const boton = BotonVolver({ onPress() {} })
  assert.equal(boton.type, 'BotonVidrio')
  assert.equal(boton.props.style.width, 44)
  assert.equal(boton.props.style.height, 44)
  assert.equal(boton.props.children.type, 'IconChevronLeft')
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


test('el desvanecido superior del chat vive dentro del hilo y no sobre avatar/nombre', () => {
  const start = index.indexOf('<Movible style={[{ flex: 1, minHeight: 0 }, seguirTeclado]}>')
  const end = index.indexOf('</Movible>', start) + '</Movible>'.length
  assert.ok(start >= 0 && end > start)
  for (const suelto of [false, true]) {
    const globals = {
      suelto, seguirTeclado: null, hilo: {}, messages: [], pisoChat: 80, draft: {}, cargandoMensajes: false, contactName: 'Cuenta local',
      ...Object.fromEntries(['Movible', 'FlatList', 'LinearGradient', 'View', 'SkeletonList', 'EmptyThread', 'ChatBubble'].map(k => [k, k])),
      ubicarHiloAlFinal() {}, alSoltarHilo() {},
    }
    const { render } = compile(`export function render(){return (${index.slice(start, end)})}`, {}, globals)
    const tree = render()
    assert.equal(tree.type, 'Movible')
    const list = nodes(tree, 'FlatList')[0], gradient = nodes(tree, 'LinearGradient')[0]
    assert.ok(list && gradient)
    assert.equal(gradient.props.style.top, 0)
    assert.equal(gradient.props.style.height, 24)
    assert.equal(gradient.props.pointerEvents, 'none')
    assert.equal(nodes(tree, 'Avatar').length, 0)
    assert.equal(list.props.onContentSizeChange, globals.ubicarHiloAlFinal)
    assert.equal(list.props.contentContainerStyle.paddingBottom, 172)
    assert.equal(list.props.showsVerticalScrollIndicator, !suelto)
  }
})
