import test from 'node:test'
import assert from 'node:assert/strict'
import { planForMixPair } from '../src/lib/mixPlan.ts'

const mix = {
  defaultPreset: 'auto',
  defaultDurationMs: 4000,
}

test('el preset general cabe en las dos canciones reales', () => {
  const plan = planForMixPair(mix, [], 'a', 'b', 2000, 1500)
  assert.equal(plan?.durationSeconds, 1.5)
  assert.equal(plan?.fromStartSeconds, 0.5)
  assert.equal(plan?.toStartSeconds, 0)
})

test('un cue guardado se acota si la fuente real cambió de duración', () => {
  const edge = {
    fromPlaylistTrackId: 'a', toPlaylistTrackId: 'b',
    preset: 'custom', durationMs: 4000, fromCueMs: 56000, toCueMs: 3000,
    volumeLaw: 'linear', volumeOut: [{ t: 0, value: 1 }, { t: 1, value: 0 }],
    volumeIn: null,
  }
  const plan = planForMixPair(mix, [edge], 'a', 'b', 3000, 2500)
  assert.equal(plan?.durationSeconds, 2.5)
  assert.equal(plan?.fromStartSeconds, 0.5)
  assert.equal(plan?.toStartSeconds, 0)
  assert.deepEqual(plan?.volumeOut, edge.volumeOut)
})

test('Sin mezcla y canciones demasiado cortas no programan un solapamiento', () => {
  assert.equal(planForMixPair({ ...mix, defaultPreset: 'none' }, [], 'a', 'b', 60000), null)
  assert.equal(planForMixPair(mix, [], 'a', 'b', 200, 10000), null)
})

test('Crescendo produce curvas audibles distintas de Fade y Fusión', () => {
  const plan = planForMixPair({ ...mix, defaultPreset: 'crescendo' }, [], 'a', 'b', 60000, 60000)
  assert.deepEqual(plan?.volumeOut, [
    { t: 0, value: 1 }, { t: 0.5, value: 0.6 }, { t: 1, value: 0 },
  ])
  assert.deepEqual(plan?.volumeIn, [
    { t: 0, value: 0 }, { t: 0.5, value: 0.1 }, { t: 1, value: 1 },
  ])
  assert.equal(plan?.volumeLaw, 'equal_power')
})
