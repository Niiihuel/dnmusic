import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { prepararInicioJam } from '../src/lib/inicioJam.ts'

const track = (id, audioPath = `${id}.webm`) => ({ id, videoId: id, title: id, artist: 'Artista', artistId: null, artworkUrl: '', artworkPath: null, audioPath, durationMs: 240000 })
const reproduccion = (tracks, index = 0) => ({ tracks, index, manual: null, upNext: [], wantPlay: true, positionMs: 143000 })
const diferida = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
function montar(inicial, resolver = async t => ({ path: `${t.videoId}.webm` })) {
  let playback = inicial, espejo = false
  const rpc = [], avisos = [], resoluciones = []
  const exports = {}
  const deps = {
    '../lib/inicioJam': { prepararInicioJam },
    '../lib/seleccionJam': { crearSeleccionJam: () => ({ cancelar() {} }) },
    '../services/music': { resolveSong: async t => { resoluciones.push(t.videoId); return resolver(t) } },
    'react-native': { AppState: { addEventListener() {} } },
    '../lib/supabase': { getSupabase: () => ({ auth: { getSession: async () => ({ data: { session: { user: { id: 'local-user' } } } }) } }) },
    '../lib/mensajeError': { mensajeError: e => e.message },
    '../services/jam': {
      crearJam: async (canciones, indice, suena, posicionMs) => {
        // Misma precondición de crear_jam: reproducía el mensaje del screenshot.
        if (!canciones.length) throw new Error('No hay nada sonando para compartir')
        assert.ok(canciones[indice]?.audioPath)
        rpc.push({ canciones, indice, suena, posicionMs })
        return { jam: { id: 'local-jam', hostId: 'local-user', itemActual: canciones[indice].id, status: 'activo', suena, posicionMs, arrancadoEn: null, revision: 1 }, cola: canciones, miembros: [], ahora: Date.now() }
      },
      suscribirJam: () => () => {},
    },
    './playback': { getPlaybackState: () => playback, enEscuchaEspejo: () => espejo, registerJam() {}, jamAplicar() {} },
    './ajustes': {}, '../services/recomendaciones': {},
    './aviso': { avisar: (...args) => avisos.push(args) },
    './store': { createStore: initial => { let value = initial; return { get: () => value, set: patch => { value = { ...value, ...patch } } } } },
  }
  const codigo = ts.transpileModule(readFileSync('src/state/jam.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('exports', 'require', codigo)(exports, id => { assert.ok(id in deps, `Dependencia no simulada: ${id}`); return deps[id] })
  return { crear: exports.crearJamActual, rpc, avisos, resoluciones, setPlayback: p => { playback = p }, setEspejo: v => { espejo = v } }
}

test('audio local cargado con snapshot sin ruta: resuelve MerryGo y nunca envía cola vacía', async () => {
  const h = montar({ ...reproduccion([track('MerryGo', '')]), cargada: true })
  assert.equal(await h.crear(), true)
  assert.deepEqual(h.resoluciones, ['MerryGo'])
  assert.equal(h.rpc[0].canciones[0].videoId, 'MerryGo')
  assert.equal(h.rpc[0].posicionMs, 143000)
  assert.equal(h.rpc[0].suena, true)
  assert.deepEqual(h.avisos, [])
})

test('recalcula índice al quitar pendientes anteriores; conserva actual y orden manual', async () => {
  const p = reproduccion([track('pendiente', ''), track('antes'), track('actual'), track('luego')], 2)
  p.upNext = [track('manual'), track('pendiente-manual', '')]
  const h = montar(p)
  assert.equal(await h.crear(), true)
  assert.equal(h.rpc[0].indice, 1)
  assert.deepEqual(h.rpc[0].canciones.map(t => t.id), ['antes', 'actual', 'manual', 'luego'])
  assert.deepEqual(h.resoluciones, [])
})

test('manual actual sin ruta se resuelve y queda primera, antes de retomar la lista', async () => {
  const p = { ...reproduccion([track('antes'), track('luego')]), manual: track('actual-manual', ''), upNext: [track('siguiente-manual')] }
  const h = montar(p)
  await h.crear()
  assert.equal(h.rpc[0].indice, 0)
  assert.deepEqual(h.rpc[0].canciones.map(t => t.id), ['actual-manual', 'siguiente-manual', 'luego'])
})

test('resolver relee pausa y posición; dos inicios simultáneos no duplican el RPC', async () => {
  const espera = diferida(), inicio = diferida()
  const p = reproduccion([track('actual', '')])
  const h = montar(p, async () => { inicio.resolve(); await espera.promise; return { path: 'actual.webm' } })
  const crear = h.crear()
  await inicio.promise
  assert.equal(await h.crear(), false)
  h.setPlayback({ ...p, wantPlay: false, positionMs: 151000 })
  espera.resolve()
  assert.equal(await crear, true)
  assert.equal(h.rpc.length, 1)
  assert.equal(h.rpc[0].posicionMs, 151000)
  assert.equal(h.rpc[0].suena, false)
})

test('espejo remoto visible no crea un host mudo ni pide resolver audio', async () => {
  const h = montar(reproduccion([track('remota')]))
  h.setEspejo(true)
  assert.equal(await h.crear(), false)
  assert.equal(h.rpc.length, 0)
  assert.equal(h.resoluciones.length, 0)
  assert.match(h.avisos[0][0], /otro dispositivo/)
})

for (const cambio of ['cancion', 'remoto']) {
  test(`si cambia ${cambio} durante la resolución no publica el snapshot anterior`, async () => {
    const espera = diferida(), inicio = diferida()
    const h = montar(reproduccion([track('actual', '')]), async () => { inicio.resolve(); await espera.promise; return { path: 'actual.webm' } })
    const crear = h.crear()
    await inicio.promise
    if (cambio === 'cancion') h.setPlayback(reproduccion([track('nueva')]))
    else h.setEspejo(true)
    espera.resolve()
    assert.equal(await crear, false)
    assert.equal(h.rpc.length, 0)
    assert.match(h.avisos[0][0], /reproducción cambió/)
  })
}

test('fallar resolución no publica vacío y permite reintentar', async () => {
  let fallo = true
  const h = montar(reproduccion([track('actual', '')]), async () => { if (fallo) throw new Error('Sin conexión'); return { path: 'actual.webm' } })
  assert.equal(await h.crear(), false)
  assert.equal(h.rpc.length, 0)
  fallo = false
  assert.equal(await h.crear(), true)
  assert.equal(h.rpc.length, 1)
})

test('límite de 500 nunca excluye la canción actual', async () => {
  const h = montar(reproduccion(Array.from({ length: 610 }, (_, i) => track(`t${i}`)), 605))
  await h.crear()
  assert.equal(h.rpc[0].canciones.length, 500)
  assert.equal(h.rpc[0].canciones[h.rpc[0].indice].id, 't605')
})
