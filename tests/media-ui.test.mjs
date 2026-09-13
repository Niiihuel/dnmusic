import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const jsx = (type, props) => ({ type, props })
function harness(path, deps = {}, extra = '') {
  const exports = {}, states = []
  let i = 0
  const source = ts.transpileModule(readFileSync(path, 'utf8') + extra, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('exports', 'require', source)(exports, id => {
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (id === 'react') return { useState(v) { const n = i++; if (!(n in states)) states[n] = v; return [states[n], v => states[n] = typeof v === 'function' ? v(states[n]) : v] }, useRef(v) { const n = i++; return states[n] ??= { current: v } }, useEffect() {} }
    if (id in deps) return deps[id]
    if (id.endsWith('/icons')) return new Proxy({ ICON_COLOR: {} }, { get: (target, k) => target[k] ?? k })
    return new Proxy({}, { get: (_, k) => k })
  })
  return { exports, render(name, props) { i = 0; return exports[name](props) } }
}
function nodes(node, match = () => true) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(n => nodes(n, match))
  return [...(match(node) ? [node] : []), ...nodes(node.props?.children, match)]
}
const rn = { View: 'View', Text: 'Text', Image: 'Image', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator', Platform: { OS: 'web' }, useWindowDimensions: () => ({ width: 1440, height: 900 }) }
const byLabel = (ui, label) => nodes(ui, n => n.props?.accessibilityLabel === label || n.props?.label === label)[0]

test('duración/corazón ocupan una sola columna; hover y teclado muestran like sin reproducir', () => {
  let plays = 0, likes = 0
  const h = harness('src/ui/TrackRow.shared.tsx', { 'react-native': rn, '../state/playback': { usePlaybackCargada: () => true }, './useClicDerecho': { useClicDerecho: () => ({ gestos: {}, punto: null }) }, './SeekBar': { formatClock: () => '3:00' }, './estadoControl': { estadoControlWeb: modo => ({ dataSet: { dnHover: modo } }) } })
  const props = { index: 0, title: 'Tema', artist: 'Artista', artwork: null, durationMs: 180000, sounding: false, playing: false,
    onPlay: () => plays++, gusto: jsx('Pressable', { accessibilityLabel: 'Me gusta', onPress: () => likes++ }) }
  let ui = h.render('TrackRow', props)
  const play = byLabel(ui, 'Reproducir Tema')
  assert.equal(play.props.dataSet.dnHover, 'row', 'el hover pertenece a la superficie redondeada')
  /* Por la constante y no por el número: la columna se ensanchó cuando
     «Duración» dejó de entrar, y un 48 escrito acá hacía fallar esta prueba
     por un cambio que no tiene nada que ver con lo que mide. */
  const slot = nodes(ui, n => n.props?.style?.width === h.exports.ANCHO_DURACION)[0]
  assert.equal(slot.props.style.height, 44)
  assert.equal(slot.props.style.alignItems, 'center')
  assert.equal(slot.props.style.justifyContent, 'center')
  const heartLayer = nodes(slot, n => n.props?.style?.position === 'absolute')[0]
  assert.equal(heartLayer.props.style.inset, 0)
  assert.equal(heartLayer.props.style.alignItems, 'center')
  assert.equal(heartLayer.props.style.justifyContent, 'center')
  assert.equal(heartLayer.props.pointerEvents, 'none')
  assert.equal(nodes(play, n => n.props?.accessibilityLabel === 'Me gusta').length, 0)
  ui.props.onPointerEnter()
  ui = h.render('TrackRow', props)
  assert.equal(nodes(ui, n => n.props?.children === '3:00')[0].props.style.opacity, 0)
  assert.match(ui.props.className, /bg-muted/)
  assert.equal(nodes(ui, n => n.props?.style?.position === 'absolute' && n.props?.style?.inset === 0)[0].props.pointerEvents, 'auto')
  byLabel(ui, 'Me gusta').props.onPress()
  assert.equal(likes, 1)
  assert.equal(plays, 0)
  ui.props.onPointerLeave()
  ui.props.onFocus()
  ui = h.render('TrackRow', props)
  assert.equal(nodes(ui, n => n.props?.children === '3:00')[0].props.style.opacity, 0)
  ui.props.onBlur({ currentTarget: { contains: () => true }, relatedTarget: {} })
  assert.equal(nodes(h.render('TrackRow', props), n => n.props?.children === '3:00')[0].props.style.opacity, 0)
  ui.props.onBlur({ currentTarget: {}, relatedTarget: null })
  assert.equal(nodes(h.render('TrackRow', props), n => n.props?.children === '3:00')[0].props.style.opacity, 1)
})

test('artista conocido abre su página sin llamar reproducción; sin id queda texto', () => {
  const actions = []
  const h = harness('src/ui/EnlaceArtista.tsx', { 'react-native': rn, 'expo-router': { useRouter: () => ({ dismissTo: route => actions.push(['route', route]) }) }, '../state/shell': { abrirArtista: (...args) => actions.push(['artist', ...args]) }, '../lib/teclado': { TECLADO_FISICO: true } })
  const ui = h.render('EnlaceArtista', { id: 'artista-local', nombre: 'Artista' })
  assert.equal(ui.props.accessibilityRole, 'link')
  ui.props.onPress()
  assert.deepEqual(actions, [['artist', 'artista-local', 'Artista'], ['route', '/']])
  assert.equal(h.render('EnlaceArtista', { id: null, nombre: 'Artista' }).type, 'Text')
})

const track = { id: 'track', videoId: 'local-track', title: 'Tema', artist: 'Artista', artistId: 'local-artist', artworkUrl: '', artworkPath: null, audioPath: 'local.webm', durationMs: 180000, truePeak: undefined }

test('reproductor: expandir/contraer es explícito; ajustar volumen conserva ancho y controles', () => {
  let volume = .5, collapsedByScroll = false
  const h = harness('src/ui/NowPlayingBar.tsx', {
    'react-native': rn, 'expo-router': { useRouter: () => ({}) }, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '../lib/artwork': { artworkSource: () => null }, '../state/shell': { useTabsVisible: () => false, useColapsada: () => collapsedByScroll },
    '../state/playback': { usePlaybackState: () => ({ tracks: [track], index: 0, manual: null, wantPlay: false, positionMs: 0, durationMs: 180000, volume, cargada: true, shuffle: false, view: null, error: null }), useHaySiguiente: () => true, usePlaybackOriginName: () => '', useModoReproduccion: () => 'orden', canOpenPlaylist: () => false, setVolume: v => volume = v },
    '../state/jam': { useJamActivo: () => false, useCuantosJam: () => 0 }, '../state/escucha': {}, '../../modules/media-controls': { NativeMiniPlayer: null }, './Dispositivos.shared': { useDestinoEscucha: () => ({ resumen: 'En pausa en este dispositivo', remoto: false, estado: 'pausado' }) },
    './Glass': { ES_WEB: true, HAY_VIDRIO: true, Glass: 'Glass' }, './useClicDerecho': { useClicDerecho: () => ({ gestos: {}, punto: null }) }, './SeekBar': { formatClock: () => '0:00' },
  }, '\nexport { AnchoPildora, Volume }')
  let ui = h.render('NowPlayingBar', {})
  assert.equal(ui.props.pointerEvents, 'box-none', 'el margen transparente deja clicables la cuenta y las sidebars')
  byLabel(ui, 'Contraer reproductor').props.onPress()
  ui = h.render('NowPlayingBar', {})
  const wrapper = nodes(ui, n => n.type === h.exports.AnchoPildora)[0]
  assert.equal(wrapper.props.compacto, true)
  const widthUi = h.exports.AnchoPildora(wrapper.props)
  assert.equal(widthUi.props.onPointerEnter, undefined)
  assert.equal(widthUi.props.onPointerLeave, undefined)
  assert.equal(widthUi.props.onFocus, undefined)
  const controls = nodes(ui, n => n.props?.accessibilityLabel).map(n => n.props.accessibilityLabel)
  nodes(ui, n => n.type === h.exports.Volume)[0].props.onChange(.2)
  collapsedByScroll = true
  ui = h.render('NowPlayingBar', {})
  assert.equal(nodes(ui, n => n.type === h.exports.AnchoPildora)[0].props.compacto, true)
  assert.deepEqual(nodes(ui, n => n.props?.accessibilityLabel).map(n => n.props.accessibilityLabel), controls)
  byLabel(ui, 'Expandir reproductor').props.onPress()
  assert.equal(nodes(h.render('NowPlayingBar', {}), n => n.type === h.exports.AnchoPildora)[0].props.compacto, false)
})

test('me gusta de álbum espera audio válido, evita doble clic y nunca invoca playback', async () => {
  let complete, resolves = 0, liked = false
  const saved = []
  const pending = new Promise(resolve => complete = resolve)
  const h = harness('src/ui/BotonMeGusta.tsx', { 'react-native': rn, '../state/gustos': { useEsGustada: () => liked, alternarMeGusta: t => saved.push(t) }, './Tooltip': { useConTooltip: () => ({ gestos: {} }) }, '../state/aviso': { avisar: () => assert.fail('Unexpected error') } })
  const props = { track, resolver: () => { resolves++; return pending } }
  const ui = h.render('BotonMeGusta', props)
  ui.props.onPress(); ui.props.onPress()
  assert.equal(resolves, 1)
  assert.equal(saved.length, 0)
  assert.equal(h.render('BotonMeGusta', props).props.disabled, true)
  complete(track)
  await pending; await Promise.resolve()
  assert.deepEqual(saved, [track])
  liked = true
  h.render('BotonMeGusta', props).props.onPress()
  assert.equal(resolves, 1) // Removing a like does not resolve/download the song again.
  assert.equal(saved.length, 2)
})

test('álbum conserva el audio real resuelto y reutiliza el me gusta existente al quitar', async () => {
  let liked = []
  const h = harness('src/ui/AlbumPanel.tsx', { '../state/gustos': { useMeGusta: () => liked }, '../services/music': { resolveSong: async t => { assert.equal(t.videoId, track.videoId); return { path: 'audio-real.m4a', artworkPath: 'art-real.webp', durationMs: 181000 } } } }, '\nexport { GustoAlbum }')
  const props = { track, album: { title: 'Álbum', artworkUrl: '', artworkPath: null } }
  const ui = h.render('GustoAlbum', props)
  const resolved = await ui.props.resolver()
  assert.equal(resolved.audioPath, 'audio-real.m4a')
  assert.equal(resolved.artworkPath, 'art-real.webp')
  liked = [resolved]
  assert.equal(h.render('GustoAlbum', props).props.track, resolved)
})

test('minirreproductor iOS nativo muestra el destino real y conserva los mandos sin tocar audio al navegar', () => {
  const calls = []
  let preparando = true
  const destino = { resumen: 'En pausa en Computadora', remoto: true, estado: 'pausado' }
  const h = harness('src/ui/NowPlayingBar.tsx', {
    'react-native': { ...rn, Platform: { OS: 'ios' }, useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1.6 }) },
    'expo-router': { useRouter: () => ({ push: route => calls.push(['route', route]) }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 34 }) },
    '../../modules/media-controls': { NativeMiniPlayer: 'NativeMiniPlayer' },
    './Dispositivos.shared': { useDestinoEscucha: () => destino },
    '../lib/artwork': { artworkSource: () => 'https://cover' }, '../state/shell': { useTabsVisible: () => true },
    '../state/playback': {
      usePlaybackState: () => ({ tracks: [track], index: 0, manual: null, wantPlay: true, positionMs: 0, durationMs: 180000, volume: .5, cargada: !preparando, view: null, error: null }),
      useHaySiguiente: () => false, usePlaybackOriginName: () => '', useModoReproduccion: () => 'orden', canOpenPlaylist: () => false,
      togglePlayback: () => calls.push('toggle'), playNext: () => calls.push('next'), playPrevious: () => calls.push('previous'),
    },
    '../state/jam': { useJamActivo: () => false, useCuantosJam: () => 0 },
    '../state/escucha': { abrirSelectorDispositivos: () => calls.push('devices') },
    './Glass': { ES_WEB: false, HAY_VIDRIO: true, Glass: 'Glass' }, './useClicDerecho': { useClicDerecho: () => ({ gestos: {}, punto: null }) },
  })
  let mini = nodes(h.render('NowPlayingBar', {}), n => n.type === 'NativeMiniPlayer')[0]
  assert.equal(mini.props.subtitle, 'En pausa en Computadora'); assert.equal(mini.props.remote, true)
  assert.equal(mini.props.deviceLabel, destino.resumen); assert.equal(mini.props.canNext, false)
  assert.ok(mini.props.style.height >= 76); assert.equal(mini.props.busy, true)
  mini.props.onOpen(); mini.props.onDevices(); assert.deepEqual(calls, [['route', '/playing'], 'devices'])
  mini.props.onPlayPause(); assert.equal(calls.at(-1), 'toggle')
  preparando = false; destino.resumen = 'Sonando en Computadora'; destino.estado = 'sonando'
  mini = nodes(h.render('NowPlayingBar', {}), n => n.type === 'NativeMiniPlayer')[0]
  assert.equal(mini.props.subtitle, 'Sonando en Computadora'); assert.equal(mini.props.busy, false)
})
