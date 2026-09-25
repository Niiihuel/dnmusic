import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const tick = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
const track = { id: 'song', videoId: 'song', title: 'Una canción', artist: 'Artista' }
function harness(path, dependencies) {
  const values = [], effectState = [], timers = new Map(); let cursor = 0, nextTimer = 0
  const pending = []
  const react = {
    useState(initial) { const i = cursor++; if (!(i in values)) values[i] = typeof initial === 'function' ? initial() : initial; return [values[i], v => { values[i] = typeof v === 'function' ? v(values[i]) : v }] },
    useRef(initial) { const i = cursor++; return values[i] ??= { current: initial } },
    useEffect(effect, deps) {
      const i = cursor++, old = effectState[i]
      if (!old || deps.some((d, j) => !Object.is(d, old.deps[j]))) pending.push(() => { old?.cleanup?.(); effectState[i] = { deps, cleanup: effect() } })
    },
  }
  const exports = {}, jsx = (type, props) => ({ type, props })
  const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('exports', 'require', 'setTimeout', 'clearTimeout', source)(exports, name => {
    if (name === 'react') return react
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    assert.ok(name in dependencies, `mock faltante: ${name}`); return dependencies[name]
  }, (f, delay) => { timers.set(++nextTimer, { f, delay }); return nextTimer }, id => timers.delete(id))
  return { exports, render(name) { cursor = 0; const result = exports[name](); pending.splice(0).forEach(f => f()); return result },
    runTimers(delay) { for (const [id, timer] of [...timers]) if (timer.delay === delay) { timers.delete(id); timer.f() } },
    timers, unmount() { effectState.forEach(e => e?.cleanup?.()) },
  }
}
function appState() {
  const listeners = new Set()
  return { currentState: 'active', addEventListener(_, f) { listeners.add(f); return { remove: () => listeners.delete(f) } },
    change(value) { this.currentState = value; [...listeners].forEach(f => f(value)) }, listeners }
}
function captureHook() {
  const app = appState(), listeners = new Set(), calls = []
  const state = { route: '/', tab: 'inicio', user: { id: 'a' }, access: { status: 'approved' }, keyboard: 0, drawer: false, chat: false, busy: false,
    playback: { index: 0, tracks: [track], manual: null } }
  const h = harness('src/ui/useOfertaCaptura.ts', {
    'react-native': { AppState: app, Platform: { OS: 'ios' } }, 'expo-router': { usePathname: () => state.route },
    '../state/playback': { getPlaybackState: () => state.playback },
    '../state/session': { getSession: () => state, useUser: () => state.access.status === 'approved' ? state.user : null },
    '../state/shell': { useTab: () => state.tab, useDrawer: () => state.drawer, useEnChat: () => state.chat, useKeyboardH: () => state.keyboard },
    './CompartirHistoria': { historiaEnCurso: () => state.busy, compartirHistoria: t => calls.push(t) },
    'expo-screen-capture': { addScreenshotListener(f) { listeners.add(f); return { remove: () => listeners.delete(f) } } },
  })
  return { ...h, state, calls, app, listeners, render: () => h.render('useOfertaCaptura'), capture: () => [...listeners].forEach(f => f()) }
}

test('captura ofrece la canción congelada; nunca comparte sola y un toque repetido no abre dos hojas', () => {
  const h = captureHook(); h.render(); h.capture()
  let ui = h.render(); assert.equal(ui.oferta.title, track.title); assert.equal(h.calls.length, 0)
  h.state.playback = { index: 0, tracks: [{ ...track, title: 'La siguiente' }] }
  ui.compartir(); ui.compartir()
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].title, track.title); assert.equal(h.render().oferta, null)
  h.unmount(); assert.equal(h.listeners.size, 0); assert.equal(h.app.listeners.size, 0); assert.equal(h.timers.size, 0)
})

test('capturas repetidas renuevan una oferta; caduca, no aparece en privado y no resurge al volver', () => {
  const h = captureHook(); h.render(); h.capture(); h.capture(); assert.equal(h.timers.size, 1)
  h.runTimers(8000); assert.equal(h.render().oferta, null)
  for (const patch of [{ tab: 'chats' }, { tab: 'perfil' }, { route: '/ajustes' }, { keyboard: 300 }, { drawer: true }, { chat: true }]) {
    Object.assign(h.state, { route: '/', tab: 'inicio', keyboard: 0, drawer: false, chat: false }); h.render(); h.capture(); assert.ok(h.render().oferta)
    Object.assign(h.state, patch); assert.equal(h.render().oferta, null); h.capture(); assert.equal(h.render().oferta, null)
    Object.assign(h.state, { route: '/', tab: 'inicio', keyboard: 0, drawer: false, chat: false }); assert.equal(h.render().oferta, null)
  }
  h.state.route = '/playing'; h.state.tab = 'chats'; h.state.chat = true; h.render(); h.capture(); assert.ok(h.render().oferta, 'playing es contexto musical aunque venga de Chats')
  h.unmount()
})

test('captura se cancela en segundo plano y valida sesión también al tocar un aviso viejo', () => {
  const h = captureHook(); h.render(); h.capture(); const old = h.render()
  h.state.user = { id: 'otra' }; old.compartir(); assert.equal(h.calls.length, 0)
  h.render(); h.capture(); assert.ok(h.render().oferta)
  h.app.change('inactive'); assert.equal(h.render().oferta, null); h.capture(); assert.equal(h.render().oferta, null)
  h.app.change('active'); h.state.busy = true; h.capture(); assert.equal(h.render().oferta, null)
  h.state.busy = false; h.state.access.status = 'pending'; h.capture(); assert.equal(h.render().oferta, null)
  h.unmount()
})

function sharingCard() {
  const app = appState(), calls = [], capture = deferred(), sharing = deferred(), alerts = []
  const session = { user: { id: 'a' }, access: { status: 'approved' } }
  const h = harness('src/ui/CompartirHistoria.tsx', {
    'react-native': { AppState: app, View: 'View' },
    'react-native-view-shot': { captureRef: (...args) => { calls.push(['capture', ...args]); return capture.promise }, releaseCapture: uri => calls.push(['release', uri]) },
    'expo-sharing': { isAvailableAsync: async () => true, shareAsync: (...args) => { calls.push(['share', ...args]); return sharing.promise } },
    '../state/session': { getSession: () => session, useUser: () => session.access.status === 'approved' ? session.user : null },
    '../lib/artwork': { artworkSource: (path, url) => url }, '../services/music': {}, '../state/aviso': { avisar: (...args) => alerts.push(args) },
    '../state/store': { createStore(initial) { let value = initial; return { get: () => value, set: v => { value = { ...value, ...v } } } }, useStore: (store, select) => select(store.get()) },
    '../lib/codigoQR': {}, '../lib/compartir': { linkDe: (_, id) => `https://example.test/${id}` },
    '../services/compartidos': { publicarCancion: async () => {} }, './Glass': { ES_WEB: false },
    './TarjetaHistoria': { TarjetaHistoria: 'TarjetaHistoria' }, './geometriaTarjetaHistoria': { ANCHO: 1080 },
  })
  return { ...h, app, calls, capture, sharing, alerts, session, render: () => h.render('CompartirHistoria') }
}

test('compartir nativo admite una única solicitud, espera su imagen propia y libera el PNG al cerrar', async () => {
  const h = sharingCard(); assert.equal(h.exports.compartirHistoria(track), true); assert.equal(h.exports.compartirHistoria({ ...track, id: 'otra' }), false)
  const ui = h.render(); assert.equal(ui.props.collapsable, false); assert.ok(ui.props.style.left < 0)
  h.runTimers(80); await tick(); assert.equal(h.calls.filter(c => c[0] === 'capture').length, 1)
  h.capture.resolve('file:///tmp/tarjeta.png'); await tick()
  assert.equal(h.calls.filter(c => c[0] === 'share').length, 1)
  assert.equal(h.calls.find(c => c[0] === 'share')[2].UTI, 'public.png')
  h.app.change('inactive'); assert.equal(h.exports.historiaEnCurso(), true, 'mantiene el cerrojo mientras el sistema comparte')
  h.sharing.resolve(); await tick(); assert.deepEqual(h.calls.at(-1), ['release', 'file:///tmp/tarjeta.png']); assert.equal(h.exports.historiaEnCurso(), false)
  h.unmount()
})

test('si la app queda inactiva durante la captura no presenta la hoja y limpia su archivo', async () => {
  const h = sharingCard(); h.exports.compartirHistoria(track); h.render(); h.runTimers(80); await tick()
  h.app.change('inactive'); h.capture.resolve('file:///tmp/tarjeta.png'); await tick()
  assert.equal(h.calls.some(c => c[0] === 'share'), false); assert.equal(h.exports.historiaEnCurso(), false)
  assert.deepEqual(h.calls.at(-1), ['release', 'file:///tmp/tarjeta.png']); h.unmount()
})

test('tapa que nunca carga tiene timeout y un nuevo pedido de la misma canción espera su nueva imagen', () => {
  const h = sharingCard(); const withArt = { ...track, artworkUrl: 'https://example.test/cover.png' }
  h.exports.compartirHistoria(withArt); h.render(); assert.equal([...h.timers.values()].some(t => t.delay === 80), false)
  h.runTimers(12000); assert.equal(h.exports.historiaEnCurso(), false); assert.equal(h.alerts.length, 1)
  h.render(); h.exports.compartirHistoria(withArt); h.render(); assert.equal([...h.timers.values()].some(t => t.delay === 80), false)
  h.unmount()
})


test('cambiar cuenta o revocar acceso durante preparación cancela la hoja aunque el await ya haya empezado', async () => {
  for (const change of [session => { session.user = { id: 'otra' } }, session => { session.access.status = 'pending' }]) {
    const h = sharingCard(); h.exports.compartirHistoria(track); h.render(); h.runTimers(80); await tick()
    change(h.session); h.capture.resolve('file:///tmp/tarjeta.png'); await tick()
    assert.equal(h.calls.some(c => c[0] === 'share'), false, 'revalida la sesión incluso sin nuevo render')
    assert.equal(h.exports.historiaEnCurso(), false); h.unmount()
  }
})

test('desmontar o cambiar cuenta antes de cargar la tapa libera la solicitud pendiente', () => {
  for (const cancelar of [h => h.unmount(), h => { h.session.user = { id: 'otra' }; h.render() }]) {
    const h = sharingCard(); h.exports.compartirHistoria({ ...track, artworkUrl: 'https://example.test/cover.png' }); h.render()
    assert.equal(h.exports.historiaEnCurso(), true); cancelar(h)
    assert.equal(h.exports.historiaEnCurso(), false); assert.equal(h.timers.size, 0)
  }
})
