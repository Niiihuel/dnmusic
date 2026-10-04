import test from 'node:test'
import assert from 'node:assert/strict'
import { suggestAutoMix } from '../src/lib/autoMix.ts'

function analysis({ durationMs = 40_000, bpm = 120, introMs = 2_000, outroMs = 38_000,
  confidence = 0.9, meter = 4 } = {}) {
  const period = 60_000 / bpm
  const beatMs = []
  for (let ms = introMs; ms <= outroMs; ms += period) beatMs.push(Math.round(ms))
  return {
    version: 1, audioPath: 'song.m4a', sourceVersion: 'v1', durationMs,
    waveform: { rms: [], bucketMs: 0 }, energy: { meanRms: 0.1, peakRms: 0.2, dynamicsDb: 6 },
    silence: { introEndMs: introMs, outroStartMs: outroMs, regions: [] },
    rhythm: { bpm, confidence, beatMs, meter, barMs: meter === 4 ? beatMs.filter((_, i) => i % 4 === 0) : null },
  }
}

test('Auto alinea entradas y salidas a compases medidos, evita silencio final y respeta el objetivo', () => {
  const result = suggestAutoMix(analysis(), analysis({ introMs: 1_000, outroMs: 39_000 }), 40_000, 40_000, 4_000)
  assert.deepEqual(result, {
    durationMs: 4_000, fromCueMs: 34_000, toCueMs: 1_000,
    beats: 8, alignment: 'bars', driftMs: 0,
  })
  assert.equal(result.fromCueMs + result.durationMs, 38_000)
})

test('sin acento de compás confiable alinea beats sin declarar barras', () => {
  const result = suggestAutoMix(analysis({ meter: null }), analysis({ meter: null, introMs: 1_000 }), 40_000, 40_000)
  assert.equal(result?.alignment, 'beats')
  assert.equal(result?.durationMs, 4_000)
})

test('confianza insuficiente, BPM divergente o duración obsoleta impiden Auto', () => {
  assert.equal(suggestAutoMix(analysis({ confidence: 0.7 }), analysis(), 40_000, 40_000), null)
  assert.equal(suggestAutoMix(analysis(), { ...analysis(), rhythm: null }, 40_000, 40_000), null)
  assert.equal(suggestAutoMix(analysis({ bpm: 120 }), analysis({ bpm: 130 }), 40_000, 40_000), null)
  assert.equal(suggestAutoMix(analysis(), analysis(), 36_000, 40_000), null)
})

test('no propone cues cuando la grilla medida termina lejos de la salida audible', () => {
  const outgoing = analysis()
  outgoing.rhythm.beatMs = outgoing.rhythm.beatMs.filter(ms => ms <= 30_000)
  outgoing.rhythm.barMs = outgoing.rhythm.barMs.filter(ms => ms <= 30_000)
  assert.equal(suggestAutoMix(outgoing, analysis(), 40_000, 40_000), null)
})
