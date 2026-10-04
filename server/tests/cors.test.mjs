import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'

process.env.ALLOWED_ORIGIN = 'https://dnmusic.example.test,https://otro.example.test'
const { cors } = await import('../dist/cors.js')
const { manejador } = await import('../dist/index.js')
const { manejarLiviana } = await import('../dist/livianas.js')
delete process.env.ALLOWED_ORIGIN
const { cors: corsDesarrollo } = await import('../dist/cors.js?sin-lista')
process.env.ALLOWED_ORIGIN = 'https://dnmusic.example.test,https://otro.example.test'

test('el servicio permite el origen propio de Electron además de los dominios web', () => {
  for (const origen of ['app://dnmusic', 'https://dnmusic.example.test', 'https://otro.example.test']) {
    const headers = cors(origen)
    assert.equal(headers['Access-Control-Allow-Origin'], origen)
    assert.equal(headers.Vary, 'Origin')
    assert.match(headers['Access-Control-Allow-Headers'], /authorization/)
  }
})

test('un origen arbitrario no recibe una cabecera que le permita leer la respuesta', () => {
  assert.equal(cors('app://dnmusic.evil.test')['Access-Control-Allow-Origin'], undefined)
  assert.equal(cors('https://evil.example.test')['Access-Control-Allow-Origin'], undefined)
  assert.equal(cors(undefined)['Access-Control-Allow-Origin'], undefined)
})

test('sin lista configurada, el desarrollo conserva CORS abierto', () => {
  assert.equal(corsDesarrollo('http://localhost:8081')['Access-Control-Allow-Origin'], '*')
})

test('preflight de búsqueda, importación y emparejado permite Electron en ambas entradas HTTP', async t => {
  const servidor = createServer((req, res) => { void manejador(req, res) })
  await new Promise(resolve => servidor.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => servidor.close(resolve)))
  const puerto = servidor.address().port

  for (const ruta of ['/search', '/spotify', '/emparejar']) {
    const respuesta = await fetch(`http://127.0.0.1:${puerto}${ruta}`, {
      method: 'OPTIONS',
      headers: { Origin: 'app://dnmusic', 'Access-Control-Request-Method': ruta === '/emparejar' ? 'POST' : 'GET', 'Access-Control-Request-Headers': 'authorization' },
    })
    assert.equal(respuesta.status, 204, ruta)
    assert.equal(respuesta.headers.get('access-control-allow-origin'), 'app://dnmusic', ruta)
  }

  const liviana = await manejarLiviana(new Request('https://music.example.test/spotify', {
    method: 'OPTIONS',
    headers: { Origin: 'app://dnmusic', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' },
  }))
  assert.equal(liviana?.status, 204)
  assert.equal(liviana.headers.get('access-control-allow-origin'), 'app://dnmusic')
})
