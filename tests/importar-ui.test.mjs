import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const jsx = (type, props) => ({ type, props })
const tick = () => new Promise(resolve => setImmediate(resolve))
function cargar(path, deps) {
  const exports = {}
  const codigo = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('exports', 'require', codigo)(exports, id => { assert.ok(id in deps, `Import no simulado: ${id}`); return deps[id] })
  return exports
}
const parser = cargar('src/services/importar.ts', { './playlists': {}, './music': {}, '../lib/supabase': {} })
const resultado = (i, confianza = 'segura') => {
  const pista = { uri: `spotify:track:${i}`, titulo: `Tema ${i}`, artista: 'Artista', durationMs: 180000, previewUrl: null }
  const track = { videoId: `yt-${i}`, title: pista.titulo, artist: pista.artista, durationMs: 180000, artworkUrl: '' }
  return { pista, confianza, elegido: confianza === 'sin_resultado' ? null : track, candidatos: confianza === 'sin_resultado' ? [] : [{ track, motivo: '', puntaje: 1 }] }
}
function nodos(node, predicate) {
  if (Array.isArray(node)) return node.flatMap(n => nodos(n, predicate))
  if (!node || typeof node !== 'object') return []
  return [...(predicate(node) ? [node] : []), ...nodos(node.props?.children, predicate)]
}
function montar({ width = 1440, resultados = [resultado(0), resultado(1, 'dudosa'), resultado(2, 'sin_resultado')], truncada = false, leer, guardar } = {}) {
  const slots = [], efectos = [], lecturas = [], emparejamientos = [], guardados = [], rutas = []
  let cursor = 0, guardia, vista
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value }] },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial } },
    useCallback(fn) { cursor++; return fn },
    useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((value, j) => !Object.is(value, old[j]))) { slots[i] = deps; efectos.push(fn) } },
  }
  const rn = Object.fromEntries(['ActivityIndicator', 'FlatList', 'Image', 'Pressable', 'Text', 'TextInput', 'View', 'KeyboardAvoidingView'].map(k => [k, k]))
  Object.assign(rn, { Platform: { OS: 'web' }, useWindowDimensions: () => ({ width, height: width === 390 ? 844 : 900 }) })
  const servicios = {
    ...parser,
    leerListaSpotify: async (enlace, signal) => { lecturas.push(enlace); return leer ? leer(signal) : { nombre: 'Mi lista', truncada, pistas: resultados.map(r => r.pista) } },
    leerCancionesSpotify: async ids => { lecturas.push(ids); return resultados.map(r => r.pista) },
    emparejarLista: async pistas => { emparejamientos.push(pistas); return resultados },
    guardarLista: async (...args) => { guardados.push(args); return guardar ? guardar() : { playlistId: 'local-lista', agregadas: args[1].length, repetidas: 0 } },
    terminarEnSegundoPlano: async () => {},
  }
  const deps = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': rn,
    'expo-router': { useRouter: () => router },
    'expo-router/react-navigation': { useNavigation: () => ({ dispatch: action => rutas.push(action) }), usePreventRemove: (activa, callback) => { guardia = { activa, callback } } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'expo-audio': { useAudioPlayer: () => ({ play: () => assert.fail('No debe reproducir audio durante estas pruebas') }) },
    '../src/ui/Field': { PLACEHOLDER_COLOR: '#777' }, '../src/ui/Button': { FormError: 'FormError' },
    '../src/ui/Social': { CabeceraSocial: 'CabeceraSocial', AccionSocial: 'AccionSocial' },
    '../src/ui/Hoja': { Hoja: 'Hoja', useHojaModal: () => width >= 780 },
    '../src/ui/ScrollArea': { ScrollArea: 'ScrollArea' }, '../src/ui/Menu': { Menu: 'Menu' }, '../src/ui/Confirmar': { Confirmar: 'Confirmar' },
    '../src/lib/artwork': { artworkSource: () => null }, '../src/state/playback': { abrirLista: id => rutas.push(id), pauseForSnippet: () => assert.fail('No modificar reproducción') },
    '../src/state/aviso': { avisar() {} }, '../src/lib/volver': { volver: () => rutas.push('/') }, '../src/lib/mensajeError': { mensajeError: e => e.message },
    '../src/ui/icons': new Proxy({ ICON_COLOR: {} }, { get: (target, key) => target[key] ?? key }),
    '../src/services/importar': servicios,
  }
  const router = {}
  const { default: Importar } = cargar('app/importar.tsx', deps)
  function expand(node) {
    if (Array.isArray(node)) return node.map(expand)
    if (!node || typeof node !== 'object') return node
    if (typeof node.type === 'function') return expand(node.type(node.props))
    return { ...node, props: { ...node.props, children: expand(node.props?.children) } }
  }
  function render() { cursor = 0; vista = expand(Importar()); while (efectos.length) efectos.shift()(); return vista }
  const all = type => nodos(vista, n => n.type === type)
  const input = label => all('TextInput').find(n => n.props.accessibilityLabel === label)
  const accion = label => all('AccionSocial').find(n => n.props.label === label)
  const opcion = label => { const items = all('Menu')[0].props.items; return items.flatMap(i => [i, ...(i.items ?? [])]).find(i => i.label === label) }
  async function revisarEnlace() { input('Enlace de la lista').props.onChangeText('https://open.spotify.com/playlist/local'); render(); accion('Revisar canciones').props.onPress(); await tick(); render() }
  render()
  return { render, all, input, accion, opcion, revisarEnlace, expand, lecturas, emparejamientos, guardados, rutas, get guardia() { return guardia } }
}

for (const width of [390, 1440]) {
  test(`entrada ${width}: sólo enlace, sin importación manual, lee al revisar`, async () => {
    const h = montar({ width })
    assert.equal(h.accion('Revisar canciones').props.disabled, true)
    assert.equal(h.all('TextInput').length, 1)
    assert.equal(h.all('Pressable').filter(n => n.props.accessibilityRole === 'tab').length, 0)
    assert.equal(h.lecturas.length, 0)
    await h.revisarEnlace()
    assert.equal(h.lecturas.length, 1)
    assert.equal(h.all('FlatList')[0].props.data.length, 3)
    assert.equal(h.guardados.length, 0)
    h.opcion('Cambiar enlace').onPress(); h.render()
    assert.equal(h.input('Enlace de la lista').props.value, 'https://open.spotify.com/playlist/local')
  })
}

for (const width of [390, 1440]) {
test(`revisión ${width}: lista larga completa, filtros estables y guardado simulado`, async () => {
  const resultados = Array.from({ length: 137 }, (_, i) => resultado(i, i === 130 ? 'dudosa' : 'segura'))
  const h = montar({ width, resultados })
  await h.revisarEnlace()
  assert.equal(h.all('FlatList')[0].props.data.length, 137)
  const ultima = h.all('FlatList')[0].props.renderItem({ item: h.all('FlatList')[0].props.data[136] })
  assert.equal(ultima.props.resultado.pista.titulo, 'Tema 136')
  assert.equal(h.accion('Traer 137 canciones').props.expandida, width < 780)
  assert.equal(h.all('FlatList')[0].props.renderScrollComponent({}).type, 'ScrollArea')
  assert.equal(nodos(h.all('FlatList')[0], n => n.type === 'AccionSocial').length, 0, 'confirmación fuera del scroll')
  h.opcion('Para revisar').onPress(); h.render()
  const lista = h.all('FlatList')[0]
  assert.equal(lista.props.data[0].indice, 130)
  const fila = lista.props.renderItem({ item: lista.props.data[0] })
  fila.props.onElegir(null); h.render()
  h.opcion('Todas las canciones').onPress(); h.render()
  assert.equal(h.all('FlatList')[0].props.data.length, 137)
  h.accion('Traer 136 canciones').props.onPress(); await tick(); h.render()
  assert.equal(h.guardados.length, 1)
  assert.equal(h.guardados[0][1].length, 136)
  assert.ok(!h.guardados[0][1].some(e => e.track.videoId === 'yt-130'))
  assert.equal(h.guardia.activa, false)
  assert.deepEqual(h.rutas, ['local-lista', '/'])
})
}

test('sin coincidencia no inventa selección; opciones permiten limpiar/restaurar y límite API se informa', async () => {
  const h = montar({ truncada: true })
  await h.revisarEnlace()
  assert.equal(h.accion('Pegar la lista completa'), undefined)
  assert.ok(h.all('Text').some(n => JSON.stringify(n.props.children).includes('incompleta')))
  assert.ok(h.accion('Traer 2 canciones'))
  h.opcion('No seleccionar ninguna').onPress(); h.render()
  assert.equal(h.accion('Traer 0 canciones').props.disabled, true)
  h.opcion('Seleccionar encontradas').onPress(); h.render()
  assert.ok(h.accion('Traer 2 canciones'))
  h.opcion('Cambiar enlace').onPress(); h.render()
  assert.ok(h.input('Enlace de la lista'))
  assert.equal(h.guardados.length, 0)
})

test('cancelar lectura ignora la respuesta tardía; guardar bloquea salida y doble confirmación', async () => {
  let resolverLectura
  const h = montar({ leer: () => new Promise(resolve => { resolverLectura = resolve }) })
  h.input('Enlace de la lista').props.onChangeText('enlace'); h.render()
  h.accion('Revisar canciones').props.onPress(); h.render()
  h.all('Pressable').find(n => n.props.children?.props?.children === 'Cancelar').props.onPress(); h.render()
  resolverLectura({ pistas: [resultado(0).pista], nombre: 'Cancelada' }); await tick(); h.render()
  assert.ok(h.input('Enlace de la lista'))
  assert.equal(h.emparejamientos.length, 0)

  let resolverGuardado
  const g = montar({ guardar: () => new Promise(resolve => { resolverGuardado = resolve }) })
  await g.revisarEnlace()
  const confirmar = g.accion('Traer 2 canciones').props.onPress
  confirmar(); confirmar(); g.render()
  assert.equal(g.guardados.length, 1)
  g.guardia.callback({ data: { action: { type: 'BACK' } } }); g.render()
  assert.equal(g.all('Confirmar')[0].props.visible, false)
  resolverGuardado({ playlistId: 'local-lista', agregadas: 2, repetidas: 0 }); await tick(); g.render()
  assert.equal(g.guardia.activa, false)
})

test('error al guardar conserva revisión y elecciones y permite reintentar', async () => {
  let falla = true
  const h = montar({ guardar: async () => { if (falla) throw new Error('Sin conexión'); return { playlistId: 'local', agregadas: 2, repetidas: 0 } } })
  await h.revisarEnlace()
  h.accion('Traer 2 canciones').props.onPress(); await tick(); h.render()
  assert.equal(h.all('FormError')[0].props.message, 'Sin conexión')
  assert.ok(h.accion('Traer 2 canciones'))
  assert.equal(h.rutas.length, 0)
  falla = false
  h.accion('Traer 2 canciones').props.onPress(); await tick(); h.render()
  assert.equal(h.guardados.length, 2)
  assert.deepEqual(h.rutas, ['local', '/'])
})
