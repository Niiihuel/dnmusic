import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const compile = path => ts.transpileModule(readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText
const flush = () => new Promise(resolve => setImmediate(resolve))

function fixture(saved = null, platform = 'ios', random = Math.random) {
  const storeModule = {}, api = {}, avisos = [], writes = []
  new Function('exports', 'require', compile('src/state/store.ts'))(
    storeModule,
    id => id === 'react' ? { useSyncExternalStore: (_subscribe, get) => get() } : (() => { throw new Error(id) })(),
  )
  const storage = {
    getItem: async key => key === 'playback:v1' ? saved : null,
    setItem: async (key, value) => { writes.push([key, JSON.parse(value)]) },
  }
  new Function('exports', 'require', 'Math', compile('src/state/playback.ts'))(api, id => {
    if (id === '@react-native-async-storage/async-storage') return { __esModule: true, default: storage }
    if (id === 'react-native') return { Platform: { OS: platform } }
    if (id === 'react-native-reanimated') return { makeMutable: value => ({ value }) }
    if (id === './store') return storeModule
    if (id === './aviso') return { avisar: message => avisos.push(message) }
    throw new Error(id)
  }, Object.assign(Object.create(Math), { random }))
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

test('releer la playlist que suena no reinicia ni reemplaza la pista activa', () => {
  const { api } = fixture()
  api.playQueue(tracks, 1, { id: 'lista', name: 'Lista' })
  api.reportProgress(72000, tracks[1].durationMs)
  const before = api.getPlaybackState()
  let cambios = 0
  const stop = api.subscribePlayback(() => { cambios++ })

  api.syncQueue('lista', tracks.map(track => ({ ...track })))
  assert.equal(api.getPlaybackState(), before)
  assert.equal(cambios, 0)

  const modificadas = [tracks[2], { ...tracks[0], title: 'Título actualizado' }, tracks[1], tracks[3]]
  api.syncQueue('lista', modificadas)
  const after = api.getPlaybackState()
  assert.equal(after.tracks[after.index], before.tracks[before.index])
  assert.equal(after.index, 2)
  assert.equal(after.positionMs, 72000)
  assert.equal(after.wantPlay, true)
  assert.equal(after.tracks[1].title, 'Título actualizado')
  assert.equal(cambios, 1)
  stop()
})

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

test('Poner a continuación prioriza la cola manual sin interrumpir posición, pausa ni aleatorio', () => {
  const { api } = fixture()
  api.setModoReproduccion('aleatorio')
  api.playQueue(tracks, 1, { id: 'lista', name: 'Lista' })
  api.reportProgress(32000, 180000)
  api.pausePlayback()
  api.enqueue(manual)
  api.enqueue(radio)
  const before = api.getPlaybackState()
  api.enqueueNext(tracks[3])
  const after = api.getPlaybackState()
  assert.equal(after.positionMs, 32000)
  assert.equal(after.wantPlay, false)
  assert.equal(after.index, 1)
  assert.equal(after.shuffle, before.shuffle)
  assert.equal(after.tracks, before.tracks)
  assert.equal(after.origin, before.origin)
  assert.deepEqual(after.upNext.map(t => t.id), [tracks[3].id, manual.id, radio.id])
  api.playNext()
  assert.equal(api.getPlaybackState().manual.id, tracks[3].id)
  api.playNext()
  assert.equal(api.getPlaybackState().manual.id, manual.id)
})

test('repetir lista respeta la prioridad; repetir una conserva su intención hasta saltar explícitamente', () => {
  const { api } = fixture()
  api.playQueue(tracks, tracks.length - 1, null)
  api.toggleRepetir()
  api.enqueueNext(manual)
  api.advance()
  assert.equal(api.getPlaybackState().manual.id, manual.id)
  api.advance()
  assert.equal(api.getPlaybackState().index, 0)
  api.toggleRepetir()
  api.enqueueNext(manual)
  api.advance()
  assert.equal(api.getPlaybackState().manual, null)
  assert.equal(api.getPlaybackState().repetir, 'una')
  assert.equal(api.getPlaybackState().upNext[0].id, manual.id)
  api.playNext()
  assert.equal(api.getPlaybackState().manual.id, manual.id)
})

test('Poner a continuación no altera el Jam y espera autorización de traspaso si otro dispositivo suena', () => {
  const { api, avisos } = fixture()
  api.playQueue(tracks, 0, null)
  api.registerJam({ activo: () => true })
  assert.equal(api.canEnqueueNext(), false)
  api.enqueueNext(manual)
  assert.equal(api.getPlaybackState().upNext.length, 0)
  assert.match(avisos.at(-1), /Jam/)
  api.registerJam(null)
  let continuation
  api.registerEscucha({ retener: fn => { continuation = fn; return true }, espejo: () => true, nombre: () => 'PC' })
  api.enqueueNext(manual)
  assert.equal(api.getPlaybackState().upNext.length, 0)
  api.registerEscucha(null)
  continuation()
  assert.equal(api.getPlaybackState().upNext[0].id, manual.id)
})


test('volumen web: audio inmediato y una sola escritura al terminar la ráfaga', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { api, writes } = fixture(null, 'web')
  api.setVolume(0.2); api.setVolume(0.3); api.setVolume(0.4)
  assert.equal(api.getPlaybackState().volume, 0.4)
  assert.deepEqual(writes, [])
  t.mock.timers.tick(159)
  assert.deepEqual(writes, [])
  t.mock.timers.tick(1)
  assert.deepEqual(writes, [['volume:v1', 0.4]])
  api.setVolume(0.4); api.setVolume(Number.NaN)
  t.mock.timers.tick(200)
  assert.equal(writes.length, 1)
})


for (const modo of ['aleatorio', 'recomendado']) {
  test(`${modo}: iniciar una colección puede comenzar por cualquiera, sin repetir ni omitir temas`, () => {
    for (let primera = 0; primera < tracks.length; primera++) {
      const { api } = fixture(null, 'ios', () => (primera + 0.5) / tracks.length)
      api.setModoReproduccion(modo)
      api.playCollection(tracks, { id: 'lista', name: 'Lista' })
      const state = api.getPlaybackState()
      assert.equal(state.index, primera)
      assert.equal(state.shuffle[0], primera)
      assert.equal(state.durationMs, tracks[primera].durationMs)
      assert.deepEqual([...state.shuffle].sort(), [0, 1, 2, 3])
      const recorridas = [state.index]
      for (let i = 1; i < tracks.length; i++) { api.advance(); recorridas.push(api.getPlaybackState().index) }
      assert.equal(new Set(recorridas).size, tracks.length)
      // Tocar una fila concreta sigue siendo una elección explícita.
      api.playQueue(tracks, 1, { id: 'lista', name: 'Lista' })
      assert.equal(api.getPlaybackState().index, 1)
    }
  })
}
test('inicio en orden, colección vacía y una sola canción mantienen un índice válido', () => {
  const { api } = fixture(null, 'ios', () => 0.99)
  api.playCollection(tracks, null)
  assert.equal(api.getPlaybackState().index, 0)
  const anterior = api.getPlaybackState()
  api.playCollection([], null)
  assert.equal(api.getPlaybackState(), anterior)
  api.setModoReproduccion('aleatorio')
  api.playCollection([tracks[2]], null)
  assert.equal(api.getPlaybackState().index, 0)
  assert.deepEqual(api.getPlaybackState().shuffle, [0])
})
