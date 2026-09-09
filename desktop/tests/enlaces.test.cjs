const { test } = require('node:test')
const assert = require('node:assert/strict')
const { rutaDeEnlace, enlaceEnArgumentos, EntregaDeEnlaces } = require('../dist/enlaces.js')

/**
 * Los `dnmusic://` que le llegan al escritorio.
 *
 * Lo que más importa acá es lo que **no** se reconoce: esto convierte texto que
 * viene del sistema operativo en una ruta que el renderer navega, así que un
 * link de otro lado no puede terminar en un `router.push`.
 */

test('reconoce el esquema propio y el link del sitio', () => {
  assert.equal(rutaDeEnlace('dnmusic://cancion/abc123'), '/cancion/abc123')
  assert.equal(rutaDeEnlace('dnmusic://jam/ABC123'), '/jam/ABC123')
  assert.equal(rutaDeEnlace('https://dnmusic-app.vercel.app/lista/un-uuid'), '/lista/un-uuid')
  assert.equal(rutaDeEnlace('  dnmusic://perfil/nihuel  '), '/perfil/nihuel')
})

test('una canción propia conserva sus dos puntos, codificados', () => {
  const id = 'propia:0f8e2c1a-4b5d-4c6e-8f90-1a2b3c4d5e6f'
  assert.equal(rutaDeEnlace(`dnmusic://cancion/${encodeURIComponent(id)}`), `/cancion/${encodeURIComponent(id)}`)
})

test('no convierte nada ajeno en una ruta de la app', () => {
  for (const entrada of [
    'https://otro.test/cancion/abc',
    'https://dnmusic-app.vercel.app.evil.test/cancion/abc',
    'dnmusic://ajustes/accesos',
    'dnmusic://cancion/',
    'file:///etc/passwd',
    '--inspect=9229',
    '',
    null,
    undefined,
  ]) {
    assert.equal(rutaDeEnlace(entrada), null, String(entrada))
  }
})

test('encuentra el link entre los argumentos del sistema', () => {
  assert.equal(
    enlaceEnArgumentos(['/usr/bin/dnmusic', '--no-sandbox', 'dnmusic://cancion/abc']),
    '/cancion/abc',
  )
  assert.equal(enlaceEnArgumentos(['/usr/bin/dnmusic', '--no-sandbox']), null)
})

test('el link que llega antes que la ventana no se pierde', () => {
  const entrega = new EntregaDeEnlaces()
  assert.equal(entrega.recibir('dnmusic://cancion/abc'), true)
  const vistas = []
  entrega.conectar((r) => vistas.push(r))
  assert.deepEqual(vistas, ['/cancion/abc'], 'se entrega apenas hay ventana')
  entrega.recibir('dnmusic://lista/otra')
  assert.deepEqual(vistas, ['/cancion/abc', '/lista/otra'], 'y lo de después va derecho')
})

test('de varios links esperando se abre el último', () => {
  const entrega = new EntregaDeEnlaces()
  entrega.recibir('dnmusic://cancion/uno')
  entrega.recibir('dnmusic://cancion/dos')
  const vistas = []
  entrega.conectar((r) => vistas.push(r))
  assert.deepEqual(vistas, ['/cancion/dos'])
})

test('cerrada la ventana, lo próximo vuelve a esperar', () => {
  const entrega = new EntregaDeEnlaces()
  const vistas = []
  entrega.conectar((r) => vistas.push(r))
  entrega.desconectar()
  entrega.recibir('dnmusic://cancion/abc')
  assert.deepEqual(vistas, [], 'no se le manda a una ventana que no está')
  entrega.conectar((r) => vistas.push(r))
  assert.deepEqual(vistas, ['/cancion/abc'])
})
