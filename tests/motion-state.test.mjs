import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function load(path, deps) {
  const exports = {}
  const { outputText } = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  new Function('exports', 'require', outputText)(exports, id => { assert.ok(id in deps, `dependency ${id}`); return deps[id] })
  return exports
}
function stateModule(path) {
  let state
  const api = load(path, { './store': {
    createStore(initial) { state = initial; return { get: () => state, set: patch => { state = { ...state, ...patch } } } },
    useStore: (_, selector) => selector(state),
  } })
  return { api, read: () => state }
}

test('tooltip: espera medio segundo en cada botón, conserva cruce y cancela pasos fugaces', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 10000 })
  const { api, read } = stateModule('src/state/tooltip.ts')
  const first = { owner: 'a', texto: 'Uno', x: 0, y: 0, w: 44, h: 44 }
  api.pedirTooltip(first)
  t.mock.timers.tick(499)
  assert.equal(read().tip, null)
  t.mock.timers.tick(1)
  assert.equal(read().tip.owner, 'a')
  api.soltarTooltip('a')
  api.pedirTooltip({ ...first, owner: 'b', texto: 'Dos' })
  assert.equal(read().tip, null, 'recorrer vecinos también requiere esperar')
  api.cerrarTooltip('a')
  api.soltarTooltip('a')
  t.mock.timers.tick(499)
  assert.equal(read().tip, null)
  t.mock.timers.tick(1)
  assert.equal(read().tip.owner, 'b', 'el control anterior no cancela la apertura nueva')
  api.soltarTooltip('b')
  t.mock.timers.tick(60)
  api.retenerTooltip()
  t.mock.timers.tick(2000)
  assert.equal(read().tip.owner, 'b', 'puede cruzarse y leerse sin tiempo límite')
  api.cerrarTooltip()
  assert.equal(read().tip, null)
  api.pedirTooltip(first)
  t.mock.timers.tick(250)
  api.soltarTooltip('a')
  t.mock.timers.tick(1000)
  assert.equal(read().tip, null, 'un paso fugaz no deja una apertura pendiente')
  api.pedirTooltip(first)
  t.mock.timers.tick(499)
  assert.equal(read().tip, null, 'reentrar también espera medio segundo')
  t.mock.timers.tick(1)
  assert.equal(read().tip.owner, 'a')
  api.cerrarTooltip()
  api.mostrarTooltipYa(first)
  assert.equal(read().tip.owner, 'a', 'el teclado conserva respuesta inmediata')
  api.cerrarTooltip()
})

test('copiar: no confirma antes de resolver; los errores permiten reintentar y las respuestas viejas no pisan la actual', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { api, read } = stateModule('src/state/copia.ts')
  const old = api.iniciarCopia('old')
  assert.equal(read().estado, 'pending')
  const recent = api.iniciarCopia('new')
  old(true)
  assert.equal(read().estado, 'pending')
  recent(false)
  assert.equal(read().estado, 'error')
  const retry = api.iniciarCopia('new')
  retry(true)
  assert.equal(read().estado, 'copied')
  t.mock.timers.tick(2000)
  assert.deepEqual(read(), { texto: null, estado: 'idle' }, 'libera también el texto copiado')
})

test('clipboard: fallo moderno + respaldo fallido nunca publica éxito y restaura foco', async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const originalDocument = globalThis.document, originalHTMLElement = globalThis.HTMLElement
  const results = [], events = []
  class Element { isConnected = true; focus() { events.push('restore') } }
  const previous = new Element()
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { async writeText() { throw Error('denied') } } } })
  globalThis.HTMLElement = Element
  globalThis.document = { activeElement: previous, body: { appendChild() {} }, execCommand() { return false },
    createElement() { return { style: {}, setAttribute() {}, focus() {}, select() {}, remove() { events.push('remove') } } } }
  try {
    const api = load('src/lib/portapapeles.ts', { 'react-native': { Platform: { OS: 'web' } }, '../state/copia': { iniciarCopia: () => ok => results.push(ok) } })
    assert.equal(await api.copiarAlPortapapeles('prueba'), false)
    assert.deepEqual(results, [false])
    assert.deepEqual(events, ['remove', 'restore'])
    globalThis.document.execCommand = () => true
    assert.equal(await api.copiarAlPortapapeles('prueba'), true)
    assert.deepEqual(results, [false, true])
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator)
    else delete globalThis.navigator
    globalThis.document = originalDocument; globalThis.HTMLElement = originalHTMLElement
  }
})

test('Lenis usa la firma DOM sin romper scrollTo de RN web y se apaga al reducir movimiento', () => {
  const saved = Object.fromEntries(['matchMedia','HTMLElement','requestAnimationFrame','cancelAnimationFrame'].map(key => [key, globalThis[key]]))
  const media = new Map(), engines = []
  let nativeCalls = 0, rnCalls = 0
  class Element {}
  globalThis.HTMLElement = Element
  globalThis.requestAnimationFrame = () => 1
  globalThis.cancelAnimationFrame = () => {}
  globalThis.matchMedia = query => {
    const item = { matches: query.includes('pointer'), listener: null,
      addEventListener(_, fn) { this.listener = fn }, removeEventListener() { this.listener = null } }
    media.set(query, item)
    return item
  }
  const node = { firstElementChild: new Element(), scrollTop: 0,
    scroll(options) { nativeCalls++; this.scrollTop = options.top },
    scrollTo(options) { rnCalls++; assert.ok('y' in options, 'RN no recibe la firma DOM'); this.scrollTop = options.y },
    addEventListener() {}, removeEventListener() {},
  }
  const original = node.scrollTo
  class Lenis {
    constructor(options) { this.options = options; engines.push(this) }
    scrollTo(top) { this.options.wrapper.scrollTo({ top, behavior: 'instant' }) }
    destroy() { this.destroyed = true }
  }
  try {
    const { attachSmoothScroll } = load('src/ui/smoothScroll.web.ts', { lenis: { __esModule: true, default: Lenis } })
    const controller = attachSmoothScroll(node)
    controller.scrollTo(500)
    assert.equal(node.scrollTop, 500)
    assert.equal(nativeCalls, 1)
    assert.equal(rnCalls, 0)
    node.scrollTo({ y: 120, animated: false })
    assert.equal(node.scrollTop, 120)
    assert.equal(rnCalls, 1, 'preserva la ref usada por la app')
    assert.equal(engines[0].options.syncTouch, false)
    assert.equal(engines[0].options.allowNestedScroll, true)
    const reduced = media.get('(prefers-reduced-motion: reduce)')
    reduced.matches = true; reduced.listener()
    assert.equal(engines[0].destroyed, true)
    controller.scrollTo(700)
    assert.equal(node.scrollTop, 700, 'sin animación sigue funcionando el teclado')
    controller.destroy()
    assert.equal(node.scrollTo, original)
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key]
      else globalThis[key] = value
    }
  }
})
