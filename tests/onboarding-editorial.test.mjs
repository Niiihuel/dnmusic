import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as editorial from '../src/lib/catalogoEditorial.ts'

const jsx = (type, props) => ({ type, props })
const nodes = n => Array.isArray(n) ? n.flatMap(nodes) : n && typeof n === 'object' ? [n, ...nodes(n.props?.children)] : []
const find = (tree, name) => nodes(tree).find(n => n.type === name || n.type?.name === name)
const source = ts.transpileModule(readFileSync('app/onboarding.tsx', 'utf8') + '\nexport { PasoGeneros, PasoArtistas, Encabezado, ArtistaOpcion };', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText
function fixture(name, { width = 390, seeds = [], genres = [], artists = [], failedSeeds = false } = {}) {
  const slots = [], effects = [], writes = [], routes = []
  let cursor = 0, fail = failedSeeds
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
  const react = {
    useState(initial) { const i = cursor++; slots[i] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, v => { slots[i].value = typeof v === 'function' ? v(slots[i].value) : v }] },
    useMemo(f, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { deps, value: f() }; return slots[i].value },
    useCallback(f, deps) { return react.useMemo(() => f, deps) },
    useEffect(f, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) { slots[i]?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = f() }) } },
  }
  const deps = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { Image: 'Image', View: 'View', Text: 'Text', ScrollView: 'ScrollView', useWindowDimensions: () => ({ width }) },
    'expo-router': { useRouter: () => ({ replace: p => routes.push(p) }), useLocalSearchParams: () => ({ de: 'ajustes' }) },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' }, 'expo-linear-gradient': { LinearGradient: 'LinearGradient' },
    '../src/services/music': { fetchGeneros: async () => genres, fetchGenero: async () => artists, proxiedImage: x => x },
    '../src/services/semillas': { listarSemillas: async () => { if (fail) throw Error('offline'); return seeds }, guardarSemillas: async v => writes.push(v), completarOnboarding: async () => {} },
    '../src/lib/volver': { volver: () => routes.push('ajustes') }, '../src/lib/artwork': { artworkUrlAtSize: x => x },
    '../src/lib/catalogoEditorial': editorial,
    '../src/ui/icons': { ICON_COLOR: {}, IconCheck: 'IconCheck' },
  }
  for (const component of ['BotonSuperficie','SearchField','Skeleton','TarjetaGenero']) deps[`../src/ui/${component}`] = { [component]: component }
  deps['../src/ui/Button'] = { FormError: 'FormError', GhostButton: 'GhostButton', PrimaryButton: 'PrimaryButton' }
  const exports = {}
  new Function('exports', 'require', source)(exports, id => { assert.ok(id in deps, id); return deps[id] })
  let props = {}
  const render = next => { if (next) props = next; cursor = 0; return exports[name](props) }
  return { render, exports, writes, routes, fail: v => { fail = v }, async settle() { for (let i = 0; i < 5; i++) { effects.splice(0).forEach(f => f()); await Promise.resolve(); render() } return render() } }
}

test('teléfono y PC muestran tarjetas propias y sólo géneros; elegir conserva params originales', async () => {
  for (const width of [320, 390, 1440]) {
    const h = fixture('PasoGeneros', { width, genres: [{ name: 'Dance & Electronic', params: 'opaque-dance', artworkUrl: 'cover' }, { name: 'Workout', params: 'opaque-workout', artworkUrl: '' }] })
    const chosen = []
    h.render({ elegidos: [], onToggle: g => chosen.push(g), onSeguir() {}, onSaltear() {} })
    const ui = await h.settle(), cards = nodes(ui).filter(n => n.type === 'TarjetaGenero')
    assert.equal(cards.length, 1)
    assert.equal(cards[0].props.nombre, 'Electrónica')
    assert.equal(cards[0].props.ancho, editorial.anchoTarjetaGenero(Math.min(width, 760)))
    cards[0].props.onPress()
    assert.equal(chosen[0].params, 'opaque-dance')
    assert.equal(chosen[0].artworkUrl, 'cover')
    assert.equal(nodes(ui).filter(n => n.type === 'Image').length, 0)
  }
})

test('volver a elegir preserva categorías antiguas y los artistas al guardar', async () => {
  const seeds = [
    { kind: 'genero', ref: 'old-category', name: 'Categoría anterior', artworkUrl: '' },
    { kind: 'artista', ref: 'UC-old', name: 'Artista anterior', artworkUrl: 'photo' },
  ]
  const h = fixture('default', { seeds }); h.render()
  let ui = await h.settle()
  assert.equal(find(ui, 'PasoGeneros').props.elegidos[0].params, 'old-category')
  find(ui, 'PasoGeneros').props.onSeguir(); ui = h.render()
  const artists = find(ui, 'PasoArtistas')
  assert.equal(artists.props.elegidos[0].id, 'UC-old')
  artists.props.onVolver(); ui = h.render()
  assert.equal(find(ui, 'PasoGeneros').props.elegidos[0].params, 'old-category')
  find(ui, 'PasoGeneros').props.onSeguir(); ui = h.render()
  await find(ui, 'PasoArtistas').props.onTerminar()
  assert.deepEqual(h.writes[0], seeds)
  assert.deepEqual(h.routes, ['ajustes'])
})

test('un fallo al leer gustos no permite pisarlos con una selección vacía y ofrece reintento', async () => {
  const h = fixture('default', { failedSeeds: true }); h.render()
  let ui = await h.settle()
  assert.equal(find(ui, 'PasoGeneros'), undefined)
  assert.equal(find(ui, 'PrimaryButton').props.label, 'Reintentar')
  h.fail(false); find(ui, 'PrimaryButton').props.onPress(); h.render(); ui = await h.settle()
  assert.ok(find(ui, 'PasoGeneros'))
  assert.deepEqual(h.writes, [])
})

test('sin catálogo ofrece reintento y mantiene visibles las selecciones anteriores', async () => {
  const previous = { name: 'Rock', params: 'old', artworkUrl: '' }
  const h = fixture('PasoGeneros'); h.render({ elegidos: [previous], onToggle() {}, onSeguir() {}, onSaltear() {} })
  const ui = await h.settle()
  assert.equal(find(ui, 'TarjetaGenero').props.nombre, 'Rock')
  assert.equal(find(ui, 'TarjetaGenero').props.elegido, true)
  assert.equal(find(ui, 'GhostButton').props.label, 'Volver a intentar')
})

test('artistas sugeridos conservan foto y selección; tres habilitan continuar', async () => {
  const h = fixture('PasoArtistas', { artists: [{ kind: 'artist', id: 'UC-1', title: 'Uno', artworkUrl: 'https://example.test/photo' }] })
  const props = { generos: [{ name: 'Rock', params: 'rock' }], elegidos: [], onToggle() {}, onTerminar() {}, onSaltear() {}, onVolver() {} }
  h.render(props); const ui = await h.settle()
  assert.equal(find(ui, 'ArtistaOpcion').props.artista.photoUrl, 'https://example.test/photo')
  assert.equal(find(ui, 'PrimaryButton').props.disabled, true)
  const ready = h.render({ ...props, elegidos: [1, 2, 3].map(id => ({ id: String(id), name: `Artista ${id}`, photoUrl: '' })) })
  assert.equal(find(ready, 'PrimaryButton').props.disabled, undefined)
  assert.equal(find(ready, 'PrimaryButton').props.label, 'Empezar a escuchar')
})
