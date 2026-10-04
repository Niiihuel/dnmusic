import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const { JSDOM } = createRequire(new URL('../desktop/package.json', import.meta.url))('jsdom')
const transpile = path => ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText
const formatClock = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`

function modulo(path, deps) {
  const exports = {}
  new Function('exports', 'require', transpile(path))(exports, name => {
    if (name in deps) return deps[name]
    throw Error(`Dependencia inesperada ${name}`)
  })
  return exports
}

test('onda web: teclado en segundos, arrastre sin seeks intermedios y seguimiento accesible sin renders', async t => {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true })
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    IS_REACT_ACT_ENVIRONMENT: true }
  const originals = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  const React = require('react'), { createRoot } = require('react-dom/client')
  const { observeSeekInput } = modulo('src/ui/seekInput.web.ts', {})
  const { ControlOnda } = modulo('src/ui/ControlOnda.web.tsx', {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    './seekInput.web': { observeSeekInput }, './tiempos': { formatClock },
  })
  const callbacks = new Map(), seeks = [], previews = []
  const position = { value: 40_000, addListener: (id, fn) => callbacks.set(id, fn), removeListener: id => callbacks.delete(id) }
  const root = createRoot(dom.window.document.getElementById('root'))
  t.after(async () => {
    await React.act(() => root.unmount())
    dom.window.close()
    for (const [key, desc] of originals) { if (desc) Object.defineProperty(globalThis, key, desc); else delete globalThis[key] }
  })
  await React.act(() => root.render(React.createElement(ControlOnda, { etiqueta: 'Tema', posicionMs: position,
    desdeMs: 30_000, duracionMs: 60_000, activa: true, onSeek: f => seeks.push(f), onPreview: f => previews.push(f) })))
  const input = dom.window.document.querySelector('input')
  assert.equal(input.getAttribute('aria-valuetext'), '0:10 / 1:00')
  callbacks.forEach(fn => fn(60_000))
  assert.equal(input.value, '0.5')
  assert.equal(input.getAttribute('aria-valuetext'), '0:30 / 1:00', 'el reloj accesible sigue la onda sin renderizar React')
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }))
  assert.ok(Math.abs(seeks.at(-1) - 35 / 60) < 0.001, 'cinco segundos, sin depender de la duración del tema')
  const anteriores = seeks.length
  input.dispatchEvent(new dom.window.Event('pointerdown'))
  for (const value of [0.6, 0.7, 0.8]) { input.value = String(value); input.dispatchEvent(new dom.window.Event('input')) }
  assert.equal(seeks.length, anteriores)
  callbacks.forEach(fn => fn(61_000))
  assert.equal(input.value, '0.8', 'el motor no pisa el arrastre')
  input.dispatchEvent(new dom.window.Event('pointerup'))
  input.dispatchEvent(new dom.window.Event('change'))
  assert.deepEqual(seeks.slice(anteriores), [0.8])
  assert.equal(previews.at(-1), 0.8)
  await React.act(() => root.unmount())
  assert.equal(callbacks.size, 0)
  // El cleanup de after necesita un root ya desmontado válido.
})

test('onda nativa: VoiceOver usa la posición actual, respeta el tramo y no trabaja en segundo plano', t => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  let foreground = true, cursor = 0
  const slots = [], cleanups = [], effects = [], seeks = []
  const { ControlOnda } = modulo('src/ui/ControlOnda.tsx', {
    react: {
      useState(initial) { const i = cursor++; slots[i] ??= typeof initial === 'function' ? initial() : initial;
        return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value }] },
      useEffect(fn) { effects.push(fn) },
    },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) }, 'react-native': { View: 'View' },
    '../lib/appActiva': { useAppActiva: () => foreground }, './tiempos': { formatClock },
  })
  const posicionMs = { value: 40_000 }, props = { etiqueta: 'Tema', posicionMs,
    desdeMs: 30_000, duracionMs: 60_000, activa: true, onSeek: f => seeks.push(f), onPreview() {} }
  const render = () => { cleanups.splice(0).forEach(fn => fn?.()); cursor = 0; const ui = ControlOnda(props);
    effects.splice(0).forEach(fn => cleanups.push(fn())); return ui }
  let ui = render()
  t.mock.timers.tick(500); ui = render()
  assert.equal(ui.props.accessibilityValue.text, '0:10 / 1:00')
  posicionMs.value = 88_000
  ui.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } })
  assert.equal(seeks.at(-1), 1, 'usa el audio actual, no el readout anterior')
  posicionMs.value = 31_000
  ui.props.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } })
  assert.equal(seeks.at(-1), 0)
  foreground = false; ui = render(); posicionMs.value = 70_000; t.mock.timers.tick(5000)
  assert.equal(render().props.accessibilityValue.text, '0:10 / 1:00', 'no mantiene un reloj oculto')
  cleanups.forEach(fn => fn?.())
})


test('recorte de onda: teclado y VoiceOver ajustan el cue, y solo lectura impide editarlo', () => {
  for (const platform of ['web', 'ios', 'android']) {
    let width = 0
    const cambios = [], enabled = []
    const gesture = () => {
      const chain = new Proxy({}, { get: (_, name) => (...args) => { if (name === 'enabled') enabled.push(args[0]); return chain } })
      return chain
    }
    const { Waveform } = modulo('src/ui/Waveform.tsx', {
      react: { useEffect() {}, useMemo: fn => fn(), useState: initial => [typeof initial === 'number' ? width : initial, next => { if (typeof next === 'number') width = next }] },
      'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
      'react-native': { Platform: { OS: platform }, View: 'View', Text: 'Text' },
      'react-native-gesture-handler': { Gesture: { Pan: gesture, Tap: gesture, Race: (...items) => items }, GestureDetector: 'GestureDetector' },
      'react-native-svg': { __esModule: true, default: 'Svg', Path: 'Path' },
      'react-native-reanimated': { __esModule: true, default: { View: 'AnimatedView' }, runOnJS: fn => fn,
        useAnimatedStyle: fn => fn(), useSharedValue: value => ({ value, set(next) { this.value = next } }) },
      './Onda': { BARRA: 2, HUECO: 3, remuestrear: values => values, trazoDeBarras: () => 'M0 0v1' },
      './Glass': { BotonVidrio: 'Button' },
      '../lib/mixSpectrum': {},
      '../lib/mixWaveformZoom': { CUE_FINE_STEP_MS: 100, stepMixCue: (value, delta, max) => Math.max(0, Math.min(max, value + delta)) },
    })
    const props = { peaks: [0.1, 0.5, 0.2], durationMs: 10000, windowMs: 2000, startMs: 1500,
      label: 'Tema', onChangeStart: ms => cambios.push(ms) }
    const render = patch => { const selected = Waveform({ ...props, ...patch }); return selected.type(selected.props) }
    render().props.onLayout({ nativeEvent: { layout: { width: 300 } } })
    const view = render().props.children
    assert.equal(view.props.accessibilityLabel, 'Inicio del fragmento de Tema')
    view.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } })
    assert.equal(cambios.at(-1), 1600)
    if (platform === 'web') {
      view.props.onKeyDown({ key: 'ArrowRight', shiftKey: true, preventDefault() {} })
      assert.equal(cambios.at(-1), 2500)
      view.props.onKeyDown({ key: 'End', preventDefault() {} })
      assert.equal(cambios.at(-1), 8000)
    }
    enabled.length = 0
    const readonly = render({ editable: false }).props.children
    const before = cambios.length
    readonly.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } })
    assert.equal(cambios.length, before)
    assert.equal(readonly.props.accessibilityRole, 'image')
    assert.equal(readonly.props.tabIndex, undefined)
    assert.ok(enabled.every(value => value === false), 'sin edición ni scrub no hay gestos activos')
  }
})
