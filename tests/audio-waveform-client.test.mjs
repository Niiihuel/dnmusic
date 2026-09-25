import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { validMixSpectrum } from '../src/lib/mixSpectrum.ts'

const source = ts.transpileModule(readFileSync('src/services/music.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const requests = []
const exports = {}
new Function('exports', 'require', 'process', 'fetch', source)(exports, id => {
  if (id === '../lib/trabajosCompartidos') return { trabajosCompartidos: () => ({}) }
  if (id === '../lib/supabase') return {
    getSupabase: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'jwt-de-prueba' } } }) } }),
  }
  if (id === '../lib/mixSpectrum') return { validMixSpectrum }
  if (['./letra', './motor/resolutorABordo', '../state/resolucion'].includes(id)) return {}
  throw Error(`Dependencia inesperada: ${id}`)
}, { env: { EXPO_PUBLIC_MUSIC_API: 'https://music.example' } },
(url, init) => requests.shift()(url, init))

const { fetchAudioWaveform } = exports
const tramo = { desdeMs: 1500, durMs: 30_000 }
const valid = { peaks: Array(80).fill(0.4), durationMs: 30_000 }
const ok = body => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => body })

test('pide el tramo propio con JWT y valida la onda recibida', async () => {
  requests.push(async (url, init) => {
    const parsed = new URL(url)
    assert.equal(parsed.pathname, '/peaks')
    assert.equal(parsed.searchParams.get('audioPath'), 'propias/tema mío.m4a')
    assert.equal(parsed.searchParams.get('videoId'), null)
    assert.equal(parsed.searchParams.get('desdeMs'), '1500')
    assert.equal(parsed.searchParams.get('durMs'), '30000')
    assert.equal(parsed.searchParams.get('buckets'), '80')
    assert.equal(init.headers.Authorization, 'Bearer jwt-de-prueba')
    return ok(valid)
  })
  assert.deepEqual(await fetchAudioWaveform('propias/tema mío.m4a', 80, undefined, tramo), valid)
  assert.equal(requests.length, 0)
})

test('429 reintenta una vez tras Retry-After corto', async () => {
  let attempts = 0
  requests.push(async () => {
    attempts++
    return { ok: false, status: 429, headers: { get: name => name === 'Retry-After' ? '0.001' : null },
      json: async () => ({ error: 'Ocupado' }) }
  }, async () => { attempts++; return ok(valid) })
  assert.deepEqual(await fetchAudioWaveform('propias/tema.m4a', 80, undefined, tramo), valid)
  assert.equal(attempts, 2)
  assert.equal(requests.length, 0)
})

test('rechaza rango excesivo y una respuesta con amplitudes o duración inválidas', async () => {
  await assert.rejects(fetchAudioWaveform('propias/tema.m4a', 80, undefined,
    { desdeMs: 0, durMs: 30_001 }), /30 s/)
  requests.push(async () => ok({ peaks: [0.4, NaN], durationMs: 30_000 }))
  await assert.rejects(fetchAudioWaveform('propias/tema.m4a', 80, undefined, tramo), /onda inválida/)
  requests.push(async () => ok({ peaks: valid.peaks, durationMs: 31_000 }))
  await assert.rejects(fetchAudioWaveform('propias/tema.m4a', 80, undefined, tramo), /onda inválida/)
  assert.equal(requests.length, 0)
})

test('cancelar durante la espera por cupo evita otro pedido', async () => {
  const controller = new AbortController()
  requests.push(async () => ({ ok: false, status: 429,
    headers: { get: () => '5' }, json: async () => ({ error: 'Ocupado' }) }))
  const pending = fetchAudioWaveform('propias/tema.m4a', 80, controller.signal, tramo)
  await new Promise(resolve => setImmediate(resolve))
  controller.abort()
  await assert.rejects(pending, /Onda cancelada/)
  assert.equal(requests.length, 0)
})
