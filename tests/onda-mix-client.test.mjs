import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { validMixSpectrum } from '../src/lib/mixSpectrum.ts'

const source = ts.transpileModule(readFileSync('src/services/analisisMusical.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const calls = []
const module = { exports: {} }
new Function('exports', 'require', 'process', source)(module.exports, id => {
  if (id === './music') return {
    fetchMusica: (...args) => calls.shift()(...args),
    fetchWaveform: (...args) => calls.shift()(...args),
  }
  if (id === '../lib/mixSpectrum') return { validMixSpectrum }
  throw Error(`Unexpected dependency: ${id}`)
}, process)
const { pedirOndaDeMix } = module.exports
const analysis = {
  version: 1, audioPath: 'cancion.m4a', sourceVersion: 'v1', durationMs: 4000,
  waveform: { rms: [0.1, 0.5, 0.8], bucketMs: 1000 },
  silence: { introEndMs: 0, outroStartMs: 4000, regions: [] },
  energy: { meanRms: 0.5, peakRms: 0.8, dynamicsDb: 3 }, loudness: null, rhythm: null,
}

test('con /analysis disponible conserva la medición musical y no llama /peaks', async () => {
  calls.push(async () => ({ ok: true, status: 200, json: async () => analysis }))
  const result = await pedirOndaDeMix({ audioPath: 'cancion.m4a', videoId: 'catalogo' })
  assert.equal(result.source, 'analysis')
  assert.deepEqual(result.peaks, analysis.waveform.rms)
  assert.equal(result.analysis, analysis)
  assert.equal(calls.length, 0)
})

test('sin /analysis usa /peaks real de la canción guardada y deja ritmo ausente', async () => {
  calls.push(async () => ({ ok: false, status: 404, json: async () => ({ error: 'Ruta desconocida' }) }))
  calls.push(async (id, buckets) => {
    assert.equal(id, 'catalogo'); assert.equal(buckets, 256)
    return { peaks: [0.2, 0.6, 0.4], durationMs: 4000,
      bands: { low: [0.6, 0.3, 0.1], mid: [0.2, 0.5, 0.3], high: [0.1, 0.4, 0.7] } }
  })
  const result = await pedirOndaDeMix({ audioPath: 'cancion.m4a', videoId: 'catalogo' })
  assert.equal(result.source, 'peaks')
  assert.equal(result.analysis, null)
  assert.match(result.analysisError, /Ruta desconocida/)
  assert.deepEqual(result.peaks, [0.2, 0.6, 0.4])
  assert.deepEqual(result.bands.low, [0.6, 0.3, 0.1])
  assert.equal(calls.length, 0)
})

test('bandas parciales no invalidan la onda medida', async () => {
  calls.push(async () => ({ peaks: [0.2, 0.6, 0.4], durationMs: 4000,
    bands: { low: [0.2], mid: [0.2], high: [0.2] } }))
  const result = await pedirOndaDeMix({ audioPath: '', videoId: 'catalogo' })
  assert.equal(result.source, 'peaks')
  assert.deepEqual(result.peaks, [0.2, 0.6, 0.4])
  assert.equal(result.bands, null)
})

test('una canción propia no usa videoId inventado para obtener una onda', async () => {
  calls.push(async () => ({ ok: false, status: 404, json: async () => ({ error: 'Audio no disponible' }) }))
  await assert.rejects(pedirOndaDeMix({ audioPath: 'propias/real.mp3', videoId: 'propia:real' }), /Audio no disponible/)
  assert.equal(calls.length, 0)
})

test('rechaza picos inválidos sin dibujar amplitudes falsas', async () => {
  calls.push(async () => ({ peaks: [0.2, NaN, 0.4], durationMs: 4000 }))
  await assert.rejects(pedirOndaDeMix({ audioPath: '', videoId: 'catalogo' }), /onda inválida/)
  assert.equal(calls.length, 0)
})
