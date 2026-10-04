/** Geometry for the playlist mix editor's two-scale waveform. */
import type { MixSpectrumBands } from './mixSpectrum'

export const MIX_WINDOW_SHARE = 0.76
// Keep enough measured audio on each side to follow a full touch/mouse drag.
// The overview handles long jumps; the detailed strip is for a nearby cue.
export const DRAG_CONTEXT_SHARE = 0.6
export const CUE_FINE_STEP_MS = 100

export type MixWaveformZoom = {
  windowLeft: number
  windowWidth: number
  pxPerMs: number
  renderLeft: number
  renderWidth: number
  renderStartMs: number
  overviewLeft: number
  overviewWidth: number
  maxStartMs: number
}

export type MixWaveformDetail = {
  peaks: readonly number[]
  bands?: MixSpectrumBands | null
  /** Absolute start in the song (the requested `desdeMs`). */
  startMs: number
  /** Actual decoded duration returned by `/peaks`, which can be shorter at the end. */
  durationMs: number
}

/** Millisecond range to request from `/peaks` for one draggable close view. */
export function mixWaveformDetailRange(durationMs: number, windowMs: number, startMs: number,
  maxDurationMs = Number.POSITIVE_INFINITY): {
  startMs: number; durationMs: number
} | null {
  if (![durationMs, windowMs, startMs].every(Number.isFinite)
    || durationMs <= 0 || windowMs <= 0 || maxDurationMs <= 0) return null
  const safeWindow = Math.min(durationMs, windowMs)
  const cue = Math.max(0, Math.min(durationMs - safeWindow, startMs))
  const leftShare = (1 - MIX_WINDOW_SHARE) / 2
  const first = cue - (leftShare + DRAG_CONTEXT_SHARE) / MIX_WINDOW_SHARE * safeWindow
  const last = cue + (1 + DRAG_CONTEXT_SHARE - leftShare) / MIX_WINDOW_SHARE * safeWindow
  // Coarse rounding reuses the same cached PCM excerpt over small cue nudges.
  const from = Math.max(0, Math.floor(first / 1_000) * 1_000)
  const to = Math.min(durationMs, Math.ceil(last / 1_000) * 1_000)
  if (to - from > maxDurationMs) {
    // Una canción propia permite como máximo 30 s por pedido. Centrar ese
    // fragmento en el cruce conserva íntegra la ventana visible, mientras la
    // onda global sigue mostrando el contexto que queda fuera del pedido.
    const clipMs = Math.min(durationMs, Math.max(safeWindow, maxDurationMs))
    const clipStart = Math.max(0, Math.min(durationMs - clipMs,
      cue + safeWindow / 2 - clipMs / 2))
    return { startMs: Math.round(clipStart), durationMs: Math.round(clipMs) }
  }
  return { startMs: from, durationMs: Math.max(1, Math.round(to - from)) }
}

export function mixWaveformZoom(
  width: number,
  durationMs: number,
  windowMs: number,
  startMs: number,
): MixWaveformZoom | null {
  if (![width, durationMs, windowMs, startMs].every(Number.isFinite)
    || width <= 0 || durationMs <= 0 || windowMs <= 0) return null
  const safeWindowMs = Math.min(durationMs, windowMs)
  const maxStartMs = Math.max(0, durationMs - safeWindowMs)
  const cueMs = Math.max(0, Math.min(maxStartMs, startMs))
  const windowWidth = width * MIX_WINDOW_SHARE
  const windowLeft = (width - windowWidth) / 2
  const pxPerMs = windowWidth / safeWindowMs
  // Render only the visible strip and a small amount for fluid drag feedback.
  // Even a 250 ms transition in a long song never creates a giant SVG.
  const extra = width * DRAG_CONTEXT_SHARE
  const renderLeft = -extra
  const renderWidth = width + extra * 2
  const renderStartMs = cueMs - (windowLeft + extra) / pxPerMs
  const overviewWidth = Math.min(width, Math.max(20, width * safeWindowMs / durationMs))
  const overviewLeft = maxStartMs ? cueMs / maxStartMs * (width - overviewWidth) : 0
  return {
    windowLeft, windowWidth, pxPerMs, renderLeft, renderWidth, renderStartMs,
    overviewLeft, overviewWidth, maxStartMs,
  }
}

/**
 * `/peaks` normaliza cada recorte contra su propio máximo. Reconciliamos esa
 * escala con la onda de la canción usando solamente buckets globales que el
 * recorte PCM cubre enteros: ambos son RMS, así que sus energías cuadráticas
 * son comparables aun cuando las resoluciones son distintas.
 *
 * Un tramo menor que dos buckets globales no tiene referencia suficiente. En
 * ese caso se muestra la onda global; agrandar el detalle local a ojo haría que
 * un silencio pareciera tan fuerte como el resto de la canción.
 */
export function detailAmplitudeScale(
  globalPeaks: readonly number[], durationMs: number, detail: MixWaveformDetail | null | undefined,
): number | null {
  if (!detail || globalPeaks.length < 2 || detail.peaks.length < 2 ||
    !Number.isFinite(durationMs) || durationMs <= 0 ||
    !Number.isFinite(detail.startMs) || !Number.isFinite(detail.durationMs) ||
    detail.startMs < 0 || detail.durationMs <= 0 ||
    detail.startMs + detail.durationMs > durationMs + 100 ||
    globalPeaks.some(value => !Number.isFinite(value) || value < 0 || value > 1) ||
    detail.peaks.some(value => !Number.isFinite(value) || value < 0 || value > 1)) return null

  // Cero PCM es silencio medido, independientemente del factor de escala.
  if (detail.peaks.every(value => value === 0)) return 1

  const globalBucketMs = durationMs / globalPeaks.length
  const detailBucketMs = detail.durationMs / detail.peaks.length
  const detailEndMs = detail.startMs + detail.durationMs
  let globalEnergy = 0
  let detailEnergy = 0
  let coveredBuckets = 0

  for (let index = 0; index < globalPeaks.length; index++) {
    const start = index * globalBucketMs
    const end = start + globalBucketMs
    if (start < detail.startMs || end > detailEndMs) continue

    // Integrar por intersección temporal, sin elegir arbitrariamente un pico
    // del detalle ni interpolar una amplitud que no fue medida.
    let squareSum = 0
    const first = Math.max(0, Math.floor((start - detail.startMs) / detailBucketMs))
    const last = Math.min(detail.peaks.length - 1,
      Math.ceil((end - detail.startMs) / detailBucketMs) - 1)
    for (let fine = first; fine <= last; fine++) {
      const fineStart = detail.startMs + fine * detailBucketMs
      const overlap = Math.max(0, Math.min(end, fineStart + detailBucketMs) - Math.max(start, fineStart))
      squareSum += (detail.peaks[fine] ** 2) * overlap
    }
    globalEnergy += globalPeaks[index] ** 2
    detailEnergy += squareSum / globalBucketMs
    coveredBuckets++
  }

  if (coveredBuckets < 2 || detailEnergy <= 1e-12) return null
  const scale = Math.sqrt(globalEnergy / detailEnergy)
  // El recorte ya está normalizado por su propio máximo; un factor >1 indica
  // que las fuentes o ventanas no son comparables. Conservar la onda global.
  return Number.isFinite(scale) && scale <= 1.05 ? Math.min(1, scale) : null
}

/** A fixed number of bars sampled from the local time range. */
export function sampleMixWaveform(
  peaks: readonly number[],
  durationMs: number,
  renderStartMs: number,
  pxPerMs: number,
  renderWidth: number,
  barCount: number,
  detail?: MixWaveformDetail | null,
  amplitudeScale?: number | null,
): number[] {
  if (!peaks.length || durationMs <= 0 || pxPerMs <= 0 || barCount <= 0) return []
  const scale = amplitudeScale === undefined
    ? detailAmplitudeScale(peaks, durationMs, detail) : amplitudeScale
  const count = Math.min(900, Math.max(1, Math.floor(barCount)))
  const validStart = Math.max(0, renderStartMs)
  const validEnd = Math.min(durationMs, renderStartMs + renderWidth / pxPerMs)
  // Decoder duration can differ by a few PCM frames from the requested clip.
  const coverageToleranceMs = 100
  const detailCoversView = !!detail && detail.peaks.length > 0 && detail.durationMs > 0
    && detail.startMs <= validStart + coverageToleranceMs
    && detail.startMs + detail.durationMs >= validEnd - coverageToleranceMs
  const sample = (source: readonly number[], sourceStart: number, sourceDuration: number, ms: number) => {
    const bucket = Math.max(0, Math.min(source.length - 1,
      (ms - sourceStart) / sourceDuration * source.length - 0.5))
    const left = Math.floor(bucket)
    const blend = bucket - left
    return (source[left] ?? 0) * (1 - blend) + (source[Math.min(source.length - 1, left + 1)] ?? 0) * blend
  }
  return Array.from({ length: count }, (_, index) => {
    const ms = renderStartMs + ((index + 0.5) / count * renderWidth) / pxPerMs
    if (ms < 0 || ms > durationMs) return 0
    const global = sample(peaks, 0, durationMs, ms)
    if (!detail || !detail.peaks.length || detail.durationMs <= 0 || scale === null) return global
    if (detailCoversView) return sample(detail.peaks, detail.startMs, detail.durationMs, ms) * scale
    const detailEnd = detail.startMs + detail.durationMs
    if (ms < detail.startMs || ms > detailEnd) return global
    const local = sample(detail.peaks, detail.startMs, detail.durationMs, ms) * scale
    // Empalme corto para no crear un salto visual al pasar del contexto
    // general al PCM más detallado en el borde del tramo solicitado.
    const weight = Math.max(0, Math.min(1, (ms - detail.startMs) / 100, (detailEnd - ms) / 100))
    return global * (1 - weight) + local * weight
  })
}

export function cueFromOverviewX(x: number, geometry: MixWaveformZoom, width: number): number {
  if (geometry.maxStartMs <= 0 || width <= geometry.overviewWidth) return 0
  return Math.round(Math.max(0, Math.min(geometry.maxStartMs,
    x / (width - geometry.overviewWidth) * geometry.maxStartMs)))
}

export function cueFromFocusDrag(startMs: number, deltaX: number, geometry: MixWaveformZoom): number {
  return Math.round(Math.max(0, Math.min(geometry.maxStartMs, startMs - deltaX / geometry.pxPerMs)))
}

/** Keyboard, accessibility and visible fine-adjust buttons use the same step. */
export function stepMixCue(startMs: number, deltaMs: number, maxStartMs: number): number {
  if (![startMs, deltaMs, maxStartMs].every(Number.isFinite) || maxStartMs <= 0) return 0
  return Math.round(Math.max(0, Math.min(maxStartMs, startMs + deltaMs)))
}
