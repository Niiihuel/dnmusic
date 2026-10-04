import test from 'node:test'
import assert from 'node:assert/strict'
import { catalogoGeneros, identidadGenero, nombreGenero, tituloEditorial, tituloListaEditorial, subtituloEditorial, anchoTarjetaGenero } from '../src/lib/catalogoEditorial.ts'

test('el catálogo traduce sin modificar referencias, imágenes ni orden del proveedor', () => {
  const entrada = ['Rock', 'Indie & Alternative', 'Workout', 'Dance & Electronic', 'R&B & Soul', 'Unknown campaign'].map((name, i) => ({ name, params: `opaque-${i}`, artworkUrl: `https://art/${i}` }))
  const copia = structuredClone(entrada)
  const salida = catalogoGeneros(entrada)
  assert.deepEqual(salida.map(g => g.name), ['Rock', 'Indie y alternativo', 'Para entrenar', 'Electrónica', 'R&B y soul'])
  assert.deepEqual(salida.map(g => g.params), entrada.slice(0, 5).map(g => g.params))
  assert.deepEqual(salida.map(g => g.artworkUrl), entrada.slice(0, 5).map(g => g.artworkUrl))
  assert.deepEqual(entrada, copia)
  assert.equal(catalogoGeneros(salida).length, salida.length, 'normalización idempotente')
  assert.equal(catalogoGeneros(entrada, 'genero').some(g => g.params === 'opaque-2'), false)
  assert.equal(identidadGenero('Clásica').tipo, 'genero')
  assert.equal(nombreGenero('Rock en Español'), 'Rock en español')
})

test('no mezcla referencias distintas aunque tengan el mismo nombre visible', () => {
  const gs = [{ params: 'one', name: 'Pop' }, { params: 'two', name: 'Pop' }, { params: 'one', name: 'Pop' }]
  assert.deepEqual(catalogoGeneros(gs).map(g => g.params), ['one', 'two'])
})

test('el inicio tiene copy propio y respeta títulos musicales originales', () => {
  assert.equal(tituloEditorial('New albums & singles'), 'Recién llegados')
  assert.equal(tituloEditorial('Trending'), 'Lo que está sonando')
  assert.equal(tituloEditorial('A brand new English campaign'), 'Para descubrir')
  assert.equal(tituloListaEditorial('Radiohead Essentials'), 'Lo esencial de Radiohead')
  assert.equal(tituloListaEditorial('Presenting Joji'), 'Lo esencial de Joji')
  assert.equal(tituloListaEditorial('Indie & Alternative Hits'), 'Éxitos de Indie y alternativo')
  assert.equal(tituloListaEditorial('OK Computer'), 'OK Computer')
  assert.equal(subtituloEditorial('Playlist • YouTube Music'), 'Lista · Selección musical')
  assert.equal(subtituloEditorial('Cigarettes After Sex • 2017'), 'Cigarettes After Sex · 2017')
})

test('las tarjetas caben en teléfonos angostos y en el máximo de escritorio', () => {
  for (const width of [280, 320, 375, 390, 430, 760]) {
    const available = width - 48
    const columns = Math.max(1, Math.floor((available + 12) / 150))
    const card = anchoTarjetaGenero(width)
    assert.ok(card > 0)
    assert.ok(Math.abs(card * columns + (columns - 1) * 12 - available) < .001)
  }
})
