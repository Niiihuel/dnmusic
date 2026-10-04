import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { validMixSpectrum } from '../src/lib/mixSpectrum.ts'

const source = ts.transpileModule(readFileSync('src/services/analisisMusical.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const requests = []
const module = { exports: {} }
new Function('exports', 'require', 'process', source)(module.exports, id => {
  if (id === './music') return { fetchMusica: (...args) => requests.shift()(...args) }
  if (id === '../lib/mixSpectrum') return { validMixSpectrum }
  throw Error(`Unexpected dependency: ${id}`)
}, process)
const { pedirAnalisisMusical } = module.exports

const busy = (after = '0.001') => ({
  status: 429, headers: { get: () => after }, json: async () => ({ error: 'Ocupado' }),
})
const valid = {
  version: 1, audioPath: 'a.m4a', durationMs: 1000,
  waveform: { rms: [0.5], bucketMs: 1000 },
  silence: { introEndMs: 0, outroStartMs: 1000, regions: [] },
  energy: { meanRms: 0.5, peakRms: 0.7, dynamicsDb: 3 },
  loudness: { integratedLufs: -14, truePeakDbtp: -1 }, rhythm: null,
}

test('un cupo temporal reintenta y entrega la medición validada', async () => {
  requests.push(async () => busy(), async () => ({
    status: 200, ok: true, headers: { get: () => null }, json: async () => valid,
  }))
  assert.deepEqual(await pedirAnalisisMusical('a.m4a'), valid)
  assert.equal(requests.length, 0)
})

test('salir del editor cancela la espera por cupo', async () => {
  const controller = new AbortController()
  requests.push(async () => busy('5'))
  const pending = pedirAnalisisMusical('a.m4a', controller.signal)
  await new Promise(resolve => setImmediate(resolve))
  controller.abort()
  await assert.rejects(pending, /Análisis cancelado/)
  assert.equal(requests.length, 0)
})

test('conserva el tempo aproximado medido aun sin beatgrid y admite cachés previas sin tempo', async () => {
  const tempo = { bpm: 76, minBpm: 73, maxBpm: 80, confidence: 0.62, varying: true, alternateBpm: 152 }
  requests.push(async () => ({
    status: 200, ok: true, headers: { get: () => null },
    json: async () => ({ ...valid, tempo }),
  }))
  const analysis = await pedirAnalisisMusical('a.m4a')
  assert.equal(analysis.rhythm, null)
  assert.deepEqual(analysis.tempo, tempo)
  requests.push(async () => ({
    status: 200, ok: true, headers: { get: () => null }, json: async () => ({ ...valid }),
  }))
  assert.equal((await pedirAnalisisMusical('a.m4a')).tempo, undefined)
})

test('descarta solo un tempo mal formado y conserva onda y ritmo originales', async () => {
  requests.push(async () => ({
    status: 200, ok: true, headers: { get: () => null },
    json: async () => ({ ...valid, tempo: {
      bpm: 120, minBpm: 130, maxBpm: 140, confidence: 0.7, varying: false, alternateBpm: null,
    } }),
  }))
  const analysis = await pedirAnalisisMusical('a.m4a')
  assert.equal(analysis.tempo, null)
  assert.deepEqual(analysis.waveform.rms, valid.waveform.rms)
  assert.equal(analysis.rhythm, null)
})
