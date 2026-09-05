const { test } = require('node:test')
const assert = require('node:assert/strict')
const { bajarPorRangos, ErrorDescargaYouTube } = require('../dist/descarga-youtube.js')
const { scriptTokens } = require('../dist/potoken-script.js')
const { Script } = require('node:vm')
const MB = 1 << 20
const url = 'https://example.test/audio?sig=a%2Fb%3D&pot=abc%3D'
const response = (start, end, total, bytes = end - start + 1) => new Response(Buffer.alloc(bytes, start ? 2 : 1), {
  status: 206, headers: { 'content-range': `bytes ${start}-${end}/${total}` },
})

test('descarga en serie, mantiene la URL firmada y limita el último rango', async () => {
  const ranges = []
  let active = 0
  const total = MB * 2 + 25
  const result = await bajarPorRangos(url, { headers: {}, totalEsperado: total, fetch: async (input, init) => {
    assert.equal(input, url)
    assert.equal(++active, 1)
    ranges.push(init.headers.Range)
    const [, a, b] = /bytes=(\d+)-(\d+)/.exec(init.headers.Range)
    await new Promise(resolve => setImmediate(resolve))
    active--
    return response(Number(a), Number(b), total)
  } })
  assert.deepEqual(ranges, [`bytes=0-${MB - 1}`, `bytes=${MB}-${MB * 2 - 1}`, `bytes=${MB * 2}-${total - 1}`])
  assert.equal(result.length, total)
  assert.equal(result[0], 1)
  assert.equal(result[MB], 2)
})

test('403 en el segundo MiB corta sin reintentos ni otros rangos', async () => {
  let calls = 0
  await assert.rejects(bajarPorRangos(url, { headers: {}, esperar: async () => assert.fail('no debe esperar'), fetch: async () => {
    calls++
    return calls === 1 ? response(0, MB - 1, MB * 4) : new Response('', { status: 403 })
  } }), e => e instanceof ErrorDescargaYouTube && e.status === 403 && e.desde === MB && e.pausaMs === 60000)
  assert.equal(calls, 2)
})

test('429 conserva Retry-After y no reintenta', async () => {
  let calls = 0
  await assert.rejects(bajarPorRangos(url, { headers: {}, fetch: async () => {
    calls++
    return new Response('', { status: 429, headers: { 'retry-after': '120' } })
  } }), e => e.pausaMs === 120000)
  assert.equal(calls, 1)
})

test('503 y error de red se reintentan con espera y límite', async () => {
  const waits = []
  let calls = 0
  const result = await bajarPorRangos(url, { headers: {}, esperar: async ms => waits.push(ms), fetch: async () => {
    if (++calls === 1) return new Response('', { status: 503 })
    if (calls === 2) throw new TypeError('fetch failed')
    return response(0, 3, 4)
  } })
  assert.equal(result.length, 4)
  assert.deepEqual(waits, [600, 1800])
  calls = 0
  await assert.rejects(bajarPorRangos(url, { headers: {}, esperar: async () => {}, fetch: async () => {
    calls++
    return new Response('', { status: 503 })
  } }), /503/)
  assert.equal(calls, 3)
})

for (const [name, makeResponse] of [
  ['sin Content-Range', () => new Response('abcd', { status: 206 })],
  ['rango truncado', () => response(0, 3, 4, 2)],
  ['inicio incorrecto', () => response(1, 3, 4)],
  ['total inconsistente', () => response(0, 3, 5)],
  ['200 truncado', () => new Response('ab')],
]) test(`rechaza ${name}`, async () => {
  let calls = 0
  await assert.rejects(bajarPorRangos(url, { headers: {}, totalEsperado: 4, fetch: async () => {
    calls++
    return makeResponse()
  } }), /inconsistente/)
  assert.equal(calls, 1)
})

test('acepta 200 completo al inicio y rechaza 200 a mitad de descarga', async () => {
  const full = await bajarPorRangos(url, { headers: {}, totalEsperado: 4, fetch: async () => new Response('abcd') })
  assert.equal(full.toString(), 'abcd')
  let calls = 0
  await assert.rejects(bajarPorRangos(url, { headers: {}, fetch: async () => ++calls === 1
    ? response(0, MB - 1, MB * 2) : new Response(Buffer.alloc(MB * 2)) }), /respondió 200/)
})

test('el bundle de BgUtils instalado genera JavaScript válido para Chromium', () => {
  assert.doesNotThrow(() => new Script(scriptTokens()))
})

test('cancelar antes de iniciar evita cualquier pedido', async () => {
  const c = new AbortController(); c.abort()
  await assert.rejects(bajarPorRangos(url, { headers: {}, signal: c.signal,
    fetch: async () => assert.fail('no debe pedir') }), { name: 'AbortError' })
})

test('cancelar entre rangos detiene el resto de la descarga', async () => {
  const c = new AbortController()
  let calls = 0
  await assert.rejects(bajarPorRangos(url, { headers: {}, signal: c.signal,
    onEvento: e => { if (e.etapa === 'rango' && e.bytes) c.abort() },
    fetch: async () => { calls++; return response(0, MB - 1, MB * 3) } }), { name: 'AbortError' })
  assert.equal(calls, 1)
})

test('503 respeta Retry-After y una espera larga no reintenta', async () => {
  let calls = 0
  const waits = []
  await bajarPorRangos(url, { headers: {}, esperar: async ms => waits.push(ms), fetch: async () => ++calls === 1
    ? new Response('', { status: 503, headers: { 'retry-after': '2' } }) : response(0, 3, 4) })
  assert.deepEqual(waits, [2000])
  await assert.rejects(bajarPorRangos(url, { headers: {}, esperar: async () => assert.fail(),
    fetch: async () => new Response('', { status: 503, headers: { 'retry-after': '120' } }) }), e => e.pausaMs === 120000)
})

test('una cancelación de cuerpo fallida no oculta el estado HTTP', async () => {
  await assert.rejects(bajarPorRangos(url, { headers: {}, fetch: async () => ({
    status: 403, headers: new Headers(), body: { cancel: async () => { throw new Error('body failed') } },
  }) }), e => e.status === 403)
})

test('bloques configurables y eventos no exponen la URL ni el token', async () => {
  const events = [], ranges = []
  await bajarPorRangos(url, { headers: {}, chunkBytes: 65536, totalEsperado: 65540,
    onEvento: e => events.push(e), fetch: async (_, init) => {
      ranges.push(init.headers.Range)
      const [, start, end] = /bytes=(\d+)-(\d+)/.exec(init.headers.Range)
      return response(Number(start), Number(end), 65540)
    } })
  assert.deepEqual(ranges, ['bytes=0-65535', 'bytes=65536-65539'])
  assert.equal(events.filter(e => e.bytes).at(-1).bytes, 4)
  assert.doesNotMatch(JSON.stringify(events), /example|sig=|pot=/)
})

test('valida tamaños antes de hacer red', async () => {
  for (const config of [{ totalEsperado: -1 }, { chunkBytes: 0 }, { chunkBytes: Infinity }]) {
    await assert.rejects(bajarPorRangos(url, { ...config, headers: {}, fetch: async () => assert.fail() }), /inválido|bloque/)
  }
})
