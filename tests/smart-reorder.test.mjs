import test from 'node:test'
import assert from 'node:assert/strict'
import { suggestRhythmOrder } from '../src/lib/smartReorder.ts'

function item(trackId, bpm, meanRms = 0.1, confidence = 0.9) {
  const durationMs = 40_000
  const audioPath = `${trackId}.m4a`
  const beatMs = []
  for (let ms = 0; ms <= durationMs; ms += 60_000 / bpm) beatMs.push(Math.round(ms))
  return {
    trackId, audioPath, durationMs,
    analysis: {
      version: 1, audioPath, sourceVersion: 'v1', durationMs,
      waveform: { rms: [], bucketMs: 0 },
      energy: { meanRms, peakRms: meanRms * 1.5, dynamicsDb: 6 },
      silence: { introEndMs: 0, outroStartMs: durationMs, regions: [] },
      rhythm: { bpm, confidence, beatMs, meter: null, barMs: null },
    },
  }
}

test('acerca BPM y energía, conserva la apertura y mejora el costo', () => {
  const result = suggestRhythmOrder([
    item('a', 100, 0.1), item('b', 160, 0.2),
    item('c', 104, 0.11), item('d', 108, 0.12),
  ])
  assert.deepEqual(result.expectedOrder, ['a', 'b', 'c', 'd'])
  assert.deepEqual(result.suggestedOrder, ['a', 'c', 'd', 'b'])
  assert.equal(result.usableCount, 4)
  assert.equal(result.changed, true)
  assert.ok(result.suggestedCost < result.originalCost)
})

test('usa energía medida para desempatar BPM iguales y considera medio tiempo', () => {
  const energy = suggestRhythmOrder([
    item('a', 120, 0.1), item('b', 120, 0.5),
    item('c', 120, 0.11), item('d', 120, 0.12),
  ])
  assert.deepEqual(energy.suggestedOrder, ['a', 'c', 'd', 'b'])

  const halftime = suggestRhythmOrder([
    item('a', 80), item('b', 125), item('c', 160),
  ])
  assert.deepEqual(halftime.suggestedOrder, ['a', 'c', 'b'])
})

test('mantiene en su sitio canciones sin BPM, energía o duración fiables', () => {
  const unreliable = item('u', 130, 0.1, 0.6)
  const stale = item('s', 130)
  stale.analysis.durationMs = 50_000
  const missingEnergy = item('e', 130, 0)
  const result = suggestRhythmOrder([
    item('a', 100), unreliable, item('b', 160),
    item('c', 104), stale, item('d', 108), missingEnergy,
  ])
  assert.deepEqual(result.suggestedOrder, ['a', 'u', 'c', 'd', 's', 'b', 'e'])
  assert.equal(result.usableCount, 4)
  assert.equal(result.suggestedOrder[1], 'u')
  assert.equal(result.suggestedOrder[4], 's')
  assert.equal(result.suggestedOrder[6], 'e')
})

test('no inventa una mejora con mediciones insuficientes o un orden ya bueno', () => {
  const missing = item('x', 90)
  missing.analysis = null
  const insufficient = suggestRhythmOrder([item('a', 100), missing, item('b', 110)])
  assert.equal(insufficient.changed, false)
  assert.equal(insufficient.usableCount, 2)
  assert.deepEqual(insufficient.suggestedOrder, insufficient.expectedOrder)

  const sorted = suggestRhythmOrder([item('a', 100), item('b', 104), item('c', 108), item('d', 160)])
  assert.equal(sorted.changed, false)
  assert.deepEqual(sorted.suggestedOrder, sorted.expectedOrder)
  assert.throws(() => suggestRhythmOrder([item('a', 100), item('a', 120)]), /repetidos/)
})
