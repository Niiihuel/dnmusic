import type { AnalisisMusical } from '../services/analisisMusical'

export type AutoMixSuggestion = {
  durationMs: number
  fromCueMs: number
  toCueMs: number
  beats: number
  alignment: 'bars' | 'beats'
  /** Desfase estimado al final del solapamiento; no se altera el tempo. */
  driftMs: number
}

export type BarCount = 1 | 2 | 4 | 8 | 16

export type BarMixSuggestion = {
  bars: BarCount
  beats: number
  durationMs: number
  fromCueMs: number
  toCueMs: number
  /** Diferencia entre la duración medida de N compases en ambos temas. No se altera el tempo. */
  driftMs: number
}

const MIN_CONFIDENCE = 0.75
const MAX_TEMPO_DIFFERENCE = 0.025
const MAX_DRIFT_MS = 100
const BEAT_COUNTS = [4, 8, 12, 16] as const

function ascending(values: number[], durationMs: number): boolean {
  if (values.length < 16) return false
  let previous = -1
  for (const value of values) {
    if (!Number.isFinite(value) || value <= previous || value < 0 || value > durationMs) return false
    previous = value
  }
  return true
}

function usable(analysis: AnalisisMusical, durationMs: number): boolean {
  const rhythm = analysis.rhythm
  if (!rhythm || rhythm.confidence < MIN_CONFIDENCE || !Number.isFinite(rhythm.bpm) ||
    rhythm.bpm < 60 || rhythm.bpm > 200 || !ascending(rhythm.beatMs, analysis.durationMs)) return false
  if (!Number.isFinite(durationMs) || durationMs <= 0 ||
    Math.abs(analysis.durationMs - durationMs) > Math.max(1_500, durationMs * 0.02)) return false
  const { introEndMs, outroStartMs } = analysis.silence
  return Number.isFinite(introEndMs) && Number.isFinite(outroStartMs) &&
    introEndMs >= 0 && outroStartMs > introEndMs && outroStartMs <= analysis.durationMs
}

function cueEntrante(beats: number[], introMs: number, maxCueMs: number, periodoMs: number): number | null {
  return beats.find(ms => ms >= introMs - 55 && ms <= maxCueMs && ms <= introMs + Math.max(1_000, 4 * periodoMs)) ?? null
}

function cueSaliente(beats: number[], finActivoMs: number, durationMs: number, periodoMs: number): number | null {
  const limite = finActivoMs - durationMs
  for (let i = beats.length - 1; i >= 0; i--) {
    const ms = beats[i]
    if (ms <= limite && limite - ms <= Math.max(1_000, 4 * periodoMs)) return ms
  }
  return null
}

function coversOverlap(beats: number[], cueMs: number, durationMs: number, periodMs: number): boolean {
  const within = beats.filter(ms => ms >= cueMs - 55 && ms <= cueMs + durationMs + 55)
  const first = within[0], last = within.at(-1)
  return first !== undefined && last !== undefined && first <= cueMs + 55 &&
    last >= cueMs + durationMs - periodMs * 1.5 &&
    within.every((ms, index) => index === 0 || ms - within[index - 1] <= periodMs * 1.5)
}

/**
 * Propone un solapamiento sincronizado sin cambiar la velocidad de reproducción.
 * Devuelve null si falta un pulso fiable, los BPM difieren demasiado o los
 * marcadores están lejos de la entrada/salida audibles.
 */
export function suggestAutoMix(
  from: AnalisisMusical,
  to: AnalisisMusical,
  fromDurationMs: number,
  toDurationMs: number,
  desiredDurationMs = 4_000,
): AutoMixSuggestion | null {
  if (!usable(from, fromDurationMs) || !usable(to, toDurationMs)) return null
  const fromRhythm = from.rhythm!
  const toRhythm = to.rhythm!
  if (Math.abs(fromRhythm.bpm - toRhythm.bpm) / Math.min(fromRhythm.bpm, toRhythm.bpm) > MAX_TEMPO_DIFFERENCE) return null
  const fromPeriod = 60_000 / fromRhythm.bpm
  const toPeriod = 60_000 / toRhythm.bpm
  const maximum = Math.min(12_000, fromDurationMs, toDurationMs,
    from.silence.outroStartMs - from.silence.introEndMs,
    toDurationMs - to.silence.introEndMs)
  const target = Number.isFinite(desiredDurationMs) && desiredDurationMs > 0 ? desiredDurationMs : 4_000
  const counts = [...BEAT_COUNTS].sort((a, b) =>
    Math.abs(a * fromPeriod - target) - Math.abs(b * fromPeriod - target))

  const hasBars = fromRhythm.meter === 4 && toRhythm.meter === 4 &&
    Array.isArray(fromRhythm.barMs) && Array.isArray(toRhythm.barMs) &&
    fromRhythm.barMs.length >= 4 && toRhythm.barMs.length >= 4
  const grids: { fromBeats: number[]; toBeats: number[]; alignment: 'bars' | 'beats' }[] = []
  if (hasBars) grids.push({ fromBeats: fromRhythm.barMs!, toBeats: toRhythm.barMs!, alignment: 'bars' })
  grids.push({ fromBeats: fromRhythm.beatMs, toBeats: toRhythm.beatMs, alignment: 'beats' })

  const candidates: AutoMixSuggestion[] = []
  for (const grid of grids) for (const beats of counts) {
    const durationMs = Math.round(beats * fromPeriod / 10) * 10
    const driftMs = Math.round(beats * Math.abs(fromPeriod - toPeriod))
    if (durationMs < 1_000 || durationMs > maximum || driftMs > MAX_DRIFT_MS) continue
    const fromCueMs = cueSaliente(grid.fromBeats, from.silence.outroStartMs, durationMs, fromPeriod)
    const toCueMs = cueEntrante(grid.toBeats, to.silence.introEndMs, toDurationMs - durationMs, toPeriod)
    if (fromCueMs === null || toCueMs === null ||
      fromCueMs + durationMs > fromDurationMs || toCueMs + durationMs > toDurationMs ||
      !coversOverlap(fromRhythm.beatMs, fromCueMs, durationMs, fromPeriod) ||
      !coversOverlap(toRhythm.beatMs, toCueMs, durationMs, toPeriod)) continue
    candidates.push({ durationMs, fromCueMs, toCueMs, beats, alignment: grid.alignment, driftMs })
  }
  candidates.sort((a, b) =>
    (Math.abs(a.durationMs - target) + (a.alignment === 'bars' ? 0 : 400)) -
    (Math.abs(b.durationMs - target) + (b.alignment === 'bars' ? 0 : 400)))
  return candidates[0] ?? null
}

function validBarGrid(rhythm: NonNullable<AnalisisMusical['rhythm']>, durationMs: number): rhythm is typeof rhythm & { barMs: number[] } {
  const bars = rhythm.barMs
  if (rhythm.meter !== 4 || !Array.isArray(bars) || bars.length < 2) return false
  const beats = rhythm.beatMs
  const period = 60_000 / rhythm.bpm
  for (let i = 1; i < beats.length; i++) {
    if (Math.abs(beats[i] - beats[i - 1] - period) > Math.max(60, period * 0.1)) return false
  }
  let previousBar = -1
  let previousBeatIndex = -1
  let beatIndex = 0
  for (const bar of bars) {
    if (!Number.isFinite(bar) || bar <= previousBar || bar < 0 || bar > durationMs) return false
    while (beatIndex + 1 < beats.length && beats[beatIndex + 1] <= bar) beatIndex++
    const nextIndex = beatIndex + 1 < beats.length &&
      Math.abs(beats[beatIndex + 1] - bar) < Math.abs(beats[beatIndex] - bar)
      ? beatIndex + 1 : beatIndex
    if (Math.abs(beats[nextIndex] - bar) > 55 ||
      (previousBeatIndex >= 0 && nextIndex - previousBeatIndex !== 4)) return false
    previousBar = bar
    previousBeatIndex = nextIndex
  }
  return true
}

function longSilenceInside(analysis: AnalisisMusical, startMs: number, endMs: number): boolean {
  return analysis.silence.regions.some(region =>
    Number.isFinite(region.startMs) && Number.isFinite(region.endMs) &&
    Math.min(endMs, region.endMs) - Math.max(startMs, region.startMs) > 500)
}

/**
 * Elige N compases 4/4 completos en cada beatgrid medido. Ambos cues caen en
 * marcas reales de barra y el solapamiento termina cerca del final audible de
 * salida. Sin confianza de compás, marcas completas o un ajuste sin deriva,
 * no se propone una duración.
 */
export function suggestBarMix(
  from: AnalisisMusical,
  to: AnalisisMusical,
  fromDurationMs: number,
  toDurationMs: number,
  bars: BarCount,
): BarMixSuggestion | null {
  if (![1, 2, 4, 8, 16].includes(bars) || !usable(from, fromDurationMs) || !usable(to, toDurationMs)) return null
  const outRhythm = from.rhythm!, inRhythm = to.rhythm!
  if (!validBarGrid(outRhythm, from.durationMs) || !validBarGrid(inRhythm, to.durationMs) ||
    Math.abs(outRhythm.bpm - inRhythm.bpm) / Math.min(outRhythm.bpm, inRhythm.bpm) > MAX_TEMPO_DIFFERENCE) return null
  const outBars = outRhythm.barMs, inBars = inRhythm.barMs
  if (outBars.length <= bars || inBars.length <= bars) return null
  const outBarPeriod = 4 * 60_000 / outRhythm.bpm
  const inBarPeriod = 4 * 60_000 / inRhythm.bpm
  let best: { result: BarMixSuggestion; score: number } | null = null

  for (let outIndex = outBars.length - bars - 1; outIndex >= 0; outIndex--) {
    const fromCueMs = outBars[outIndex]
    const endMs = outBars[outIndex + bars]
    const durationMs = endMs - fromCueMs
    const outroGap = from.silence.outroStartMs - endMs
    if (durationMs < 250 || durationMs > 30_000 || fromCueMs < from.silence.introEndMs - 55 ||
      endMs > fromDurationMs || outroGap < -55 || outroGap > outBarPeriod + 55 ||
      longSilenceInside(from, fromCueMs, endMs)) continue

    for (let inIndex = 0; inIndex + bars < inBars.length; inIndex++) {
      const toCueMs = inBars[inIndex]
      const toEndMs = inBars[inIndex + bars]
      const introGap = toCueMs - to.silence.introEndMs
      const driftMs = Math.abs(durationMs - (toEndMs - toCueMs))
      if (introGap < -55 || introGap > inBarPeriod + 55 || driftMs > MAX_DRIFT_MS ||
        toCueMs + durationMs > toDurationMs || toEndMs > to.silence.outroStartMs + 55 ||
        longSilenceInside(to, toCueMs, toEndMs)) continue
      const result = { bars, beats: bars * 4, durationMs, fromCueMs, toCueMs, driftMs }
      const score = Math.max(0, outroGap) + Math.max(0, introGap) + driftMs * 2
      if (!best || score < best.score) best = { result, score }
    }
  }
  return best?.result ?? null
}
