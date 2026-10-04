import test from 'node:test'
import assert from 'node:assert/strict'
import { mixSpectrumPaths, validMixSpectrum } from '../src/lib/mixSpectrum.ts'

test('sólo acepta bandas medidas y alineadas con el número de barras', () => {
  const bands = { low: [0.5, 0.2], mid: [0.3, 0.1], high: [0.1, 0.4] }
  assert.equal(validMixSpectrum(bands, 2), true)
  assert.equal(validMixSpectrum({ ...bands, high: [0.2] }, 2), false)
  assert.equal(validMixSpectrum({ ...bands, mid: [Number.NaN, 0.3] }, 2), false)
})

test('el color dominante procede de la banda y conserva una barra sin bandas en gris', () => {
  const low = mixSpectrumPaths([0.8], { low: [0.7], mid: [0], high: [0] }, 5, 100, 2)
  assert.ok(low.low.length > 0)
  assert.equal(low.mid, '')
  assert.equal(low.high, '')
  const high = mixSpectrumPaths([0.8], { low: [0], mid: [0], high: [0.7] }, 5, 100, 2)
  assert.equal(high.low, '')
  assert.ok(high.high.length > 0)
  const absent = mixSpectrumPaths([0.8], { low: [0], mid: [0], high: [0] }, 5, 100, 2)
  assert.ok(absent.fallback.length > 0)
})
