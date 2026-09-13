import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const code = ts.transpileModule(readFileSync('src/services/recomendaciones.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const track = (artistId, n) => ({ videoId: `${artistId}:${n}`, title: `Tema ${n}`, artist: artistId, artistId, durationMs: 180000, artworkUrl: '' })
const catalogo = (id, relacionados = []) => Object.freeze({
  topSongs: Object.freeze(Array.from({ length: 6 }, (_, n) => Object.freeze(track(id, n)))),
  relacionados: relacionados.map(id => ({ id, title: id })),
})

function fixture({ random = () => .999, catalogos, historicos = [], recientes = [] }) {
  const pedidos = [], resoluciones = [], rpc = []
  const math = Object.create(Math)
  math.random = random
  const supabase = {
    rpc: async (name, params) => {
      rpc.push([name, params])
      return { data: name === 'artistas_mas_escuchados' ? historicos : recientes.map(video_id => ({ video_id })), error: null }
    },
    from: () => ({ select: () => Object.assign(Promise.resolve({ data: [], error: null }), { eq: async () => ({ data: [], error: null }) }) }),
  }
  const imports = {
    '../lib/artwork': { artworkSource: () => null },
    '../lib/supabase': { getSupabase: () => supabase },
    './music': { fetchArtist: async id => { pedidos.push(id); return catalogos[id] ?? null }, resolveSong: async t => { resoluciones.push(t.videoId); return { path: `${t.videoId}.mp3`, durationMs: t.durationMs } } },
    './gustos': { listarMeGusta: async () => [] },
    './playlists': { listPlaylists: async () => [], listTracks: async () => [] },
  }
  const exports = {}
  vm.runInNewContext(code, { exports, Math: math, require: id => { assert.ok(id in imports, id); return imports[id] } })
  return { ...exports, pedidos, resoluciones, rpc }
}

test('mix: el sorteo recorre el catálogo del artista y no repite siempre sus dos primeros temas', async () => {
  const catalogos = { A: catalogo('A') }
  const ancla = { artist_id: 'A', artist: 'A', ms: 1 }
  const primera = fixture({ catalogos, random: () => .999 })
  const otra = fixture({ catalogos, random: () => 0 })
  const a = await primera.tandaDeMix(ancla)
  const b = await otra.tandaDeMix(ancla)
  assert.equal(a.length, 2)
  assert.equal(b.length, 2, 'el sorteo no relaja el máximo por artista')
  assert.notDeepEqual(Array.from(a, t => t.videoId).sort(), Array.from(b, t => t.videoId).sort())
  assert.deepEqual(Array.from(catalogos.A.topSongs, t => t.videoId), ['A:0', 'A:1', 'A:2', 'A:3', 'A:4', 'A:5'], 'la caché del catálogo conserva su orden')
  assert.equal(b.every(t => t.audioPath === ''), true)
  assert.deepEqual(otra.resoluciones, [], 'el muestreo no inicia descargas')
})

test('sugerencias: respeta canciones de la lista, las ya vistas, duplicados y máximo de dos por artista', async () => {
  const a = catalogo('A', ['B', 'C'])
  const catalogos = { A: { ...a, topSongs: [...a.topSongs, a.topSongs[4]] }, B: catalogo('B'), C: catalogo('C') }
  const f = fixture({ catalogos, random: () => 0 })
  const songs = await f.sugerenciasParaLista([track('A', 0)], ['A:1'], 6)
  assert.equal(songs.length, 6)
  assert.equal(new Set(songs.map(t => t.videoId)).size, 6)
  assert.equal(songs.some(t => ['A:0', 'A:1'].includes(t.videoId)), false)
  const cantidades = new Map()
  for (const t of songs) cantidades.set(t.artistId, (cantidades.get(t.artistId) ?? 0) + 1)
  assert.equal([...cantidades.values()].every(n => n <= 2), true)
  assert.deepEqual(f.resoluciones, [])
})

test('autoplay conserva veto semanal y de cola; contexto actual sigue pesando la mitad del sorteo', async () => {
  for (const [azarInicial, esperado] of [[.49, 'A'], [.51, 'B']]) {
    let llamadas = 0
    const f = fixture({
      random: () => llamadas++ === 0 ? azarInicial : .999,
      catalogos: { A: catalogo('A', ['C', 'D', 'E']), B: catalogo('B'), C: catalogo('C'), D: catalogo('D'), E: catalogo('E') },
      historicos: [{ artist_id: 'A', artist: 'A', ms: 36_000_000 }], recientes: ['A:0'],
    })
    const songs = await f.proximasRecomendadas(['B:0'], [{ artist_id: 'B', artist: 'B', ms: 180000 }])
    assert.equal(f.pedidos[0], esperado, 'una canción de contexto conserva el 50% frente a diez horas históricas')
    assert.equal(songs.length, 8)
    assert.equal(songs.some(t => ['A:0', 'B:0'].includes(t.videoId)), false)
    assert.equal(songs.every(t => t.audioPath === ''), true)
    assert.deepEqual(f.resoluciones, [])
    assert.equal(f.rpc.find(([name]) => name === 'escuchadas_recientes')[1].p_dias, 7)
  }
})
