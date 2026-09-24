import type { EnvelopePoint, TransitionEq, TransitionFilter } from '../services/mixes'

export type EqBand = 'low' | 'mid' | 'high'
type EqDeck = Record<EqBand, EnvelopePoint[]>
export type EqEffectPreset = 'none' | 'bass_swap_early' | 'bass_swap_center' | 'bass_swap_late'
  | 'three_band' | 'bass_cut_fast' | 'bass_cut_long' | 'bass_out' | 'custom'
export type FilterEffectPreset = 'none' | 'lowpass_in' | 'lowpass_out' | 'lowpass_in_out'
  | 'lowpass_in_highpass_out' | 'highpass_in' | 'highpass_out' | 'highpass_in_out'
  | 'highpass_in_lowpass_out' | 'custom'

const line = (start: number, end: number): EnvelopePoint[] => [{ t: 0, value: start }, { t: 1, value: end }]
const flat = (): EnvelopePoint[] => line(0, 0)
const neutral = (): EqDeck => ({ low: flat(), mid: flat(), high: flat() })

/** Intercambia la energía de graves alrededor de un punto del cruce.
 * La referencia muestra nombres y dirección, pero no valores exactos: usamos
 * una rampa simétrica de 20 % del solapamiento. En el centro ambas bandas
 * quedan a -3 dB para que el relevo no abra un hueco de graves grande. */
function bassSwap(center: 0.25 | 0.5 | 0.75): [EnvelopePoint[], EnvelopePoint[]] {
  const before = center - 0.1, after = center + 0.1
  return [
    [{ t: 0, value: 0 }, { t: before, value: 0 }, { t: center, value: -3 },
      { t: after, value: -24 }, { t: 1, value: -24 }],
    [{ t: 0, value: -24 }, { t: before, value: -24 }, { t: center, value: -3 },
      { t: after, value: 0 }, { t: 1, value: 0 }],
  ]
}

export function eqEffectPreset(preset: EqEffectPreset): TransitionEq | null {
  if (preset === 'none') return null
  const out = neutral(), incoming = neutral()
  if (preset === 'three_band') {
    for (const band of ['low', 'mid', 'high'] as const) {
      out[band] = line(0, -18)
      incoming[band] = line(-18, 0)
    }
  } else if (preset === 'bass_swap_early' || preset === 'bass_swap_center' || preset === 'bass_swap_late') {
    const center = preset === 'bass_swap_early' ? 0.25 : preset === 'bass_swap_center' ? 0.5 : 0.75
    const [outLow, inLow] = bassSwap(center)
    out.low = outLow
    incoming.low = inLow
  } else if (preset === 'bass_cut_fast') {
    out.low = [{ t: 0, value: 0 }, { t: 0.25, value: -24 }, { t: 1, value: -24 }]
    incoming.low = [{ t: 0, value: -24 }, { t: 0.75, value: -24 }, { t: 1, value: 0 }]
  } else if (preset === 'bass_cut_long') {
    out.low = line(0, -24)
    incoming.low = line(-24, 0)
  } else if (preset === 'bass_out') {
    out.low = line(0, -24)
  }
  return { version: 1, enabled: true, out, in: incoming }
}

export function filterEffectPreset(preset: FilterEffectPreset): TransitionFilter | null {
  if (preset === 'none') return null
  // Ingreso revela contenido tonal; salida lo retira. En los presets dobles
  // cada deck conserva su dirección mientras el otro usa el tipo elegido.
  const lowIn = { kind: 'lowpass' as const, cutoff: line(250, 20_000) }
  const lowOut = { kind: 'lowpass' as const, cutoff: line(20_000, 250) }
  const highIn = { kind: 'highpass' as const, cutoff: line(5_000, 20) }
  const highOut = { kind: 'highpass' as const, cutoff: line(20, 5_000) }
  const out = preset === 'lowpass_out' || preset === 'lowpass_in_out' || preset === 'highpass_in_lowpass_out'
    ? lowOut : preset === 'highpass_out' || preset === 'lowpass_in_highpass_out' || preset === 'highpass_in_out'
      ? highOut : null
  const incoming = preset === 'lowpass_in' || preset === 'lowpass_in_out' || preset === 'lowpass_in_highpass_out'
    ? lowIn : preset === 'highpass_in' || preset === 'highpass_in_out' || preset === 'highpass_in_lowpass_out'
      ? highIn : null
  return { version: 1, enabled: true, out, in: incoming }
}

/** La edición de un punto medio conserva los extremos y el esquema v1. */
export function withEqMidpoint(
  settings: TransitionEq | null,
  deck: 'out' | 'in',
  band: EqBand,
  valueDb: number,
): TransitionEq {
  return withEqControlPoint(settings, deck, band, 0.5, valueDb)
}

export function envelopeAt(points: readonly EnvelopePoint[], t: number): number {
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

export function withEqControlPoint(
  settings: TransitionEq | null,
  deck: 'out' | 'in',
  band: EqBand,
  t: 0 | 0.5 | 1,
  valueDb: number,
): TransitionEq {
  const original = settings ?? eqEffectPreset('custom')!
  const curve = original[deck][band]
  const value = Math.max(-24, Math.min(24, valueDb))
  const next = curve.length >= 16 && !curve.some(point => point.t === t)
    ? ([0, 0.5, 1] as const).map(position => ({
      t: position, value: position === t ? value : envelopeAt(curve, position),
    }))
    : [...curve.filter(point => point.t !== t), { t, value }].sort((a, b) => a.t - b.t)
  return { ...original, enabled: true, [deck]: { ...original[deck], [band]: next } }
}
