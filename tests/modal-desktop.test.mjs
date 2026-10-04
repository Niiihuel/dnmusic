import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const { JSDOM } = createRequire(new URL('../desktop/package.json', import.meta.url))('jsdom')

// Real React, Motion and RN Web portal/focus trap. Layout is tested in Chrome;
// this fixture checks drafts, controlled closing and resize observer lifecycle.
test('modal PC: conserva borrador al redimensionar, respeta cierre bloqueado y restaura foco', async t => {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true, url: 'http://localhost/' })
  const observers = new Set()
  let contentHeight = 240
  const globals = {
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    Node: dom.window.Node, ShadowRoot: dom.window.ShadowRoot, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, SVGElement: dom.window.SVGElement,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class {
      constructor(fn) { this.fn = fn }
      observe(node) { this.node = node; observers.add(this) }
      disconnect() { observers.delete(this) }
    },
  }
  dom.window.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} })
  const saved = new Map(Object.keys(globals).map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]))
  for (const [k, value] of Object.entries(globals)) Object.defineProperty(globalThis, k, { value, configurable: true, writable: true })
  Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetHeight', { get() { return this.classList.contains('dn-modal-content') ? contentHeight : 20 } })
  const React = require('react'), { act } = React
  const { createRoot } = require('react-dom/client')
  const rn = require('react-native-web'), motion = require('motion/react')
  const cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const exports = {}
    cache.set(file, exports)
    const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
    new Function('exports', 'require', code)(exports, id => {
      if (id === 'react-native') return rn
      if (id === 'motion/react') return motion
      if (id.startsWith('./')) return load(`src/ui/${id.slice(2)}.ts`)
      return require(id)
    })
    return exports
  }
  const { ModalEscritorio } = load('src/ui/ModalEscritorio.web.tsx')
  const root = createRoot(document.getElementById('root'))
  t.after(async () => {
    await act(async () => root.unmount())
    assert.equal(observers.size, 0)
    dom.window.close()
    for (const [k, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k] }
  })
  let setVisible, allowClose = false, closeRequests = 0
  function App() {
    const [visible, changeVisible] = React.useState(false)
    setVisible = changeVisible
    return React.createElement(React.Fragment, null,
      React.createElement('button', { id: 'open', onClick: () => changeVisible(true) }, 'Abrir'),
      React.createElement(ModalEscritorio, { visible, titulo: 'Borrador', onCerrar() { closeRequests++; if (allowClose) changeVisible(false) } },
        React.createElement('input', { 'aria-label': 'Nombre', defaultValue: 'Original' }),
        React.createElement('button', { onClick() {} }, 'Guardar')))
  }
  const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 80)) })
  await act(async () => root.render(React.createElement(App)))
  const trigger = document.getElementById('open')
  trigger.focus()
  await act(async () => trigger.click())
  await settle()
  const panel = document.querySelector('[data-dn-modal]')
  assert.ok(panel)
  assert.equal(document.querySelector('[role=dialog]').getAttribute('aria-label'), 'Borrador')
  assert.equal(document.querySelector('.dn-modal-size').style.height, '240px')
  const input = panel.querySelector('input')
  input.value = 'Mi borrador'
  input.focus()
  contentHeight = 580
  await act(async () => { for (const o of observers) o.fn([{ target: o.node }]) })
  await settle()
  assert.equal(document.querySelector('.dn-modal-size').style.height, '580px')
  assert.equal(panel.querySelector('input'), input, 'redimensionar no remonta el formulario')
  assert.equal(input.value, 'Mi borrador')
  assert.equal(document.activeElement, input)
  const escape = () => document.dispatchEvent(new dom.window.KeyboardEvent('keyup', { key: 'Escape', bubbles: true }))
  await act(async () => escape())
  assert.equal(closeRequests, 1)
  assert.ok(document.querySelector('[data-dn-modal]'), 'la guardia decide si cerrar')
  allowClose = true
  await act(async () => escape())
  await settle()
  assert.equal(document.querySelector('[data-dn-modal]'), null)
  assert.equal(document.activeElement, trigger)
  assert.equal(observers.size, 0, 'sin observadores cuando el modal está cerrado')
  await act(async () => setVisible(true))
  await settle()
  assert.ok(document.querySelector('[role=dialog]'), 'puede volver a abrirse')
})
