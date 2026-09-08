import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const compile = path => ts.transpileModule(readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText
const flush = () => new Promise(resolve => setImmediate(resolve))

function fixture(saved = null) {
  const storeModule = {}, api = {}, avisos = [], writes = []
  new Function('exports', 'require', compile('src/state/store.ts'))(
    storeModule,
    id => id === 'react' ? { useSyncExternalStore: (_subscribe, get) => get() } : (() => { throw new Error(id) })(),
  )
  const storage = {
    getItem: async key => key === 'playback:v1' ? saved : null,
    setItem: async (key, value) => { writes.push([key, JSON.parse(value)]) },
  }
  new Function('exports', 'require', compile('src/state/playback.ts'))(api, id => {
    if (id === '@react-native-async-storage/async-storage') return { __esModule: true, default: storage }
    if (id === 'react-native-reanimated') return { makeMutable: value => ({ value }) }
    if (id === './store') return storeModule
    if (id === './aviso') return { avisar: message => avisos.push(message) }
    throw new Error(id)
  })
  return { api, avisos, writes }
}

const tracks = [0, 1, 2, 3].map(i => ({
  id: `track-${i}`,
  videoId: `video-${i}`,
  title: `Tema ${i}`,
  artist: `Artista ${i % 2}`,
  artistId: `artist-${i % 2}`,
  audioPath: `audio-${i}`,
  artworkPath: null,
  artworkUrl: '',
  durationMs: 180000,
}))
const radio = { ...tracks[0], id: 'radio:nueva', videoId: 'radio-video' }
const manual = { ...tracks[1], id: 'manual:nueva', videoId: 'manual-video' }

test('el selector rota orden, aleatorio y descubrimiento sin cambiar la canción actual', () => {
  const { api, avisos } = fixture()
  api.playQueue(tracks, 2, { id: 'lista', name: 'Lista' })
  assert.equal(api.getPlaybackState().modoReproduccion, 'orden')
  assert.equal(api.getPlaybackState().shuffle, null)

  api.toggleShuffle()
  const aleatorio = api.getPlaybackState()
  assert.equal(aleatorio.modoReproduccion, 'aleatorio')
  assert.equal(aleatorio.shuffle[0], 2)
  assert.deepEqual([...aleatorio.shuffle].sort((a, b) => a - b), [0, 1, 2, 3])
  assert.equal(aleatorio.index, 2)

  api.toggleShuffle()
  assert.equal(api.getPlaybackState().modoReproduccion, 'recomendado')
  assert.deepEqual(api.getPlaybackState().shuffle, aleatorio.shuffle)

  api.enqueue(manual)
  api.enqueue(radio)
  api.toggleShuffle()
  const orden = api.getPlaybackState()
  assert.equal(orden.modoReproduccion, 'orden')
  assert.equal(orden.shuffle, null)
  assert.deepEqual(orden.upNext.map(t => t.id), [manual.id])
  assert.deepEqual(avisos, [
    'Aleatorio · solo esta colección',
    'Descubrimiento · aleatorio y recomendaciones',
    'Reproducción en orden',
  ])
})

test('solo Descubrimiento pide y agrega canciones recomendadas', async () => {
  const puro = fixture()
  let pedidosPuros = 0
  puro.api.registerRelleno(async () => { pedidosPuros++; return [radio] })
  puro.api.setModoReproduccion('aleatorio')
  puro.api.playQueue([tracks[0]], 0, null)
  puro.api.rellenarSiFalta()
  await flush()
  assert.equal(pedidosPuros, 0)
  assert.deepEqual(puro.api.getPlaybackState().upNext, [])

  const smart = fixture()
  let pedidosSmart = 0
  smart.api.registerRelleno(async () => { pedidosSmart++; return [radio] })
  smart.api.setModoReproduccion('recomendado')
  smart.api.playQueue([tracks[0]], 0, null)
  smart.api.rellenarSiFalta()
  await flush()
  await flush()
  assert.equal(pedidosSmart, 1)
  assert.deepEqual(smart.api.getPlaybackState().upNext.map(t => t.id), [radio.id])
})


test('Descubrimiento intercala una sugerencia cada tres temas y reutiliza la reserva', async () => {
  const f = fixture()
  const radio2 = { ...radio, id: 'radio:segunda', videoId: 'radio-video-2' }
  let pedidos = 0
  f.api.registerRelleno(async () => { pedidos++; return [radio, radio2] })
  f.api.setModoReproduccion('recomendado')
  f.api.playQueue(tracks, 0, { id: 'lista', name: 'Lista' })

  f.api.rellenarSiFalta()
  assert.equal(pedidos, 0)
  f.api.advance()
  f.api.rellenarSiFalta()
  assert.equal(pedidos, 0)
  f.api.advance()
  f.api.rellenarSiFalta()
  await flush()
  await flush()

  assert.equal(pedidos, 1)
  assert.deepEqual(f.api.getPlaybackState().upNext.map(t => t.id), [radio.id])
  f.api.advance()
  assert.equal(f.api.getPlaybackState().manual?.id, radio.id)
  f.api.advance()
  assert.equal(f.api.getPlaybackState().manual, null)

  /* La cuarta y última canción consume el resto de la tanda ya obtenida, sin
     otra consulta ni un silencio al terminar la colección. */
  f.api.rellenarSiFalta()
  assert.equal(pedidos, 1)
  assert.deepEqual(f.api.getPlaybackState().upNext.map(t => t.id), [radio2.id])
})

test('una recomendación en vuelo se descarta al abandonar Descubrimiento', async () => {
  const f = fixture()
  let resolver
  f.api.registerRelleno(() => new Promise(resolve => { resolver = resolve }))
  f.api.setModoReproduccion('recomendado')
  f.api.playQueue([tracks[0]], 0, null)
  f.api.rellenarSiFalta()
  f.api.setModoReproduccion('orden')
  resolver([radio])
  await flush()
  await flush()
  assert.deepEqual(f.api.getPlaybackState().upNext, [])
})


test('una cola nueva puede preparar su radio aunque la anterior siga en vuelo', async () => {
  const f = fixture()
  const resolvers = []
  f.api.registerRelleno(() => new Promise(resolve => resolvers.push(resolve)))
  f.api.setModoReproduccion('recomendado')
  f.api.playQueue([tracks[0]], 0, { id: 'primera', name: 'Primera' })
  f.api.rellenarSiFalta()
  f.api.playQueue([tracks[1]], 0, { id: 'segunda', name: 'Segunda' })
  f.api.rellenarSiFalta()
  assert.equal(resolvers.length, 2)

  const vieja = { ...radio, id: 'radio:vieja', videoId: 'radio-vieja' }
  const nueva = { ...radio, id: 'radio:nueva-cola', videoId: 'radio-nueva-cola' }
  resolvers[0]([vieja])
  resolvers[1]([nueva])
  await flush()
  await flush()
  assert.deepEqual(f.api.getPlaybackState().upNext.map(t => t.id), [nueva.id])
})

test('el modo elegido persiste incluso sin una cola activa', async () => {
  const first = fixture()
  first.api.setModoReproduccion('recomendado')
  await flush()
  const saved = first.writes.find(([key]) => key === 'playback:v1')?.[1]
  assert.equal(saved.modoReproduccion, 'recomendado')

  const restored = fixture(JSON.stringify(saved))
  await restored.api.restorePlayback()
  assert.equal(restored.api.getPlaybackState().modoReproduccion, 'recomendado')
  assert.equal(restored.api.getPlaybackState().shuffle, null)
})
