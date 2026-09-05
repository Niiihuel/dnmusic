const { test } = require('node:test')
const assert = require('node:assert/strict')
const { Innertube } = require('youtubei.js')
const { configurarProveedorTokens } = require('../dist/potoken.js')
const { inspeccionarAudio } = require('../dist/resolutor.js')

test('inspección fuerza un cliente, evita DRM y reutiliza un token por video', async t => {
  const requests = [], tokens = []
  let sesiones = 0
  const yt = {
    session: { context: { client: { visitorData: 'visitor' } }, player: {} },
    getBasicInfo: async (id, options) => {
      requests.push(options)
      if (options.client === 'TV') return { playability_status: { status: 'UNPLAYABLE' } }
      return {
        basic_info: { duration: 4 },
        streaming_data: { adaptive_formats: [
          { mime_type: 'audio/mp4', url: 'x', bitrate: 500, drm_families: ['widevine'],
            decipher: async () => assert.fail('no usar DRM') },
          { mime_type: 'audio/mp4', url: 'x', bitrate: 100, itag: 140, content_length: 4,
            decipher: async () => 'https://example.test/audio?sig=secret&pot=old' },
        ] },
      }
    },
  }
  t.mock.method(Innertube, 'create', async () => { sesiones++; return yt })
  t.mock.method(globalThis, 'fetch', async input => {
    assert.equal(input, 'https://music.youtube.com/')
    return new Response('"INNERTUBE_CLIENT_VERSION":"1.test"')
  })
  configurarProveedorTokens(async binding => { tokens.push(binding); return 'token-test' })
  const info = await inspeccionarAudio('nhys3nF4ZDU', { cliente: 'MWEB' })
  assert.equal(info.formato.itag, 140)
  assert.equal(info.durationMs, 4000)
  assert.doesNotMatch(JSON.stringify(info), /secret|token-test|example.test/)
  assert.deepEqual(tokens, ['visitor', 'nhys3nF4ZDU'])
  assert.deepEqual(requests.map(r => r.client), ['MWEB'])
  assert.equal(requests[0].po_token, 'token-test')
  assert.equal(sesiones, 2)
  await assert.rejects(inspeccionarAudio('nhys3nF4ZDU', { cliente: 'TV' }), /Sin audio/)
  assert.deepEqual(requests.map(r => r.client), ['MWEB', 'TV'])
  configurarProveedorTokens(async () => { throw new Error('BotGuard no disponible') })
  await assert.rejects(inspeccionarAudio('nhys3nF4ZDU'), /BotGuard/)
  assert.equal(requests.length, 2)
})
