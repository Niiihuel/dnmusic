import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import React, { act } from 'react'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const requireDesktop = createRequire(new URL('../desktop/package.json', import.meta.url))

function load(file, deps) {
  const exports = {}
  const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } })
  new Function('exports', 'require', outputText)(exports, id => {
    assert.ok(id in deps, `Dependencia inesperada: ${id}`)
    return deps[id]
  })
  return exports
}

test('mouse web agrupa arrastres y conserva el texto numérico durante renders', async t => {
  const { JSDOM } = requireDesktop('jsdom')
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true })
  const globals = {
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    Node: dom.window.Node, ShadowRoot: dom.window.ShadowRoot,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element,
    SVGElement: dom.window.SVGElement,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
  }
  dom.window.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} })
  dom.window.ResizeObserver = globals.ResizeObserver
  const saved = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key,
    { value, configurable: true, writable: true })
  const rn = require('react-native-web')
  const jsx = require('react/jsx-runtime')
  const svg = ({ children }) => React.createElement('svg', null, children)
  const svgChild = tag => function SvgChild(props) { return React.createElement(tag, props) }
  const helpers = load('src/lib/mixAutomationEdit.ts', {})
  const { MixAutomationEditor } = load('src/ui/MixAutomationCurve.tsx', {
    react: React, 'react/jsx-runtime': jsx, 'react-native': rn,
    'react-native-svg': { __esModule: true, default: svg, Circle: svgChild('circle'),
      Line: svgChild('line'), Path: svgChild('path') },
    '../lib/mixEffectPresets': { envelopeAt: () => 0 },
    '../lib/mixAutomationEdit': helpers,
  })
  const { createRoot } = require('react-dom/client')
  const root = createRoot(dom.window.document.getElementById('root'))
  t.after(async () => {
    await act(async () => root.unmount())
    dom.window.close()
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  })
  const events = []
  let unrelatedUpdate, hideEditor, latestDraft
  function Fixture() {
    const [draft, setDraft] = React.useState({ preset: 'fade', durationMs: 8_000,
      fromCueMs: 10_000, toCueMs: 0, volumeLaw: 'linear', volumeOut: null,
      volumeIn: null, eqSettings: null, filterSettings: null })
    const [visible, setVisible] = React.useState(true)
    latestDraft = draft
    unrelatedUpdate = () => setDraft(previous => ({ ...previous, fromCueMs: previous.fromCueMs + 1 }))
    hideEditor = () => setVisible(false)
    return visible ? React.createElement(MixAutomationEditor, { draft, deck: 'out', view: 'volume', canEdit: true,
      onGestureStart: () => events.push('start'), onGestureEnd: () => events.push('end'),
      onChange: next => { events.push('change'); setDraft(next) } }) : null
  }
  await act(async () => root.render(React.createElement(Fixture)))
  const graph = dom.window.document.querySelector('[aria-label^="Curva de volumen"]')
  assert.ok(graph, dom.window.document.body.innerHTML.slice(0, 1000))
  graph.getBoundingClientRect = () => ({ left: 0, top: 0, width: 320, height: 184, right: 320, bottom: 184 })
  const mouse = (type, x, y, target = graph) => target.dispatchEvent(new dom.window.MouseEvent(type,
    { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }))

  await act(async () => { mouse('mousedown', 19, 17); mouse('mouseup', 19, 17) })
  assert.deepEqual(events, [])

  await act(async () => { mouse('mousedown', 160, 120); mouse('mouseup', 160, 120) })
  assert.deepEqual(events, ['change'])
  events.length = 0

  await act(async () => {
    mouse('mousedown', 19, 17)
    mouse('mousemove', 19, 50)
    mouse('mousemove', 19, 80)
    mouse('mouseup', 19, 80)
  })
  assert.deepEqual(events, ['start', 'change', 'change', 'end'])

  events.length = 0
  await act(async () => {
    mouse('mousedown', 19, 80)
    mouse('mousemove', 19, 100)
    mouse('mouseup', 19, 100, dom.window.document.body)
  })
  assert.equal(events.filter(event => event === 'start').length, 1)
  assert.equal(events.filter(event => event === 'end').length, 1)

  events.length = 0
  await act(async () => {
    mouse('mousedown', 19, 100)
    mouse('mousemove', 19, 120)
    dom.window.dispatchEvent(new dom.window.Event('blur'))
  })
  assert.equal(events.filter(event => event === 'start').length, 1)
  assert.equal(events.filter(event => event === 'end').length, 1)

  const valueInput = dom.window.document.querySelector('input[aria-label^="Valor del punto"]')
  assert.ok(valueInput)
  await act(async () => valueInput.focus())
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set
    setter.call(valueInput, '42')
    valueInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  })
  assert.equal(valueInput.value, '42')
  await act(async () => unrelatedUpdate())
  assert.equal(valueInput.value, '42', 'un render ajeno no borra el texto mientras se escribe')
  await act(async () => valueInput.blur())
  assert.equal(latestDraft.volumeOut[0].value, 0.42)

  events.length = 0
  await act(async () => {
    mouse('mousedown', 19, 103)
    mouse('mousemove', 19, 80)
  })
  assert.equal(events.filter(event => event === 'start').length, 1)
  await act(async () => hideEditor())
  assert.equal(events.filter(event => event === 'end').length, 1, 'desmontar cierra el grupo abierto')
})

test('arrastrar un círculo SVG con la gráfica desplazada sólo mueve ese punto', async t => {
  const { JSDOM } = requireDesktop('jsdom')
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true })
  const globals = {
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    Node: dom.window.Node, ShadowRoot: dom.window.ShadowRoot,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element,
    SVGElement: dom.window.SVGElement,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
  }
  dom.window.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} })
  dom.window.ResizeObserver = globals.ResizeObserver
  const saved = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key,
    { value, configurable: true, writable: true })
  const rn = require('react-native-web')
  const jsx = require('react/jsx-runtime')
  const svg = ({ children }) => React.createElement('svg', null, children)
  const svgChild = tag => function SvgChild(props) { return React.createElement(tag, props) }
  const helpers = load('src/lib/mixAutomationEdit.ts', {})
  const { MixAutomationEditor, webGraphCoordinates } = load('src/ui/MixAutomationCurve.tsx', {
    react: React, 'react/jsx-runtime': jsx, 'react-native': rn,
    'react-native-svg': { __esModule: true, default: svg, Circle: svgChild('circle'),
      Line: svgChild('line'), Path: svgChild('path') },
    '../lib/mixEffectPresets': { envelopeAt: () => 0 },
    '../lib/mixAutomationEdit': helpers,
  })
  const { createRoot } = require('react-dom/client')
  const root = createRoot(dom.window.document.getElementById('root'))
  t.after(async () => {
    await act(async () => root.unmount())
    dom.window.close()
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  })

  const events = []
  let latestDraft
  const initial = [{ t: 0, value: 1 }, { t: 0.25, value: 0.75 }, { t: 0.5, value: 0.5 },
    { t: 0.75, value: 0.25 }, { t: 1, value: 0 }]
  function Fixture() {
    const [draft, setDraft] = React.useState({ preset: 'custom', durationMs: 8_000,
      fromCueMs: 10_000, toCueMs: 0, volumeLaw: 'linear', volumeOut: initial,
      volumeIn: null, eqSettings: null, filterSettings: null })
    latestDraft = draft
    return React.createElement(MixAutomationEditor, { draft, deck: 'out', view: 'volume', canEdit: true,
      height: 360, onGestureStart: () => events.push('start'), onGestureEnd: () => events.push('end'),
      onChange: next => { events.push('change'); setDraft(next) } })
  }
  await act(async () => root.render(React.createElement(Fixture)))
  const graph = dom.window.document.querySelector('[aria-label^="Curva de volumen"]')
  assert.ok(graph)
  const bounds = { left: 123.5, top: 225, width: 585, height: 360, right: 708.5, bottom: 585 }
  graph.getBoundingClientRect = () => bounds
  // locationX/Y pueden venir del círculo (7,7); pageX/Y ubican el gesto en
  // el View de 585 px. También probamos clientX/Y y scroll de la página.
  assert.deepEqual(webGraphCoordinates({ pageX: 416, pageY: 405, locationX: 7, locationY: 7 },
    bounds, 585, 360), { x: 292.5, y: 180 })
  assert.deepEqual(webGraphCoordinates({ clientX: 445, clientY: 460, pageX: 0, pageY: 0 },
    bounds, 585, 360), { x: 321.5, y: 235 })
  assert.deepEqual(webGraphCoordinates({ pageX: 466, pageY: 505 }, bounds, 585, 360, 50, 100),
    { x: 292.5, y: 180 })
  assert.equal(webGraphCoordinates({ locationX: 7, locationY: 7 }, bounds, 585, 360), null)
  // RN Web obtiene el ancho mediante onLayout; JSDOM no mide el tamaño CSS.
  await act(async () => graph.__reactLayoutHandler({ nativeEvent: { layout: { width: 585, height: 360 } } }))
  const middle = graph.querySelectorAll('circle')[2]
  assert.ok(middle)
  middle.getBoundingClientRect = () => ({ left: 409, top: 398, width: 14, height: 14,
    right: 423, bottom: 412 })
  const mouse = (type, x, y) => middle.dispatchEvent(new dom.window.MouseEvent(type,
    { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }))
  await act(async () => {
    mouse('mousedown', 416, 405)
    mouse('mousemove', 445, 460)
    mouse('mouseup', 445, 460)
  })
  assert.deepEqual(events, ['start', 'change', 'end'])
  assert.equal(latestDraft.volumeOut.length, 5)
  assert.deepEqual(latestDraft.volumeOut[1], initial[1])
  assert.ok(Math.abs(latestDraft.volumeOut[2].t - 0.553) < 0.002)
  assert.ok(Math.abs(latestDraft.volumeOut[2].value - 0.331) < 0.005)
  assert.deepEqual(latestDraft.volumeOut[3], initial[3])
})
