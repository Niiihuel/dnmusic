import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const jsx = (type, props) => ({ type, props })
const children = (node, predicate) => !node || typeof node !== 'object' ? [] : Array.isArray(node)
  ? node.flatMap(child => children(child, predicate))
  : [...(predicate(node) ? [node] : []), ...children(node.props?.children, predicate)]
function component(path, dependencies) {
  const slots = [], effects = [], exports = {}
  let index = 0
  const react = {
    useState(initial) { const key = index++; slots[key] ??= { value: initial }; return [slots[key].value, value => { slots[key].value = typeof value === 'function' ? value(slots[key].value) : value }] },
    useRef(initial) { const key = index++; return slots[key] ??= { current: initial } },
    useMemo(fn, deps) { const key = index++; if (!slots[key] || deps.some((dep, i) => !Object.is(dep, slots[key].deps[i]))) slots[key] = { value: fn(), deps }; return slots[key].value },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps) },
    useEffect(fn, deps) { const key = index++; if (!slots[key] || !deps || deps.some((dep, i) => !Object.is(dep, slots[key].deps?.[i]))) { const old = slots[key]; slots[key] = { deps, cleanup: old?.cleanup }; effects.push(() => { old?.cleanup?.(); slots[key].cleanup = fn() }) } },
  }
  const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('exports', 'require', source)(exports, name => {
    if (name === 'react') return react
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (name in dependencies) return dependencies[name]
    if (name.endsWith('/icons')) return new Proxy({ ICON_COLOR: {} }, { get: (target, key) => target[key] ?? String(key) })
    return new Proxy({}, { get: (_, key) => String(key) })
  })
  return { render(name, props) { index = 0; const result = exports[name](props); while (effects.length) effects.shift()(); return result } }
}

const modifiers = new Proxy({}, { get: (_, key) => value => ({ name: key, value }) })
const rn = { View: 'View', Text: 'Text', Image: 'Image', StyleSheet: { absoluteFill: {} }, Platform: { OS: 'ios' }, useWindowDimensions: () => ({ width: 390, height: 844 }) }

test('iOS conserva letras y controles durante cambios de posición; solo cerrar navega', () => {
  const calls = []
  let positionMs = 0
  const track = { title: 'Tema', artist: 'Artista', durationMs: 180000 }
  const gesture = new Proxy({}, { get: () => () => gesture })
  const h = component('app/playing.tsx', {
    'react-native': rn,
    'expo-router': { useRouter: () => ({}) },
    '../src/lib/volver': { volver: () => calls.push('close') },
    'react-native-gesture-handler': { Gesture: { Pan: () => gesture }, GestureDetector: 'GestureDetector' },
    'react-native-reanimated': { default: { View: 'Animated.View' }, Easing: { in: value => value, out: value => value }, useSharedValue: value => ({ value }), useAnimatedStyle: () => ({}), withTiming: () => assert.fail('iOS usa la animación de la ruta'), withSpring: value => value },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 59, bottom: 34 }), SafeAreaView: 'SafeAreaView' },
    '../src/state/shell': { usePiso: () => 140 },
    '../src/ui/Dispositivos.shared': { useDestinoEscucha: () => ({ remoto: false }) },
    '../src/lib/artwork': { artworkSource: () => null },
    '../src/state/jam': { useJamActivo: () => false, useCuantosJam: () => 0 },
    '../modules/audio-route': { haySelectorDeSalida: true, SelectorDeSalida: 'AirPlay', hayVolumenDelSistema: true, VolumenDelSistema: 'Volume' },
    '../src/state/playback': {
      usePlaybackState: () => ({ tracks: [track], index: 0, manual: null, wantPlay: true, positionMs, durationMs: 180000 }),
      useNowPlayingView: () => 'lyrics', usePlaybackOriginName: () => 'Lista', useHaySiguiente: () => true,
      canOpenPlaylist: () => true, seekToMs: value => calls.push(['seek', value]), togglePlayback: () => calls.push('play'),
    },
  })
  let tree
  for (let tick = 0; tick < 50; tick++) { positionMs = tick * 250; tree = h.render('default', {}) }
  assert.equal(children(tree, node => node.type === 'GestureDetector').length, 0, 'arrastrar letras no puede cerrar la ruta')
  assert.equal(children(tree, node => node.type === 'LyricsView').length, 1)
  assert.equal(children(tree, node => node.type === 'SeekBar').length, 1)
  assert.equal(children(tree, node => node.type === 'AirPlay').length, 1)
  assert.equal(children(tree, node => node.type === 'Volume').length, 1)
  assert.deepEqual(calls, [])
  const lyrics = children(tree, node => node.type === 'LyricsView')[0]
  assert.equal(lyrics.props.onTap, undefined, 'tocar un verso no oculta la interfaz')
  lyrics.props.onPickLine(30000)
  children(tree, node => node.props?.label === 'Cerrar reproductor')[0].props.onPress()
  assert.deepEqual(calls, [['seek', 30000], 'close'])
})

test('el slider nativo conserva el arrastre frente al reloj y confirma una sola búsqueda al soltar', () => {
  const seeks = []
  const h = component('src/ui/SeekBar.ios.tsx', {
    'react-native': rn, '@expo/ui/swift-ui': { Host: 'Host', Slider: 'Slider' },
    '@expo/ui/swift-ui/modifiers': modifiers, './tiempos': { formatClock: ms => String(ms) },
  })
  const props = { label: 'Tema', progress: .1, elapsedMs: 10000, totalMs: 100000, onSeek: value => seeks.push(value) }
  const slider = tree => children(tree, node => node.type === 'Slider')[0]
  let tree = h.render('SeekBar', props)
  slider(tree).props.onEditingChanged(true)
  slider(tree).props.onValueChange(.75)
  tree = h.render('SeekBar', { ...props, progress: .11, elapsedMs: 11000 })
  assert.equal(slider(tree).props.value, .75)
  assert.deepEqual(seeks, [])
  slider(tree).props.onEditingChanged(false)
  assert.deepEqual(seeks, [.75])
  slider(h.render('SeekBar', props)).props.onValueChange(.2)
  assert.deepEqual(seeks, [.75, .2], 'VoiceOver puede ajustar sin iniciar un gesto')
})

test('respuesta de letra cancelada no reemplaza una carga nueva al cambiar duración o canción', async () => {
  const pending = []
  const h = component('src/ui/LyricsView.tsx', {
    'react-native': rn,
    '../state/playback': { usePlaybackState: () => ({ positionMs: 0 }) },
    '../services/music': { fetchLyrics: (...args) => new Promise((resolve, reject) => pending.push({ resolve, reject, args })) },
  })
  const track = { title: 'Tema', artist: 'Artista', durationMs: 0 }
  h.render('LyricsView', { track })
  h.render('LyricsView', { track: { ...track, durationMs: 180000 } })
  assert.equal(pending.length, 2)
  assert.equal(pending[0].args[3].aborted, true)
  pending[0].reject(new Error('Abortado'))
  await new Promise(resolve => setImmediate(resolve))
  let tree = h.render('LyricsView', { track: { ...track, durationMs: 180000 } })
  assert.equal(children(tree, node => node.props?.children === 'Buscando la letra…').length, 1)
  const lines = [{ atMs: 0, text: 'Verso actual' }]
  pending[1].resolve(lines)
  await new Promise(resolve => setImmediate(resolve))
  tree = h.render('LyricsView', { track: { ...track, durationMs: 180000 } })
  assert.equal(children(tree, node => node.type === 'Lyrics')[0].props.lines, lines)
})
