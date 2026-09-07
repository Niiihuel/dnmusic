import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

// Exercise the actual PlayerBar menu callbacks with inert playback and UI adapters.
function mount(overrides = {}) {
  const events = []
  const jsx = (type, props) => ({ type, props })
  const chain = new Proxy({}, { get: () => () => chain })
  const props = {
    view: 'wave', hasLyrics: true, playing: false, positionMs: { value: 30000 }, startMs: 30000, snippetMs: 15000,
    choice: 15000, choices: [{ value: 15000, label: '15 segundos' }, { value: 30000, label: '30 segundos' }],
    lang: 'off', translating: false,
    onChangeView: v => events.push(['vista', v]), onChangeChoice: v => events.push(['duracion', v]),
    onChangeLang: v => events.push(['idioma', v]), onToggle: () => events.push(['play']), onSeek: v => events.push(['seek', v]),
    onCambiarCancion: () => events.push(['cancion']), accion: jsx('Confirmar', { onPress: () => events.push(['confirmar']) }),
    ...overrides,
  }
  const modules = {}
  const exports = {}
  runInNewContext(ts.transpileModule(readFileSync(new URL('../src/ui/PlayerBar.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require(id) {
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (id === 'react') return { useEffect() {}, useState: v => [v, () => {}] }
    if (id === 'react-native') return { View: 'View', Text: 'Text', Pressable: 'Pressable' }
    if (id === 'react-native-reanimated') return { default: { View: 'AnimatedView' }, useSharedValue: v => ({ value: v }), useAnimatedStyle: fn => fn(), runOnJS: fn => fn }
    if (id === 'react-native-gesture-handler') return { Gesture: { Pan: () => chain, Tap: () => chain, Race: () => chain }, GestureDetector: 'GestureDetector' }
    if (id.endsWith('/music')) return { LYRIC_LANGS: [{ label: 'Original', value: 'off' }, { label: 'Español', value: 'es' }] }
    if (id.endsWith('/appActiva')) return { useAppActiva: () => true }
    if (id.endsWith('/icons')) return new Proxy({ ICON_COLOR: {} }, { get: (o,k) => o[k] ?? (o[k] = k) })
    return modules[id] ??= new Proxy({}, { get: (o,k) => o[k] ?? (o[k] = k) })
  } })
  const flatten = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(flatten) : [n, ...Object.values(n.props || {}).flatMap(flatten)]
  const nodes = flatten(exports.PlayerBar(props))
  const menu = nodes.find(n => n.props?.label === 'Opciones del fragmento').props
  return { events, menu, props }
}

test('vista, duración y traducción cambian la opción sin reproducir ni confirmar', () => {
  const f = mount()
  f.menu.items.find(i => i.label === 'Vista').items.find(i => i.label === 'Disco').onPress()
  f.menu.items.find(i => i.label === 'Duración').items.find(i => i.label === '30 segundos').onPress()
  f.menu.items.find(i => i.label === 'Traducción').items.find(i => i.label === 'Español').onPress()
  assert.deepEqual(f.events, [['vista','disc'], ['duracion',30000], ['idioma','es']])
  assert.equal(f.props.startMs, 30000)
})

test('sin letra, no ofrece traducción ni permite seleccionar vista de letra', () => {
  const f = mount({ hasLyrics: false })
  assert.equal(f.menu.items.some(i => i.label === 'Traducción'), false)
  assert.equal(f.menu.items.find(i => i.label === 'Vista').items.find(i => i.label === 'Letra').disabled, true)
})

test('los submenús conservan la selección al reabrir y cambiar canción es independiente', () => {
  const f = mount({ view: 'disc', choice: 30000, snippetMs: 30000, lang: 'es' })
  assert.equal(f.menu.items.find(i => i.label === 'Vista').items.find(i => i.selected).label, 'Disco')
  assert.equal(f.menu.items.find(i => i.label === 'Duración').items.find(i => i.selected).label, '30 segundos')
  assert.equal(f.menu.items.find(i => i.label === 'Traducción').items.find(i => i.selected).label, 'Español')
  f.menu.items.find(i => i.label === 'Cambiar canción').onPress()
  assert.deepEqual(f.events, [['cancion']])
})
