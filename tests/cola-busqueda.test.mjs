import test from 'node:test'
import assert from 'node:assert/strict'
import { colaBusqueda } from '../src/lib/colaBusqueda.ts'
import { proximasCola } from '../src/lib/proximasCola.ts'

const resultado = videoId => ({ videoId, title: videoId, artist: 'Artista', artistId: null, album: '', albumId: null, artworkUrl: 'https://image', durationMs: 180000 })
test('seleccionar el segundo resultado permite precargar los siguientes sin resolver toda la búsqueda', () => {
  const resultados = ['a', 'b', 'c', 'd'].map(resultado)
  const cola = colaBusqueda(resultados[1], resultados)
  assert.equal(cola.index, 1)
  assert.equal(cola.tracks[1].videoId, 'b')
  const siguientes = proximasCola({ ...cola, manual: null, upNext: [], shuffle: null, repetir: 'no' })
  assert.deepEqual(siguientes.map(t => t.videoId), ['c', 'd'])
  assert.ok(siguientes.every(t => t.audioPath === ''))
  resultados.splice(0, resultados.length, resultado('otra búsqueda'))
  assert.deepEqual(cola.tracks.map(t => t.videoId), ['a', 'b', 'c', 'd'])
})
test('conserva audio conocido, elimina duplicados y una tarjeta suelta no arrastra búsquedas ajenas', () => {
  const b = { ...resultado('b'), audioPath: 'b.m4a', artworkPath: 'b.jpg' }
  const cola = colaBusqueda(b, [resultado('a'), resultado('b'), resultado('b'), resultado('c')])
  assert.equal(cola.tracks.length, 3)
  assert.equal(cola.tracks[1].audioPath, 'b.m4a')
  assert.equal(cola.tracks[1].artworkPath, 'b.jpg')
  assert.deepEqual(colaBusqueda(b, [resultado('x')]).tracks.map(t => t.videoId), ['b'])
  assert.equal(colaBusqueda(b).index, 0)
})
