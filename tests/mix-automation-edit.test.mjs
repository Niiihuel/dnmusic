import test from 'node:test'
import assert from 'node:assert/strict'
import {
  curveAt, deleteCurvePoint, insertCurvePoint, largestCurveGapMidpoint,
  moveCurvePoint, readMixCurve, unitToValue, valueToUnit, writeMixCurve,
} from '../src/lib/mixAutomationEdit.ts'
import { eqEffectPreset, filterEffectPreset } from '../src/lib/mixEffectPresets.ts'
import { planForMixPair } from '../src/lib/mixPlan.ts'

const base = {
  preset: 'fade', durationMs: 8_000, fromCueMs: 10_000, toCueMs: 0,
  volumeLaw: 'linear', volumeOut: null, volumeIn: null,
  eqSettings: null, filterSettings: null,
}

test('arrastrar volumen crea una curva real y conserva la canción opuesta de Crescendo', () => {
  const draft = { ...base, preset: 'crescendo', volumeLaw: 'equal_power' }
  const target = { kind: 'volume', deck: 'out' }
  const original = readMixCurve(draft, target)
  assert.deepEqual(original, [{ t: 0, value: 1 }, { t: 0.5, value: 0.6 }, { t: 1, value: 0 }])
  const moved = moveCurvePoint(original, 1, 0.63, 0.32, 0, 1)
  const edited = writeMixCurve(draft, target, moved)
  assert.equal(edited.preset, 'custom')
  assert.deepEqual(edited.volumeOut, [{ t: 0, value: 1 }, { t: 0.63, value: 0.32 }, { t: 1, value: 0 }])
  assert.deepEqual(edited.volumeIn, [{ t: 0, value: 0 }, { t: 0.5, value: 0.1 }, { t: 1, value: 1 }])
  assert.equal(draft.volumeOut, null)
})

test('equal power se materializa con su forma antes de editar, sin convertirlo en fade lineal', () => {
  const draft = { ...base, preset: 'fusion', volumeLaw: 'equal_power' }
  const target = { kind: 'volume', deck: 'out' }
  const curve = readMixCurve(draft, target)
  assert.equal(curve.length, 9)
  assert.ok(Math.abs(curveAt(curve, 0.5) - Math.SQRT1_2) < 0.001)
  const edited = writeMixCurve(draft, target, moveCurvePoint(curve, 4, 0.5, 0.5, 0, 1))
  assert.equal(edited.preset, 'custom')
  assert.equal(edited.volumeLaw, 'equal_power')
  assert.equal(edited.volumeOut[4].value, 0.5)
  assert.equal(edited.volumeIn, null)
})

test('agregar, mover y borrar respeta 2–16 puntos, extremos fijos, orden y rango', () => {
  let curve = [{ t: 0, value: 1 }, { t: 1, value: 0 }]
  assert.equal(largestCurveGapMidpoint(curve), 0.5)
  curve = insertCurvePoint(curve, 0.5, 0.8, 0, 1)
  assert.deepEqual(curve, [{ t: 0, value: 1 }, { t: 0.5, value: 0.8 }, { t: 1, value: 0 }])
  curve = moveCurvePoint(curve, 0, 0.8, -1, 0, 1)
  assert.deepEqual(curve[0], { t: 0, value: 0 })
  curve = moveCurvePoint(curve, 1, 1, 2, 0, 1)
  assert.ok(curve[0].t < curve[1].t && curve[1].t < curve[2].t)
  assert.equal(curve[1].value, 1)
  assert.deepEqual(deleteCurvePoint(curve, 0), curve)
  assert.equal(deleteCurvePoint(curve, 1).length, 2)
  while (curve.length < 16) {
    const midpoint = largestCurveGapMidpoint(curve)
    assert.ok(midpoint !== null)
    curve = insertCurvePoint(curve, midpoint, curveAt(curve, midpoint), 0, 1)
  }
  assert.equal(largestCurveGapMidpoint(curve), null)
  assert.equal(insertCurvePoint(curve, 0.77, 0.4, 0, 1).length, 16)
  assert.ok(curve.every((point, index) => index === 0 || point.t > curve[index - 1].t))
})

test('las bandas EQ y filtro editan sólo la curva elegida dentro del esquema persistido', () => {
  const draft = { ...base, eqSettings: eqEffectPreset('three_band'),
    filterSettings: filterEffectPreset('lowpass_in') }
  const eqTarget = { kind: 'eq', deck: 'out', band: 'low' }
  const eqCurve = insertCurvePoint(readMixCurve(draft, eqTarget), 0.4, -30, -24, 24)
  const withEq = writeMixCurve(draft, eqTarget, eqCurve)
  assert.equal(withEq.eqSettings.out.low[1].value, -24)
  assert.deepEqual(withEq.eqSettings.out.mid, draft.eqSettings.out.mid)
  assert.deepEqual(withEq.eqSettings.in, draft.eqSettings.in)
  assert.equal(withEq.preset, draft.preset)
  const filterTarget = { kind: 'filter', deck: 'in' }
  const filterCurve = insertCurvePoint(readMixCurve(withEq, filterTarget), 0.5, 600, 20, 20_000)
  const withFilter = writeMixCurve(withEq, filterTarget, filterCurve)
  assert.deepEqual(withFilter.filterSettings.in.cutoff[1], { t: 0.5, value: 600 })
  assert.equal(withFilter.filterSettings.in.kind, 'lowpass')
  assert.equal(withFilter.filterSettings.out, null)
  assert.equal(writeMixCurve(withFilter, filterTarget, [{ t: 0, value: 0 }, { t: 1, value: 20_000 }]), withFilter)
  assert.equal(valueToUnit(20, filterTarget), 0)
  assert.equal(valueToUnit(20_000, filterTarget), 1)
  assert.ok(Math.abs(unitToValue(0.5, filterTarget) - Math.sqrt(20 * 20_000)) <= 1)
})

test('un punto editado llega sin transformación al plan de reproducción', () => {
  const target = { kind: 'volume', deck: 'out' }
  const curve = insertCurvePoint(readMixCurve(base, target), 0.45, 0.3, 0, 1)
  const edited = writeMixCurve(base, target, curve)
  const mix = { defaultPreset: 'fade', defaultDurationMs: 8_000 }
  const edge = { ...edited, fromPlaylistTrackId: 'a', toPlaylistTrackId: 'b' }
  const plan = planForMixPair(mix, [edge], 'a', 'b', 120_000, 120_000)
  assert.deepEqual(plan.volumeOut, curve)
  assert.equal(plan.volumeLaw, 'linear')
})
