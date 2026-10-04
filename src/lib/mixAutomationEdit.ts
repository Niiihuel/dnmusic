import type { EnvelopePoint, MixEdgeInput, TransitionEq } from '../services/mixes'

export type MixCurveTarget =
  | { kind: 'volume'; deck: 'out' | 'in' }
  | { kind: 'eq'; deck: 'out' | 'in'; band: 'low' | 'mid' | 'high' }
  | { kind: 'filter'; deck: 'out' | 'in' }

const MAX_POINTS = 16
const TIME_GAP = 0.001
const CRESCENDO_OUT: EnvelopePoint[] = [{ t: 0, value: 1 }, { t: 0.5, value: 0.6 }, { t: 1, value: 0 }]
const CRESCENDO_IN: EnvelopePoint[] = [{ t: 0, value: 0 }, { t: 0.5, value: 0.1 }, { t: 1, value: 1 }]

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const round = (value: number, places: number) => Number(value.toFixed(places))
const flat = (): EnvelopePoint[] => [{ t: 0, value: 0 }, { t: 1, value: 0 }]
const neutralEq = (): TransitionEq => ({
  version: 1, enabled: true,
  out: { low: flat(), mid: flat(), high: flat() },
  in: { low: flat(), mid: flat(), high: flat() },
})

export function curveRange(target: MixCurveTarget): { min: number; max: number } {
  return target.kind === 'volume' ? { min: 0, max: 1 }
    : target.kind === 'eq' ? { min: -24, max: 24 }
      : { min: 20, max: 20_000 }
}

export function valueToUnit(value: number, target: MixCurveTarget): number {
  const { min, max } = curveRange(target)
  return target.kind === 'filter'
    ? clamp(Math.log(clamp(value, min, max) / 20) / Math.log(1_000), 0, 1)
    : clamp((value - min) / (max - min), 0, 1)
}

export function unitToValue(unit: number, target: MixCurveTarget): number {
  const { min, max } = curveRange(target)
  const fraction = clamp(unit, 0, 1)
  return target.kind === 'filter'
    ? Math.round(clamp(20 * 1_000 ** fraction, min, max))
    : round(min + fraction * (max - min), target.kind === 'volume' ? 3 : 2)
}

/** Muestra la curva que se oye, aun antes de guardar puntos explícitos. */
export function readMixCurve(draft: MixEdgeInput, target: MixCurveTarget): EnvelopePoint[] | null {
  if (draft.preset === 'none') return null
  if (target.kind === 'eq') {
    return draft.eqSettings?.enabled ? draft.eqSettings[target.deck][target.band] : null
  }
  if (target.kind === 'filter') {
    return draft.filterSettings?.enabled ? draft.filterSettings[target.deck]?.cutoff ?? null : null
  }
  const explicit = target.deck === 'out' ? draft.volumeOut : draft.volumeIn
  if (explicit) return explicit
  if (draft.preset === 'crescendo') return target.deck === 'out' ? CRESCENDO_OUT : CRESCENDO_IN
  if (draft.volumeLaw === 'linear') return target.deck === 'out'
    ? [{ t: 0, value: 1 }, { t: 1, value: 0 }]
    : [{ t: 0, value: 0 }, { t: 1, value: 1 }]
  // El motor usa seno/coseno en equal_power. Nueve segmentos dejan el mismo
  // perfil perceptivo al pasar del preset a puntos explícitos editables.
  return Array.from({ length: 9 }, (_, index) => {
    const t = index / 8
    return { t, value: round(target.deck === 'out'
      ? Math.cos(t * Math.PI / 2) : Math.sin(t * Math.PI / 2), 3) }
  })
}

/** Escribe en los campos v1 consumidos por la preescucha y la reproducción. */
export function writeMixCurve(draft: MixEdgeInput, target: MixCurveTarget, points: EnvelopePoint[]): MixEdgeInput {
  const { min, max } = curveRange(target)
  if (points.length < 2 || points.length > MAX_POINTS || points[0]?.t !== 0 || points.at(-1)?.t !== 1 ||
    points.some((point, index) => !Number.isFinite(point.t) || !Number.isFinite(point.value) ||
      point.t < 0 || point.t > 1 || point.value < min || point.value > max ||
      (index > 0 && point.t <= points[index - 1].t))) return draft
  if (target.kind === 'volume') {
    // Crescendo obtiene sus dos envolventes del preset. Al pasar a custom hay
    // que materializar ambas para no cambiar la otra canción sin que se edite.
    const other = target.deck === 'out' ? 'in' : 'out'
    const otherPoints = draft.preset === 'crescendo' && (other === 'out' ? draft.volumeOut : draft.volumeIn) === null
      ? readMixCurve(draft, { kind: 'volume', deck: other }) : null
    return {
      ...draft, preset: 'custom',
      volumeOut: target.deck === 'out' ? points : otherPoints ?? draft.volumeOut,
      volumeIn: target.deck === 'in' ? points : otherPoints ?? draft.volumeIn,
    }
  }
  if (target.kind === 'eq') {
    const original = draft.eqSettings ?? neutralEq()
    return { ...draft, eqSettings: { ...original, enabled: true,
      [target.deck]: { ...original[target.deck], [target.band]: points } } }
  }
  const original = draft.filterSettings
  const part = original?.[target.deck]
  if (!original || !part) return draft
  return { ...draft, filterSettings: { ...original, enabled: true,
    [target.deck]: { ...part, cutoff: points } } }
}

export function curveAt(points: readonly EnvelopePoint[], t: number): number {
  if (!points.length) return 0
  if (t <= points[0].t) return points[0].value
  for (let index = 1; index < points.length; index++) {
    const right = points[index]
    if (t > right.t) continue
    const left = points[index - 1]
    return left.value + (right.value - left.value) * (t - left.t) / (right.t - left.t)
  }
  return points[points.length - 1].value
}

export function insertCurvePoint(points: readonly EnvelopePoint[], t: number, value: number,
  min: number, max: number): EnvelopePoint[] {
  if (points.length < 2 || points.length >= MAX_POINTS || !Number.isFinite(t) || !Number.isFinite(value)) return [...points]
  const index = points.findIndex(point => point.t > t)
  if (index <= 0) return [...points]
  const left = points[index - 1], right = points[index]
  const position = round(t, 3)
  if (position - left.t < TIME_GAP || right.t - position < TIME_GAP) return [...points]
  return [...points.slice(0, index), { t: position, value: clamp(value, min, max) }, ...points.slice(index)]
}

export function moveCurvePoint(points: readonly EnvelopePoint[], index: number, t: number, value: number,
  min: number, max: number): EnvelopePoint[] {
  if (!Number.isInteger(index) || index < 0 || index >= points.length || !Number.isFinite(t) || !Number.isFinite(value)) return [...points]
  const last = points.length - 1
  const left = points[index - 1]?.t ?? 0, right = points[index + 1]?.t ?? 1
  const position = index === 0 ? 0 : index === last ? 1
    : right - left < TIME_GAP * 2 ? points[index].t
      : round(clamp(t, left + TIME_GAP, right - TIME_GAP), 3)
  return points.map((point, current) => current === index
    ? { t: position, value: clamp(value, min, max) } : point)
}

export function deleteCurvePoint(points: readonly EnvelopePoint[], index: number): EnvelopePoint[] {
  if (!Number.isInteger(index) || index <= 0 || index >= points.length - 1) return [...points]
  return points.filter((_, current) => current !== index)
}

export function largestCurveGapMidpoint(points: readonly EnvelopePoint[]): number | null {
  if (points.length < 2 || points.length >= MAX_POINTS) return null
  let gap = 0, midpoint: number | null = null
  for (let index = 1; index < points.length; index++) {
    const size = points[index].t - points[index - 1].t
    if (size > gap && size >= TIME_GAP * 2) {
      gap = size
      midpoint = round((points[index].t + points[index - 1].t) / 2, 3)
    }
  }
  return midpoint
}
