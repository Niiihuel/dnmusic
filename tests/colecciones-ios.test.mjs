import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const jsx = (type, props) => ({ type, props })
function load(path, dependencies = {}) {
  let cursor = 0
  const states = []
  const react = {
    useState(initial) {
      const at = cursor++
      if (!(at in states)) states[at] = initial
      return [states[at], value => { states[at] = typeof value === 'function' ? value(states[at]) : value }]
    },
    useRef(initial) {
      const at = cursor++
      return states[at] ??= { current: initial }
    },
    useMemo: fn => fn(), useEffect() {},
  }
  const source = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const exports = {}
  new Function('exports', 'require', source)(exports, id => {
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (id in dependencies) return dependencies[id]
    if (id === 'react') return react
    throw Error(`Dependencia sin simular: ${id}`)
  })
  return { exports, render(name, props) { cursor = 0; return exports[name](props) } }
}
function nodes(node, type) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(n => nodes(n, type))
  return [...(node.type === type ? [node] : []), ...nodes(node.props?.children, type)]
}
function expand(node) {
  if (typeof node?.type === 'function') return expand(node.type(node.props))
  return node
}
const icons = { ICON_COLOR: { foreground: '#fff', muted: '#aaa' }, IconSearch: 'IconSearch' }
function search(platform = 'ios', native = 'NativeSearch') {
  let dismisses = 0, animations = 0
  const module = load('src/ui/BusquedaColeccion.tsx', {
    'react-native': { Platform: { OS: platform }, View: 'View', Text: 'Text', Pressable: 'Pressable', TextInput: 'TextInput', Keyboard: { dismiss: () => dismisses++ } },
    'react-native-reanimated': { default: { View: 'AnimatedView' }, useDerivedValue: fn => { animations++; return { value: fn() } }, useAnimatedStyle: fn => fn(), withTiming: n => n, Easing: { out: x => x, cubic: 1 } },
    '../../modules/collection-controls': { CollectionSearch: native },
    './SearchField': { SearchField: 'SearchField' }, './icons': icons,
  })
  return { ...module, dismisses: () => dismisses, animations: () => animations }
}
const props = { contexto: 'lista', abierto: false, filtro: '', onFiltro() {}, onAbrir() {}, vacia: false }

test('iOS: abrir conserva la lupa de 44pt; el campo nativo está fuera de las acciones', () => {
  const h = search()
  for (const abierto of [false, true]) {
    const trigger = expand(h.render('BuscadorColeccion', { ...props, abierto }))
    assert.equal(trigger.type, 'Pressable')
    assert.equal(trigger.props.style.width, 44)
    assert.equal(trigger.props.style.flexShrink, 0)
    assert.equal(trigger.props.accessibilityState.expanded, abierto)
    assert.equal(nodes(trigger, 'NativeSearch').length, 0)
  }
  assert.equal(h.animations(), 0)
  assert.equal(h.render('CampoBusquedaColeccion', props), null)
  const actions = []
  const field = nodes(h.render('CampoBusquedaColeccion', { ...props, abierto: true, contexto: 'álbum', filtro: 'Tema',
    onFiltro: q => actions.push(q), onCerrar: () => actions.push('cancelar') }), 'NativeSearch')[0]
  assert.equal(field.props.placeholder, 'Buscar en este álbum')
  assert.equal(field.props.style.width, '100%')
  assert.equal(field.props.text, 'Tema')
  field.props.onChangeText({ nativeEvent: { text: 'Artista' } })
  field.props.onCancel()
  assert.deepEqual(actions, ['Artista', 'cancelar'])
})

test('abrir, filtrar, cancelar y cambiar colección limpian estado y teclado', () => {
  const h = search()
  let state = h.render('useBusquedaColeccion', 'lista-a')
  state.alternar()
  state = h.render('useBusquedaColeccion', 'lista-a')
  assert.equal(state.abierto, true)
  state.setFiltro('tema')
  state = h.render('useBusquedaColeccion', 'lista-a')
  assert.equal(state.filtro, 'tema')
  state.alternar()
  state = h.render('useBusquedaColeccion', 'lista-a')
  assert.equal(state.filtro, '')
  assert.equal(state.abierto, false)
  assert.equal(h.dismisses(), 1)
  state.alternar()
  state = h.render('useBusquedaColeccion', 'lista-a')
  state.setFiltro('tema')
  state = h.render('useBusquedaColeccion', 'lista-b')
  assert.equal(state.filtro, '')
  assert.equal(state.abierto, false)
})

test('cliente iOS anterior conserva campo independiente, limpiar nativo y cancelar', () => {
  const h = search('ios', null)
  let cancelled = false
  const ui = h.render('CampoBusquedaColeccion', { ...props, abierto: true, onCerrar: () => { cancelled = true } })
  const field = nodes(ui, 'TextInput')[0]
  assert.equal(field.props.clearButtonMode, 'while-editing')
  assert.equal(field.props.autoFocus, true)
  nodes(ui, 'Pressable')[0].props.onPress()
  assert.equal(cancelled, true)
})

test('web conserva expansión y no monta el campo de contenido iOS; lista vacía deshabilita lupa', () => {
  const h = search('web')
  const ui = expand(h.render('BuscadorColeccion', { ...props, abierto: true }))
  assert.equal(ui.props.style[1].width, 300)
  assert.equal(nodes(ui, 'SearchField').length, 1)
  assert.equal(h.render('CampoBusquedaColeccion', { ...props, abierto: true }), null)
  assert.equal(expand(search().render('BuscadorColeccion', { ...props, vacia: true })).props.disabled, true)
})

const reparto = load('src/ui/menuReparto.ts').exports
const menuDeps = {
  'react-native': { View: 'View', StyleSheet: { absoluteFill: { position: 'absolute', inset: 0 } } },
  '../../modules/collection-controls': { CollectionContext: 'NativeContext' }, './menuReparto': reparto,
}
function entries(items) { return items.flatMap(i => [i, ...entries(i.children ?? [])]) }

test('menú UIKit conserva grupos, subtítulo, estado y bloqueos; labels repetidos no confunden acciones', () => {
  const h = load('src/ui/MenuContextualColeccion.tsx', menuDeps)
  const calls = []
  const action = label => () => calls.push(label)
  const prepared = h.exports.prepararMenuContextual([
    { label: 'Guardar', rapida: true, onPress: action('guardar') },
    { label: 'Igual', onPress: action('primera'), subtitle: 'Detalle', selected: true },
    { label: 'Igual', separadorAntes: true, onPress: action('segunda') },
    { label: 'Submenú', disabled: true, items: [{ label: 'Bloqueada', onPress: action('error') }] },
    { label: 'Borrar', destructive: true, onPress: action('borrar') },
  ])
  const all = entries(prepared.items)
  assert.equal(prepared.items[0].small, true)
  assert.ok(prepared.items.filter(i => i.inline).length >= 3)
  const same = all.filter(i => i.label === 'Igual')
  assert.equal(same[0].subtitle, 'Detalle')
  assert.equal(same[0].selected, true)
  for (const item of same) prepared.acciones.get(item.id)()
  assert.deepEqual(calls, ['primera', 'segunda'])
  const blocked = all.find(i => i.label === 'Bloqueada')
  assert.equal(blocked.disabled, true)
  assert.equal(prepared.acciones.has(blocked.id), false)
  assert.equal(all.find(i => i.label === 'Borrar').destructive, true)
})

test('menú no remonta ni mide la fila y mantiene las acciones de la apertura ante cambios detrás', () => {
  const h = load('src/ui/MenuContextualColeccion.tsx', menuDeps)
  const child = jsx('TrackRow', { title: 'Tema' }), calls = []
  let ui = h.render('MenuContextualColeccion', { children: child, items: [{ label: 'Acción', onPress: () => calls.push('original') }] })
  assert.equal(ui.props.collapsable, false)
  assert.equal(ui.props.children[1], child)
  const native = nodes(ui, 'NativeContext')[0]
  assert.equal(native.props.pointerEvents, 'none')
  assert.equal(native.props.style.position, 'absolute')
  const id = entries(native.props.items).find(i => i.id).id
  native.props.onOpen()
  ui = h.render('MenuContextualColeccion', { children: child, items: [{ label: 'Otra', onPress: () => calls.push('incorrecta') }] })
  nodes(ui, 'NativeContext')[0].props.onSelect({ nativeEvent: { id } })
  assert.deepEqual(calls, ['original'])
})

const tracks = [{ videoId: 'a', title: 'Primera', artist: 'Uno' }, { videoId: 'b', title: 'Segunda', artist: 'Dos' }, { videoId: 'c', title: 'Tercera', artist: 'Dos' }]
function album(query) {
  let state = 0
  return load('src/ui/AlbumPanel.tsx', {
    react: { useState: () => [state++ === 0 ? { id: 'album', info: { tracks, title: 'Álbum', artworkUrl: 'cover' } } : null, () => {}], useEffect() {} },
    'react-native': { View: 'View', Image: 'Image', Pressable: 'Pressable', Text: 'Text', useWindowDimensions: () => ({ width: 390 }) },
    '../lib/artwork': { artworkSource: () => 'cover' }, '../services/music': {},
    '../state/playback': { usePlaybackTrack: () => null, useWantPlay: () => false },
    './CollectionHeader': { CollectionHeader: 'CollectionHeader', CollectionTitle: 'CollectionTitle', useCoverSize: () => 160 },
    '../lib/colorPortada': { useColorPortada: () => null }, '../state/shell': { useTecho: () => 0 },
    '../services/showcases': {}, '../lib/supabase': {}, '../state/aviso': {},
    './Menu': { Menu: 'Menu' }, './SeekBar': { formatLength: () => '' }, './Skeleton': {},
    './TrackRow': { TrackRow: 'TrackRow', TrackColumnHeader: 'TrackColumnHeader' },
    './BusquedaColeccion': { useBusquedaColeccion: () => ({ abierto: true, filtro: query }), BuscadorColeccion: 'BuscadorColeccion', CampoBusquedaColeccion: 'CampoBusquedaColeccion' },
    './Vacio': { Vacio: 'Vacio' }, './BotonMeGusta': {}, './Transport': { BotonAleatorio: 'BotonAleatorio' },
    '../state/gustos': {}, './icons': icons,
  })
}

test('álbum filtra por título/artista y reproduce el índice original en la cola completa', () => {
  const calls = []
  const ui = album('  dOs ').render('AlbumPanel', { albumId: 'album', kind: 'album', onPlay: (...args) => calls.push(args) })
  const rows = nodes(ui, 'TrackRow')
  assert.deepEqual(rows.map(r => r.props.title), ['Segunda', 'Tercera'])
  rows[1].props.onPlay()
  assert.equal(calls[0][0], tracks[2])
  assert.equal(calls[0][2], tracks)
  assert.equal(calls[0][3], 2)
  const empty = album('inexistente').render('AlbumPanel', { albumId: 'album', kind: 'album' })
  assert.equal(nodes(empty, 'TrackRow').length, 0)
  assert.equal(nodes(empty, 'Vacio')[0].props.titulo, 'Sin resultados')
})
