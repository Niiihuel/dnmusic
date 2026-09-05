const { test } = require('node:test')
const assert = require('node:assert/strict')
const { verificarServicio } = require('../scripts/verificar-servicio.mjs')
const respuesta = (status, body) => new Response(JSON.stringify(body), { status })

test('valida salud, búsquedas y ambas rutas de aporte sin credenciales ni subidas', async () => {
  const rutas = []
  const base = await verificarServicio(' https://music.example.test/ ', async (url, opciones) => {
    rutas.push(new URL(url).pathname)
    assert.equal(opciones.headers?.Authorization, undefined)
    assert.ok(!opciones.body || opciones.body === '{}')
    return url.endsWith('/health') ? respuesta(200, { ok: true }) : respuesta(401, { error: 'No autorizado' })
  })
  assert.equal(base, 'https://music.example.test')
  assert.deepEqual(rutas.sort(), ['/aportar/confirmar', '/aportar/url', '/health', '/search'])
})

test('rechaza un dominio retirado que responde 404 de plataforma', async () => {
  await assert.rejects(verificarServicio('https://retirado.example.test', async () => respuesta(404, { message: 'Application not found' })), /HTTP 404/)
})

test('no alcanza con health: rechaza un rewrite faltante en aportes', async () => {
  await assert.rejects(verificarServicio('https://music.example.test', async (url) => url.endsWith('/health')
    ? respuesta(200, { ok: true })
    : url.endsWith('/aportar/url') ? respuesta(404, {}) : respuesta(401, { error: 'No autorizado' })), /aportar\/url: HTTP 404/)
})

test('rechaza configuración vacía, insegura o con credenciales', async () => {
  for (const base of ['', 'http://music.example.test', 'https://user:pass@music.example.test', 'https://music.example.test?token=x']) {
    await assert.rejects(verificarServicio(base, () => assert.fail('no debe enviar pedidos')))
  }
})
