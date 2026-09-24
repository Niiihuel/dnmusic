import test from 'node:test'
import assert from 'node:assert/strict'
import { suggestBarMix } from '../src/lib/autoMix.ts'

function analysis({ durationMs = 80_000, bpm = 120, introMs = 2_000, outroMs = 78_000,
  confidence = 0.9, meter = 4, regions = [] } = {}) {
  const beatMs = []
  for (let time = introMs; time <= outroMs + 1; time += 60_000 / bpm) beatMs.push(Math.round(time))
  return {
    version: 1, audioPath: 'song.m4a', sourceVersion: 'v1', durationMs,
    waveform: { rms: [], bucketMs: 0 }, energy: { meanRms: 0.1, peakRms: 0.2, dynamicsDb: 6 },
    silence: { introEndMs: introMs, outroStartMs: outroMs, regions },
    rhythm: { bpm, confidence, beatMs, meter,
      barMs: meter === 4 ? beatMs.filter((_, index) => index % 4 === 0) : null },
  }
}

test('1, 2, 4 y 8 compases usan límites medidos y cues cercanos al sonido', () => {
  const from = analysis()
  const to = analysis({ introMs: 1_000, outroMs: 79_000 })
  for (const bars of [1, 2, 4, 8]) {
    const result = suggestBarMix(from, to, 80_000, 80_000, bars)
    assert.deepEqual(result, {
      bars, beats: bars * 4, durationMs: bars * 2_000,
      fromCueMs: 78_000 - bars * 2_000, toCueMs: 1_000, driftMs: 0,
    })
    assert.ok(from.rhythm.barMs.includes(result.fromCueMs))
    assert.ok(to.rhythm.barMs.includes(result.toCueMs))
  }
})

test('el desfase acumulado impide 8 compases aunque 4 aún se alineen sin cambiar tempo', () => {
  const from = analysis()
  const to = analysis({ bpm: 121, introMs: 1_000, outroMs: 79_000 })
  assert.equal(suggestBarMix(from, to, 80_000, 80_000, 8), null)
  const four = suggestBarMix(from, to, 80_000, 80_000, 4)
  assert.equal(four?.bars, 4)
  assert.ok(four.driftMs > 0 && four.driftMs <= 100)
})

test('ofrece 16 compases sólo cuando caben en 30 segundos y ambas rejillas coinciden', () => {
  const fast = analysis({ bpm: 140, introMs: 2_000, outroMs: 72_000 })
  const result = suggestBarMix(fast, fast, 80_000, 80_000, 16)
  assert.equal(result?.bars, 16)
  assert.ok(result.durationMs > 27_000 && result.durationMs < 30_000)
  assert.equal(suggestBarMix(analysis(), analysis(), 80_000, 80_000, 16), null)
})

test('sin compás o confianza fiables no ofrece una opción de compases', () => {
  const good = analysis()
  assert.equal(suggestBarMix(analysis({ meter: null }), good, 80_000, 80_000, 2), null)
  assert.equal(suggestBarMix(good, analysis({ confidence: 0.74 }), 80_000, 80_000, 2), null)
  assert.equal(suggestBarMix({ ...good, rhythm: null }, good, 80_000, 80_000, 2), null)
  const broken = analysis()
  broken.rhythm.beatMs[10] += 180
  assert.equal(suggestBarMix(broken, good, 80_000, 80_000, 2), null)
  assert.equal(suggestBarMix(good, good, 80_000, 80_000, 3), null)
})

test('respeta el límite de 30 segundos, metadatos actuales y silencios en el cruce', () => {
  const slow = analysis({ durationMs: 100_000, bpm: 60, introMs: 2_000, outroMs: 98_000 })
  assert.equal(suggestBarMix(slow, slow, 100_000, 100_000, 8), null)
  const good = analysis()
  assert.equal(suggestBarMix(good, good, 75_000, 80_000, 4), null)
  const silent = analysis({ regions: [{ startMs: 72_000, endMs: 75_000 }] })
  assert.equal(suggestBarMix(silent, good, 80_000, 80_000, 4), null)
})
