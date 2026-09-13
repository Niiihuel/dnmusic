import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

/** Execute the real component with an observable Window Controls Overlay. */
function cargar({ overlay = true, visible = true, web = true, rect = { x: 138, y: 0, width: 1042, height: 38 } } = {}) {
  const state = { visible, rect }
  const listeners = new Set()
  let snapshot, unsubscribe, updates = 0
  const native = {
    get visible() { return state.visible }, getTitlebarAreaRect: () => state.rect,
    addEventListener(type, fn) { assert.equal(type, 'geometrychange'); listeners.add(fn) },
    removeEventListener(type, fn) { assert.equal(type, 'geometrychange'); listeners.delete(fn) },
  }
  const { outputText } = ts.transpileModule(readFileSync('src/ui/BandaVentana.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  })
  const exports = {}
  new Function('exports', 'require', 'navigator', outputText)(exports, id => {
    if (id === './Glass') return { ES_WEB: web }
    if (id === 'react-native') return { View: 'View' }
    if (id === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }) }
    if (id === 'react') return { useSyncExternalStore(subscribe, getSnapshot) {
      snapshot = getSnapshot
      unsubscribe ??= subscribe(() => updates++)
      return snapshot()
    } }
    throw Error(id)
  }, overlay ? { windowControlsOverlay: native } : {})
  return { ...exports, state, render: () => exports.BandaVentana(),
    change(patch) { Object.assign(state, patch); for (const listener of listeners) listener() },
    get updates() { return updates }, get listenerCount() { return listeners.size }, stop: () => unsubscribe?.() }
}

test('ordinary browser tabs and native mobile reserve no titlebar, even when the API exists', () => {
  for (const options of [{ overlay: false }, { visible: false }, { web: false }]) {
    const f = cargar(options)
    assert.equal(f.HAY_BANDA_VENTANA, false)
    assert.equal(f.ARRASTRE_VENTANA, '')
    assert.equal(f.SIN_ARRASTRE, '')
    assert.equal(f.render(), null)
    f.stop()
  }
})

test('left, right and split native controls leave all app content below their real height', () => {
  for (const rect of [
    { x: 138, y: 0, width: 1042, height: 38 }, // Linux controls on the left
    { x: 0, y: 0, width: 1042, height: 38 }, // Windows controls on the right
    { x: 46, y: 2, width: 996, height: 36 }, // controls at both edges
  ]) {
    const f = cargar({ rect })
    const row = f.render()
    assert.equal(row.props.style.height, rect.y + rect.height)
    assert.equal(row.props.style.flexShrink, 0)
    assert.equal(row.props.style.position, undefined, 'in-flow reservation protects the logo below it')
    assert.deepEqual(row.props.children.props.style, { position: 'absolute', left: rect.x, top: rect.y, width: rect.width, height: rect.height })
    assert.equal(row.props.children.props.className, 'dn-arrastrar')
    f.stop()
  }
})

test('geometry/fullscreen changes resize or remove the reserved row and subscription cleans up', () => {
  const f = cargar()
  assert.equal(f.render().props.style.height, 38)
  f.change({ rect: { x: 0, y: 0, width: 1260, height: 32 } })
  assert.equal(f.render().props.style.height, 32)
  f.change({ visible: false })
  assert.equal(f.render(), null)
  f.change({ visible: true })
  assert.equal(f.render().props.style.height, 32)
  assert.equal(f.updates, 3)
  assert.equal(f.listenerCount, 1)
  f.stop()
  assert.equal(f.listenerCount, 0)
})

test('RootLayout reserves the row once for every route; login no longer overlays another drag area', () => {
  const layout = readFileSync('app/_layout.tsx', 'utf8')
  assert.equal((layout.match(/<BandaVentana\s*\/>/g) ?? []).length, 1)
  assert.match(layout, /<BandaVentana \/>\s*<View style=\{\{ flex: 1, minHeight: 0 \}\}>\s*<ControlActualizaciones>/)
  assert.doesNotMatch(readFileSync('src/ui/Acceso.tsx', 'utf8'), /ARRASTRE_SUPERIOR|dn-arrastre-superior/)
})

test('native window controls and header drag exclusions are retained', () => {
  const main = readFileSync('desktop/src/main.ts', 'utf8')
  assert.match(main, /titleBarStyle: 'hidden'/)
  assert.match(main, /titleBarOverlay: \{ color: '#121212', symbolColor: '#B3B3B3', height: BANDA_VENTANA \}/)
  assert.match(main, /const BANDA_VENTANA = 38/)
  const header = readFileSync('src/ui/CabeceraLateral.shared.tsx', 'utf8')
  assert.match(header, /CabeceraLateral[\s\S]*?\$\{ARRASTRE_VENTANA\}/)
  assert.match(header, /BotonLateral[\s\S]*?\$\{SIN_ARRASTRE\}/)
  const css = readFileSync('global.css', 'utf8')
  assert.match(css, /\.dn-arrastrar[\s\S]*?-webkit-app-region:\s*drag/)
  assert.match(css, /\.dn-no-arrastrar[\s\S]*?-webkit-app-region:\s*no-drag/)
})
