import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const jsx = (type, props) => ({ type, props })
function nodes(node) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(nodes)
  return [node, ...nodes(node.props?.children)]
}
const plain = value => JSON.parse(JSON.stringify(value))
const tick = async () => { await Promise.resolve(); await Promise.resolve() }

function load(path, dependencies, react = {}) {
  const exports = {}
  const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText
  new Function('exports', 'require', source)(exports, name => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' }
    if (name === 'react') return react
    assert.ok(name in dependencies, `Import inesperado: ${name}`)
    return dependencies[name]
  })
  return exports
}

function effects() {
  let cursor = 0
  const slots = [], pending = []
  const react = {
    useState(initial) {
      const index = cursor++
      const slot = slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }
      return [slot.value, value => { slot.value = typeof value === 'function' ? value(slot.value) : value }]
    },
    useEffect(callback, dependencies) {
      const index = cursor++
      const slot = slots[index] ??= {}
      if (!slot.dependencies || dependencies.some((value, i) => !Object.is(value, slot.dependencies[i]))) {
        slot.dependencies = dependencies
        pending.push(() => { slot.cleanup?.(); slot.cleanup = callback() })
      }
    },
  }
  return {
    react,
    render(fn) { cursor = 0; const result = fn(); pending.splice(0).forEach(fn => fn()); return nodes(result) },
    unmount() { slots.forEach(slot => slot.cleanup?.()) },
  }
}

const song = { kind: 'track', videoId: 'propia:id', title: 'Tema', artist: 'Artista', artistId: null,
  artworkUrl: 'https://images.test/cover.jpg', artworkPath: null, audioPath: 'audio/tema.m4a', durationMs: 180000 }

function chat() {
  const state = { actual: null, wantPlay: false, cargada: false, remoto: false }, calls = []
  const { CancionCompartida } = load('src/ui/CancionCompartida.tsx', {
    'expo-router': { useRouter: () => ({ push: path => calls.push(['open', path]) }) },
    '../lib/artwork': { artworkSource: (_path, uri) => uri },
    '../state/playback': {
      usePlaybackTrack: () => state.actual, useWantPlay: () => state.wantPlay, usePlaybackCargada: () => state.cargada,
      playQueue: (...args) => calls.push(['queue', ...plain(args)]), togglePlayback: () => calls.push(['toggle']),
    },
    './TarjetaMusica': { TarjetaMusica: 'TarjetaMusica' },
    './Dispositivos.shared': { useDestinoEscucha: () => ({ remoto: state.remoto }) },
  })
  return { state, calls, render: () => CancionCompartida({ song }).props }
}

test('la tarjeta del chat inicia el motor global con metadatos completos y abre el enlace sin reproducirlo', () => {
  const h = chat(), card = h.render()
  card.onAbrir()
  assert.deepEqual(h.calls, [['open', '/cancion/propia%3Aid']])
  card.onReproducir()
  assert.equal(h.calls[1][0], 'queue')
  assert.deepEqual(h.calls[1].slice(2), [0, null])
  assert.deepEqual(h.calls[1][1], [{ ...song, id: song.videoId }])
  assert.equal(card.reproduciendo, false)
  assert.equal(card.cargando, false)
})

test('la misma canción pausa o reanuda incluso mientras carga, sin reiniciar la cola', () => {
  const h = chat()
  h.state.actual = { ...song, id: 'en-otra-lista' }
  h.state.wantPlay = true
  const loading = h.render()
  assert.equal(loading.reproduciendo, true)
  assert.equal(loading.cargando, true)
  loading.onReproducir()
  h.state.wantPlay = false
  const paused = h.render()
  assert.equal(paused.reproduciendo, false)
  assert.equal(paused.cargando, false)
  paused.onReproducir()
  paused.onAbrir()
  assert.deepEqual(h.calls, [['toggle'], ['toggle'], ['open', '/playing']])
})

function link({ user = { id: 'me' }, tarjeta = { id: 'propia:id', titulo: 'Tema', subtitulo: 'Artista', tapa: null, durationMs: 180000 } } = {}) {
  const hooks = effects(), calls = [], state = { user, id: 'propia:id', actual: null, wantPlay: false, cargada: false, remoto: false }
  const ui = name => ({ [name]: name })
  const { default: Page } = load('app/cancion/[id].tsx', {
    'react-native': { ActivityIndicator: 'ActivityIndicator', Text: 'Text', View: 'View', useWindowDimensions: () => ({ width: 390 }) },
    'react-native-safe-area-context': ui('SafeAreaView'),
    'expo-router': { useLocalSearchParams: () => ({ id: state.id }), useRouter: () => ({ push: path => calls.push(['open', path]) }) },
    '../../src/ui/IconButton': ui('IconButton'), '../../src/ui/ScrollArea': ui('ScrollArea'),
    '../../src/lib/volver': { volver() {} },
    '../../src/lib/pistas': { pistaDeResultado: (result, origen) => { calls.push(['track', plain(result), origen]); return { ...result, id: result.videoId, audioPath: '', artworkPath: null } } },
    '../../src/lib/compartir': { compartirCancion() {}, linkDe: (_que, id) => `https://dn.test/cancion/${encodeURIComponent(id)}` },
    '../../src/services/compartidos': { tarjetaDe: async (que, id) => { calls.push(['metadata', que, id]); return tarjeta } },
    '../../src/state/listas': { dejarCancionPendiente() {} },
    '../../src/state/playback': {
      usePlaybackTrack: () => state.actual, useWantPlay: () => state.wantPlay, usePlaybackCargada: () => state.cargada,
      playQueue: (...args) => calls.push(['queue', ...plain(args)]), togglePlayback: () => calls.push(['toggle']),
    },
    '../../src/state/shell': { usePiso: () => 24 }, '../../src/state/session': { useUser: () => state.user },
    '../../src/ui/Aterrizaje': ui('Aterrizaje'), '../../src/ui/BotonVolver': ui('BotonVolver'),
    '../../src/ui/TarjetaMusica': ui('TarjetaMusica'), '../../src/ui/Panel': ui('Panel'), '../../src/ui/Vacio': ui('Vacio'),
    '../../src/ui/Dispositivos.shared': { useDestinoEscucha: () => ({ remoto: state.remoto }) },
    '../../src/ui/SeekBar': { formatLength: () => '3:00' },
    '../../src/ui/icons': { ICON_COLOR: {}, IconMusic: 'IconMusic', IconPlus: 'IconPlus', IconShare: 'IconShare' },
  }, hooks.react)
  return { ...hooks, state, calls, render: () => hooks.render(Page) }
}

test('sin cuenta aprobada la ruta delega en la puerta y nunca pide metadatos ni crea cola', async () => {
  for (const user of [null, undefined]) {
    const h = link()
    h.state.user = user
    const ui = h.render()
    await tick()
    assert.equal(ui.some(node => node.type === 'TarjetaMusica'), false)
    assert.deepEqual(h.calls, [])
    if (user === null) assert.ok(ui.some(node => node.type === 'Aterrizaje' && node.props.id === 'propia:id'))
    h.unmount()
  }
})

test('el enlace aprobado entrega los metadatos al motor y permite cancelar la carga con pausa', async () => {
  const h = link()
  h.render(); await tick()
  const card = h.render().find(node => node.type === 'TarjetaMusica').props
  assert.equal(card.datos.imagen, null)
  assert.equal(card.onAbrir, undefined)
  assert.deepEqual(h.calls, [['metadata', 'cancion', 'propia:id']])
  card.onReproducir()
  assert.equal(h.calls[1][0], 'track')
  assert.equal(h.calls[1][2], 'enlace')
  assert.deepEqual(h.calls[1][1], { videoId: 'propia:id', title: 'Tema', artist: 'Artista', artistId: null, album: '', albumId: null, artworkUrl: '', durationMs: 180000 })
  assert.equal(h.calls[2][0], 'queue')
  h.state.actual = { videoId: 'propia:id' }; h.state.wantPlay = true
  const loading = h.render().find(node => node.type === 'TarjetaMusica').props
  assert.equal(loading.cargando, true)
  loading.onReproducir(); loading.onAbrir()
  assert.deepEqual(h.calls.slice(-2), [['toggle'], ['open', '/playing']])
  h.unmount()
})

test('un enlace sin tarjeta conserva el estado vacío y no ofrece reproducir', async () => {
  const h = link({ tarjeta: null })
  h.render(); await tick()
  const ui = h.render()
  assert.ok(ui.some(node => node.type === 'Vacio'))
  assert.equal(ui.some(node => node.type === 'TarjetaMusica'), false)
  assert.equal(h.calls.some(call => call[0] === 'queue'), false)
  h.unmount()
})

function landing({ pending = false } = {}) {
  const hooks = effects(), calls = []
  const { Aterrizaje } = load('src/ui/Aterrizaje.tsx', {
    'react-native': { ActivityIndicator: 'ActivityIndicator', Image: 'Image', Text: 'Text', View: 'View', useWindowDimensions: () => ({ width: 390 }) },
    'expo-linear-gradient': { LinearGradient: 'LinearGradient' },
    'expo-router': { useRouter: () => ({ push: path => calls.push(['open', path]) }) },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '../lib/colorPortada': { conAlfa: value => value, useColorPortada: () => null },
    '../lib/abrirEnLaApp': { abrirEnLaApp: async () => {}, puedeIntentarLaApp: () => false },
    '../services/compartidos': { tarjetaDe: async () => ({ titulo: 'Tema', subtitulo: 'Artista', tapa: null }) },
    '../state/session': { useAuthUser: () => pending ? { id: 'waiting' } : null, useAccessStatus: () => pending ? { status: 'pending' } : null },
    './Social': { AccionSocial: 'AccionSocial' }, './TarjetaMusica': { TarjetaMusica: 'TarjetaMusica' },
    './icons': { ICON_COLOR: {}, IconMusic: 'IconMusic', IconPlay: 'IconPlay', IconUser: 'IconUser', IconUsers: 'IconUsers' },
  }, hooks.react)
  return { ...hooks, calls, render: () => hooks.render(() => Aterrizaje({ que: 'cancion', id: 'propia:id' })) }
}

test('la tarjeta anónima invita a entrar sin montar controles de reproducción', async () => {
  const h = landing()
  h.render(); await tick()
  const ui = h.render(), card = ui.find(node => node.type === 'TarjetaMusica').props
  assert.equal(card.onReproducir, undefined)
  card.onAbrir()
  assert.deepEqual(h.calls, [['open', '/sign-in']])
  assert.equal(ui.filter(node => node.type === 'AccionSocial').length, 1)
  h.unmount()
})

test('una cuenta pendiente ve la canción y el estado de aprobación sin ninguna acción', async () => {
  const h = landing({ pending: true })
  h.render(); await tick()
  const ui = h.render(), card = ui.find(node => node.type === 'TarjetaMusica').props
  assert.equal(card.onReproducir, undefined)
  assert.equal(card.onAbrir, undefined)
  assert.equal(ui.some(node => node.type === 'AccionSocial'), false)
  assert.deepEqual(h.calls, [])
  h.unmount()
})


test('una canción sonando en otro dispositivo ofrece traerla sin carga ni giro locales falsos', async () => {
  const h = chat()
  h.state.actual = song; h.state.wantPlay = true; h.state.remoto = true
  const card = h.render()
  assert.equal(card.reproduciendo, false)
  assert.equal(card.cargando, false)
  assert.equal(card.etiquetaReproduccion, 'Traer música a este dispositivo')
  card.onReproducir()
  assert.deepEqual(h.calls, [['toggle']], 'conserva el traspaso del motor global')
  const page = link()
  page.render(); await tick()
  page.state.actual = { videoId: 'propia:id' }; page.state.wantPlay = true; page.state.remoto = true
  const linkCard = page.render().find(node => node.type === 'TarjetaMusica').props
  assert.equal(linkCard.cargando, false)
  assert.equal(linkCard.reproduciendo, false)
  assert.equal(linkCard.etiquetaReproduccion, 'Traer música a este dispositivo')
  page.unmount()
})
