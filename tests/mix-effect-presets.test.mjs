import test from 'node:test'
import assert from 'node:assert/strict'
import { envelopeAt, eqEffectPreset, filterEffectPreset, withEqControlPoint } from '../src/lib/mixEffectPresets.ts'

test('los tres intercambios de graves cruzan las bandas en el momento elegido', () => {
  for (const [name, center] of [
    ['bass_swap_early', 0.25], ['bass_swap_center', 0.5], ['bass_swap_late', 0.75],
  ]) {
    const eq = eqEffectPreset(name)
    assert.equal(eq?.enabled, true)
    assert.equal(envelopeAt(eq.out.low, center - 0.1), 0)
    assert.ok(Math.abs(envelopeAt(eq.out.low, center) + 3) < 1e-9)
    assert.equal(envelopeAt(eq.out.low, center + 0.1), -24)
    assert.equal(envelopeAt(eq.in.low, center - 0.1), -24)
    assert.ok(Math.abs(envelopeAt(eq.in.low, center) + 3) < 1e-9)
    assert.equal(envelopeAt(eq.in.low, center + 0.1), 0)
    for (const deck of [eq.out, eq.in]) {
      assert.deepEqual(deck.mid, [{ t: 0, value: 0 }, { t: 1, value: 0 }])
      assert.deepEqual(deck.high, [{ t: 0, value: 0 }, { t: 1, value: 0 }])
    }
  }
  const variants = ['bass_swap_early', 'bass_swap_center', 'bass_swap_late'].map(name =>
    JSON.stringify(eqEffectPreset(name)))
  assert.equal(new Set(variants).size, 3)
})

test('un intercambio de graves sigue admitiendo una curva personalizada', () => {
  const selected = eqEffectPreset('bass_swap_center')
  const changed = withEqControlPoint(selected, 'out', 'low', 0.5, -8)
  assert.equal(envelopeAt(changed.out.low, 0.5), -8)
  assert.equal(envelopeAt(changed.out.low, 0), 0)
  assert.equal(envelopeAt(changed.out.low, 1), -24)
  assert.deepEqual(changed.in.low, selected.in.low)
})

test('los filtros combinados conservan tipo y dirección de cada canción', () => {
  const expected = [
    ['lowpass_in_out', 'lowpass', 'lowpass'],
    ['lowpass_in_highpass_out', 'highpass', 'lowpass'],
    ['highpass_in_out', 'highpass', 'highpass'],
    ['highpass_in_lowpass_out', 'lowpass', 'highpass'],
  ]
  for (const [name, outKind, inKind] of expected) {
    const filter = filterEffectPreset(name)
    assert.equal(filter?.enabled, true)
    assert.equal(filter.out?.kind, outKind)
    assert.equal(filter.in?.kind, inKind)
    assert.deepEqual(filter.out?.cutoff, outKind === 'lowpass'
      ? [{ t: 0, value: 20_000 }, { t: 1, value: 250 }]
      : [{ t: 0, value: 20 }, { t: 1, value: 5_000 }])
    assert.deepEqual(filter.in?.cutoff, inKind === 'lowpass'
      ? [{ t: 0, value: 250 }, { t: 1, value: 20_000 }]
      : [{ t: 0, value: 5_000 }, { t: 1, value: 20 }])
  }
})

test('Ninguno y Personalizar conservan el contrato de filtros existente', () => {
  assert.equal(filterEffectPreset('none'), null)
  assert.deepEqual(filterEffectPreset('custom'), { version: 1, enabled: true, out: null, in: null })
})
