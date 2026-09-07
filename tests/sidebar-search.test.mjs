import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const jsx = (type, props) => ({ type, props })
const runtime = { jsx, jsxs: jsx }
function cargar(path, dependencies, globals = {}) {
  const { outputText } = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  })
  const exports = {}
  new Function('exports', 'require', ...Object.keys(globals), outputText)(exports, (id) => {
    if (id === 'react/jsx-runtime') return runtime
    if (id in dependencies) return dependencies[id]
    throw Error(id)
  }, ...Object.values(globals))
  return exports
}
function nodos(node, type) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap((n) => nodos(n, type))
  return [...(node.type === type ? [node] : []), ...nodos(node.props?.children, type)]
}
function search(fine) {
  return cargar('src/ui/SearchField.tsx', {
    react: { useState: (initial) => [initial, () => {}] },
    'react-native': Object.fromEntries(['View', 'TextInput', 'Pressable', 'ActivityIndicator'].map((k) => [k, k])),
    '../lib/teclado': { TECLADO_FISICO: fine }, './Glass': { ES_WEB: true, HAY_VIDRIO: true, Glass: 'Glass' },
    './icons': { ICON_COLOR: { muted: '#aaa' }, IconSearch: 'IconSearch', IconClose: 'IconClose' },
  }).SearchField
}

test('búsqueda compacta conserva texto, submit, ref y limpiar sin expulsar el botón del layout', () => {
  const cambios = [], inputRef = { current: null }, onSubmit = () => {}
  const ui = search(true)({ density: 'compact', value: 'Una búsqueda muy larga que supera el ancho del sidebar', onChangeText: (s) => cambios.push(s), inputRef, onSubmit, placeholder: 'Buscar', accessibilityLabel: 'Buscar canciones y artistas' })
  assert.equal(ui.props.radius, 17)
  assert.equal(ui.props.children.props.style.height, 34)
  const campo = nodos(ui, 'TextInput')[0]
  assert.equal(campo.props.ref, inputRef)
  assert.equal(campo.props.onSubmitEditing, onSubmit)
  assert.equal(campo.props.accessibilityLabel, 'Buscar canciones y artistas')
  assert.equal(campo.props.style.minWidth, 0)
  assert.equal(campo.props.style.width, 0)
  campo.props.onChangeText('nuevo')
  const clear = nodos(ui, 'Pressable')[0]
  assert.equal(clear.props.style.flexShrink, 0)
  assert.equal(clear.props.style.width, 28)
  clear.props.onPress()
  assert.deepEqual(cambios, ['nuevo', ''])
})

test('puntero táctil conserva 44px y los campos regulares mantienen 48px; loading tiene espacio propio', () => {
  const props = { value: 'abc', onChangeText: () => {} }
  const tactil = search(false)({ ...props, density: 'compact' })
  assert.equal(tactil.props.children.props.style.height, 44)
  assert.equal(nodos(tactil, 'Pressable')[0].props.style.width, 44)
  assert.equal(search(true)(props).props.children.props.style.height, 48)
  const loading = search(true)({ ...props, density: 'compact', loading: true })
  assert.equal(nodos(loading, 'Pressable').length, 0)
  assert.equal(nodos(loading, 'ActivityIndicator').length, 1)
  const slot = nodos(loading, 'View').find((v) => v.props.children?.type === 'ActivityIndicator')
  assert.equal(slot.props.style.flexShrink, 0)
})

function scrollFixture(props = {}) {
  const effects = [], frames = new Map(), observed = [], listeners = new Map()
  let frameId = 0, disconnected = false
  const modulo = cargar('src/ui/ScrollArea.web.tsx', {
    react: { forwardRef: (fn) => fn, useRef: (current) => ({ current }), useCallback: (f) => f, useEffect: (f) => effects.push(f), useId: () => 'scroll-test' },
    'react-native': { ScrollView: 'ScrollView', View: 'View' },
  }, {
    requestAnimationFrame: (f) => { frames.set(++frameId, f); return frameId },
    cancelAnimationFrame: (id) => frames.delete(id),
    ResizeObserver: class { constructor(fn) { this.fn = fn; observed.push(this) } observe() {} disconnect() { disconnected = true } },
  })
  const native = { clientHeight: 200, scrollHeight: 1000, scrollTop: 0, id: '', firstElementChild: {}, classList: { add() {}, remove() {} }, addEventListener: (k, f) => listeners.set(k, f), removeEventListener: (k) => listeners.delete(k) }
  const thumb = { style: {}, contains: (target) => target === thumb }
  const attrs = {}, capture = new Set()
  const track = { style: {}, dataset: {}, setAttribute: (k, v) => { attrs[k] = v }, focus() {}, setPointerCapture: (id) => capture.add(id), hasPointerCapture: (id) => capture.has(id), releasePointerCapture: (id) => capture.delete(id), getBoundingClientRect: () => ({ top: 100 }) }
  const ref = { current: null }, instance = { getScrollableNode: () => native, scrollTo() {} }
  const contentSizes = [], scrollEvents = []
  const ui = modulo.ScrollArea({ children: 'filas', contentContainerStyle: { paddingBottom: 40 }, onContentSizeChange: (...args) => contentSizes.push(args), onScroll: (e) => scrollEvents.push(e), ...props }, ref)
  const inner = nodos(ui, 'ScrollView')[0], rail = nodos(ui, 'div').find((d) => d.props.role === 'scrollbar')
  inner.props.ref(instance)
  if (rail) {
    rail.props.ref.current = track
    rail.props.children.props.ref.current = thumb
  }
  const cleanup = effects[0]() ?? (() => {})
  const flush = () => { const fs = [...frames.values()]; frames.clear(); fs.forEach((f) => f()) }
  const pointer = (y, target = thumb) => ({ button: 0, pointerId: 7, clientY: y, target, currentTarget: track, preventDefault() {} })
  return { ...modulo, ui, inner, rail, native, track, thumb, attrs, ref, instance, cleanup, flush, pointer, observed, frames, listeners, contentSizes, scrollEvents, disconnected: () => disconnected }
}

test('barra superpuesta cubre inicio/final y contenido que entra sin división por cero', () => {
  const s = scrollFixture()
  assert.deepEqual(s.geometriaScrollbar(200, 1000, 800), { alto: 40, recorrido: 160, maximo: 800, top: 160 })
  assert.equal(s.geometriaScrollbar(200, 1000, -20).top, 0)
  assert.equal(s.geometriaScrollbar(200, 1000, 10000).top, 160)
  assert.equal(s.geometriaScrollbar(200, 1000000, 0).alto, 28)
  assert.deepEqual(s.geometriaScrollbar(0, 0, 0), { alto: 0, recorrido: 0, maximo: 0, top: 0 })
  s.native.scrollHeight = 150
  s.observed[0].fn(); s.flush()
  assert.equal(s.track.style.display, 'none')
  s.cleanup()
})

test('arrastrar, click en carril y teclado mueven el scroll real y actualizan ARIA', () => {
  const s = scrollFixture()
  s.rail.props.onPointerDown(s.pointer(110))
  s.rail.props.onPointerMove(s.pointer(150))
  assert.equal(s.native.scrollTop, 200)
  s.flush()
  assert.equal(s.attrs['aria-valuenow'], '200')
  assert.equal(s.thumb.style.transform, 'translateY(40px)')
  s.rail.props.onPointerUp(s.pointer(150))
  assert.equal(s.track.dataset.dragging, undefined)
  s.rail.props.onPointerMove(s.pointer(180))
  assert.equal(s.native.scrollTop, 200)
  s.rail.props.onPointerDown(s.pointer(200, s.track))
  assert.equal(s.native.scrollTop, 400)
  s.rail.props.onPointerUp(s.pointer(200))
  s.rail.props.onKeyDown({ key: 'End', preventDefault() {} })
  assert.equal(s.native.scrollTop, 800)
  s.rail.props.onKeyDown({ key: 'PageUp', preventDefault() {} })
  assert.equal(s.native.scrollTop, 600)
  s.rail.props.onKeyDown({ key: 'Home', preventDefault() {} })
  assert.equal(s.native.scrollTop, 0)
  s.cleanup()
})

test('preserva ref/eventos, sincroniza resize y elimina observers/listeners/frames al desmontar', () => {
  const s = scrollFixture()
  assert.equal(s.ref.current, s.instance)
  assert.deepEqual(s.inner.props.contentContainerStyle, { paddingBottom: 40 })
  s.inner.props.onContentSizeChange(220, 1500)
  assert.deepEqual(s.contentSizes, [[220, 1500]])
  const event = { nativeEvent: { contentOffset: { y: 30 } } }
  s.inner.props.onScroll(event)
  assert.equal(s.scrollEvents[0], event)
  s.native.scrollHeight = 1500
  s.observed[0].fn(); s.flush()
  assert.equal(s.attrs['aria-valuemax'], '1300')
  s.listeners.get('scroll')()
  s.rail.props.onPointerDown(s.pointer(110))
  assert.equal(s.track.hasPointerCapture(7), true)
  assert.equal(s.frames.size, 1)
  s.cleanup()
  assert.equal(s.track.hasPointerCapture(7), false)
  assert.equal(s.track.dataset.dragging, undefined)
  assert.equal(s.frames.size, 0)
  assert.equal(s.listeners.size, 0)
  assert.equal(s.disconnected(), true)
})


test('ocultar el indicador o deshabilitar el scroll impide foco, arrastre y teclado en la barra', () => {
  for (const props of [{ showsVerticalScrollIndicator: false }, { scrollEnabled: false }, { showsVerticalScrollIndicator: false, scrollEnabled: false }]) {
    const s = scrollFixture(props)
    assert.equal(s.inner.props.scrollEnabled, props.scrollEnabled ?? true)
    assert.equal(s.track.style.display, 'none')
    assert.equal(s.rail.props.hidden, true)
    assert.equal(s.rail.props['aria-hidden'], true)
    assert.equal(s.rail.props.tabIndex, -1)
    const pointer = s.pointer(200, s.track)
    pointer.preventDefault = () => assert.fail('la barra desactivada no intercepta el puntero')
    s.rail.props.onPointerDown(pointer)
    s.rail.props.onPointerMove(s.pointer(250))
    s.rail.props.onKeyDown({ key: 'End', preventDefault: () => assert.fail('no intercepta el teclado') })
    assert.equal(s.native.scrollTop, 0)
    assert.equal(s.track.hasPointerCapture(7), false)
    // Ocultar el indicador no bloquea el scroll programático ni sus eventos.
    s.native.scrollTop = 100
    s.listeners.get('scroll')(); s.flush()
    assert.equal(s.attrs['aria-valuenow'], '100')
    assert.equal(s.track.style.display, 'none')
    s.cleanup()
  }
})

test('horizontal conserva props, ref y ScrollView nativo sin indicador propio ni observers', () => {
  for (const enabled of [false, true]) {
    const props = { horizontal: true, scrollEnabled: enabled, showsVerticalScrollIndicator: enabled, showsHorizontalScrollIndicator: enabled, style: { height: 80 }, scrollEventThrottle: 32 }
    const s = scrollFixture(props)
    assert.equal(s.ui.type, 'ScrollView')
    assert.equal(s.rail, undefined)
    assert.equal(s.ref.current, s.instance)
    for (const [key, value] of Object.entries(props)) assert.equal(s.inner.props[key], value)
    assert.equal(s.observed.length, 0)
    assert.equal(s.listeners.size, 0)
    s.inner.props.onContentSizeChange(1500, 80)
    assert.deepEqual(s.contentSizes, [[1500, 80]])
    s.cleanup()
  }
})
