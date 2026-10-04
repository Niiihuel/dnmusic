import test from 'node:test'
import assert from 'node:assert/strict'
import { medirOndaFrecuencias } from '../dist/frequency-bands.js'

function tono(hz, segundos = 1) {
  const pcm = new Int16Array(8_000 * segundos)
  for (let i = 0; i < pcm.length; i++) {
    pcm[i] = Math.round(14_000 * Math.sin(2 * Math.PI * hz * i / 8_000))
  }
  return pcm
}

test('graves, medios y agudos proceden de su banda medida y conservan duración', () => {
  const casos = [[100, 'low'], [440, 'mid'], [2_500, 'high']]
  for (const [hz, dominante] of casos) {
    const result = medirOndaFrecuencias(tono(hz), 160)
    assert.equal(result.durationMs, 1_000)
    assert.equal(result.peaks.length, 160)
    for (const band of ['low', 'mid', 'high']) {
      assert.equal(result.bands[band].length, 160)
      assert.ok(result.bands[band].every(value => value >= 0 && value <= 1))
    }
    const media = band => result.bands[band].reduce((sum, value) => sum + value, 0) / 160
    assert.ok(media(dominante) > Math.max(...['low', 'mid', 'high']
      .filter(band => band !== dominante).map(media)), `${hz} Hz debe dominar ${dominante}`)
  }
})

test('un tramo en silencio no inventa energía ni pierde los últimos samples', () => {
  const pcm = new Int16Array(8_001)
  const result = medirOndaFrecuencias(pcm, 160)
  assert.equal(result.durationMs, 1_000)
  assert.ok(result.peaks.every(value => value === 0))
  assert.ok(Object.values(result.bands).every(values => values.every(value => value === 0)))
  pcm[8_000] = 32_000
  const tail = medirOndaFrecuencias(pcm, 160)
  assert.ok(tail.peaks[159] > 0.9)
})
