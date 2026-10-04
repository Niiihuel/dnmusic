import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { catalogoGeneros } from '../src/lib/catalogoEditorial.ts'

const jsx = (type, props) => ({ type, props })
const nodes = (n, type) => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(x => nodes(x, type)) : [...(n.type === type ? [n] : []), ...nodes(n.props?.children, type)]
function load(path, deps) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('exports', 'require', code)(exports, id => {
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    assert.ok(id in deps, id)
    return deps[id]
  })
  return exports
}
const stores = { createStore(initial) { let s = initial; return { get: () => s, set: v => { s = { ...s, ...v } } } }, useStore: (s, fn) => fn(s.get()) }
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r)) }
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
const track = { videoId: 'tema', title: 'Una canción', artist: 'Una banda', artistId: null, album: '', albumId: null, artworkUrl: 'https://img/tema', durationMs: 123000 }
const artist = { id: 'artista', name: 'Una banda', photoUrl: 'https://img/banda', subtitle: 'English provider subtitle' }
function recientes(initial, options = {}) {
  const writes = []
  const storage = {
    getItem: async key => key.endsWith('.v2') ? options.lectura ? options.lectura.promise : initial : options.legacy ?? null,
    setItem: async (key, value) => { writes.push({ key, value: JSON.parse(value) }); if (options.escritura) await options.escritura.promise },
  }
  return { api: load('src/state/recientes.ts', { '@react-native-async-storage/async-storage': storage, './store': stores }), writes }
}

test('entrar a Buscar puede abrir explorar sin foco; activar/cancelar conserva los otros usos', () => {
  const s = load('src/state/busqueda.ts', { './store': stores })
  s.abrirBusqueda('Canciones y artistas', false)
  assert.equal(s.useBuscando(), false)
  assert.equal(s.usePista(), 'Canciones y artistas')
  s.setActivo(true); assert.equal(s.useBuscando(), true)
  s.cerrarBusqueda(); assert.equal(s.useConsulta(), ''); assert.equal(s.useBuscando(), false)
  s.abrirBusqueda('Conversaciones'); assert.equal(s.useBuscando(), true)
})

test('recientes migran consultas v1, recuerdan entidades por identidad y no guardan URLs de audio', async () => {
  const { api, writes } = recientes(null, { legacy: JSON.stringify(['Zoé', ' zoé ', 8, null]) })
  await api.cargarRecientes()
  assert.deepEqual(api.useRecientes().map(r => r.termino), ['Zoé'])
  api.recordarCancion({ ...track, url: 'https://audio?token=privado' }); await flush()
  api.recordarArtista(artist); await flush()
  api.recordarCancion({ ...track, title: 'Título actualizado' }); await flush()
  assert.deepEqual(api.useRecientes().map(r => r.tipo), ['cancion', 'artista', 'consulta'])
  assert.equal(api.useRecientes()[0].track.title, 'Título actualizado')
  assert.equal(api.useRecientes()[1].artist.subtitle, 'Artista')
  assert.ok(!JSON.stringify(writes).includes('privado'))
  api.olvidarBusqueda('cancion:tema'); assert.equal(api.useRecientes().length, 2)
  api.limpiarRecientes(); await flush(); assert.deepEqual(writes.at(-1).value, [])
})

test('hidratar no pisa una selección nueva y borrar gana a lectura/escritura pendientes', async () => {
  const lectura = deferred(), escritura = deferred()
  const { api, writes } = recientes(null, { lectura, escritura })
  api.recordarCancion(track)
  lectura.resolve(JSON.stringify(['anterior'])); await flush()
  assert.deepEqual(api.useRecientes().map(r => r.tipo), ['cancion', 'consulta'])
  api.limpiarRecientes()
  escritura.resolve(); await flush()
  assert.deepEqual(writes.at(-1).value, [])
  const otra = deferred(), h = recientes(null, { lectura: otra })
  h.api.recordarCancion(track); h.api.limpiarRecientes()
  otra.resolve(JSON.stringify(['vieja'])); await flush()
  assert.deepEqual(h.api.useRecientes(), [])
})

test('historial corrupto, entradas inválidas y topes no bloquean el buscador', async () => {
  for (const value of ['{rota', '{}', JSON.stringify([null, 1, { tipo: 'cancion' }, { tipo: 'artista', artist: { id: 2 } }])]) {
    const h = recientes(value); await h.api.cargarRecientes(); assert.deepEqual(h.api.useRecientes(), [])
  }
  const h = recientes(null); await h.api.cargarRecientes()
  for (let i = 0; i < 20; i++) h.api.recordarCancion({ ...track, videoId: String(i) })
  await flush(); assert.equal(h.api.useRecientes().length, 15); assert.equal(h.api.useRecientes()[0].track.videoId, '19')
})

function explore() {
  const hooks = [], effects = [], requests = []
  let cursor = 0
  const deps = {
    react: { useState(init) { const i = cursor++; if (!(i in hooks)) hooks[i] = init; return [hooks[i], v => { hooks[i] = typeof v === 'function' ? v(hooks[i]) : v }] },
      useEffect(fn, ds) { const i = cursor++, old = hooks[i]; if (!old || ds.some((v, j) => v !== old.ds[j])) effects.push(() => { old?.cleanup?.(); hooks[i] = { ds, cleanup: fn() } }) } },
    'react-native': { View: 'View', Text: 'Text', Image: 'Image', StyleSheet: { absoluteFill: { position: 'absolute', inset: 0 } } },
    'expo-linear-gradient': { LinearGradient: 'Gradient' },
    '../lib/catalogoEditorial': { catalogoGeneros }, '../lib/artwork': { artworkUrlAtSize: x => x },
    '../services/music': { proxiedImage: x => x, fetchGeneros(signal) { const r = { ...deferred(), signal }; requests.push(r); return r.promise } },
    '../state/shell': { usePiso: () => 120, useTecho: () => 96 },
    './BotonSuperficie': { BotonSuperficie: 'Button' }, './ScrollArea': { ScrollArea: 'Scroll' }, './Skeleton': { SkeletonList: 'Skeleton' },
  }
  const api = load('src/ui/SearchExplore.tsx', deps)
  return { ...api, requests, render(props) { cursor = 0; const ui = api.SearchExplore(props); effects.splice(0).forEach(f => f()); return ui }, unmount() { hooks.forEach(h => h?.cleanup?.()) } }
}
test('explorar usa categorías españolas, dos columnas móviles y grilla PC sin abrir teclado', async () => {
  for (const width of [320, 390, 720, 1000]) {
    const h = explore(), picks = [], props = { onOpenGenero: g => picks.push(g) }
    let ui = h.render(props)
    assert.equal(nodes(ui, 'Skeleton').length, 1)
    nodes(ui, 'View').find(n => n.props.onLayout).props.onLayout({ nativeEvent: { layout: { width: width - 40 } } })
    h.requests[0].resolve([{ name: 'Rock', params: 'rock-id', artworkUrl: 'photo' }, { name: 'Electronic', params: 'electro-id', artworkUrl: '' }, { name: 'Unknown campaign', params: 'no', artworkUrl: '' }])
    await flush(); ui = h.render(props)
    const cards = nodes(ui, 'View').flatMap(v => (Array.isArray(v.props.children) ? v.props.children.flat() : [])).filter(c => typeof c?.type === 'function')
    assert.equal(cards.length, 2)
    assert.deepEqual(cards.map(c => c.props.genero.name), ['Rock', 'Electrónica'])
    assert.ok(cards[0].props.ancho > 100)
    assert.ok(Math.abs(cards[0].props.ancho * h.columnasExplorar(width) + 12 * (h.columnasExplorar(width) - 1) + 40 - width) < 1)
    cards[1].props.onPress(); assert.equal(picks[0].params, 'electro-id')
    assert.equal(ui.props.contentContainerStyle.paddingBottom, 120)
    h.unmount(); assert.equal(h.requests[0].signal.aborted, true)
  }
})

test('explorar vacío ofrece reintentar y cancela la respuesta anterior al desmontar', async () => {
  const h = explore(), props = { onOpenGenero() {} }
  h.render(props); h.requests[0].resolve([]); await flush()
  let ui = h.render(props)
  nodes(ui, 'Button')[0].props.onPress(); ui = h.render(props)
  assert.equal(nodes(ui, 'Skeleton').length, 1)
  assert.equal(h.requests.length, 2)
  assert.equal(h.requests[0].signal.aborted, true)
  h.unmount(); assert.equal(h.requests[1].signal.aborted, true)
})

test('fila móvil entra sin autofocus y el blur no desmonta recientes antes del click', () => {
  for (const activo of [false, true]) {
    const events = []
    const api = load('src/ui/SearchRow.tsx', {
      './IconButton': { IconButton: 'Button' },
      'react-native': { View: 'View', Keyboard: { dismiss: () => events.push('dismiss') } },
      react: { useRef: () => ({ current: { blur: () => events.push('blur') } }) },
      'react-native-reanimated': { __esModule: true, default: { View: 'AnimatedView' }, interpolate() {}, useAnimatedKeyboard: () => ({ height: { value: 0 } }), useAnimatedStyle: f => f() },
      'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 34 }) },
      '../state/busqueda': { useBuscando: () => activo, usePista: () => 'Canciones y artistas', useTermino: () => '', setActivo: v => events.push(v), setTermino() {}, cerrarBusqueda: () => events.push('close') },
      'expo-router': { useRouter: () => ({ replace() {} }) },
      '../state/shell': { useKeyboardH: () => 0, setTab() {} },
      './SearchField': { SearchField: 'Field' }, './icons': { ICON_COLOR: {}, IconClose: 'Close', IconHome: 'Home' },
    })
    const ui = api.SearchRow(), campo = nodes(ui, 'Field')[0]
    assert.equal(campo.props.autoFocus, activo)
    campo.props.onFocusChange(false); assert.deepEqual(events, [])
    campo.props.onFocusChange(true); assert.deepEqual(events, [true])
    const cancel = nodes(ui, 'Button').find(n => n.props.label === 'Cancelar la búsqueda')
    assert.equal(!!cancel, activo)
    if (cancel) { cancel.props.onPress(); assert.deepEqual(events, [true, 'blur', 'close', 'dismiss']) }
  }
})

test('resultados amplios muestran tipo, portada cuadrada, artista circular y navegación', () => {
  const api = load('src/ui/SearchDropdown.tsx', {
    './estadoControl': { superficieInteractivaWeb: () => ({}) }, './ScrollArea': { ScrollArea: 'Scroll' },
    './Glass': { ES_WEB: true }, react: { useState: v => [v, () => {}] },
    'react-native': { Image: 'Image', Platform: { OS: 'web' }, Pressable: 'Pressable', Text: 'Text', View: 'View' },
    '../state/playback': { togglePlayback() {} }, '../state/shell': {},
    './Menu': { MantenerApretado: 'Context', Menu: 'Menu' }, './useClicDerecho': { useClicDerecho: () => ({ gestos: {} }) },
    './CoverState': { EstadoTapa: 'Cover' }, './RowSurface': { RowSurface: 'Row' }, './Skeleton': {},
    './icons': { ICON_COLOR: {}, IconChevronRight: 'Chevron' }, '../services/music': { proxiedImage: x => x }, '../lib/artwork': { artworkUrlAtSize: x => x },
  })
  const picked = []
  const song = api.ResultadoFila({ track, sounding: false, playing: true, busy: false, alwaysSelect: false, onSelect: t => picked.push(t), amplia: true, menuFor: () => [{ label: 'Opciones', onPress() {} }] })
  assert.ok(nodes(song, 'Text').some(n => n.props.children === 'Canción · Una banda'))
  nodes(song, 'Pressable')[0].props.onPress(); assert.equal(picked[0], track)
  assert.equal(nodes(song, 'Menu').length, 1)
  const art = api.ArtistHit({ artist, onPress: () => picked.push(artist), amplia: true })
  assert.equal(nodes(art, 'Image')[0].props.className, 'rounded-full bg-muted')
  assert.equal(nodes(art, 'Chevron').length, 1)
  nodes(art, 'Pressable')[0].props.onPress(); assert.equal(picked[1], artist)
})
