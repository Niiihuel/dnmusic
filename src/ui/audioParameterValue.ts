type Range = { min: number; max: number; step: number; scale?: 'linear' | 'log' }

/** Keep controls, numeric entry and callbacks on the same finite grid. */
export function parameterValue(value: number, range: Range): number {
  const { min, max, step } = range
  if (!Number.isFinite(value)) return min
  const bounded = Math.max(min, Math.min(max, value))
  const snapped = step > 0 ? min + Math.round((bounded - min) / step) * step : bounded
  return Math.max(min, Math.min(max, Number(snapped.toFixed(9))))
}

export function parameterPosition(value: number, range: Range): number {
  if (range.max <= range.min) return 0
  const current = Math.max(range.min, Math.min(range.max, value))
  return range.scale === 'log' && range.min > 0
    ? Math.log(current / range.min) / Math.log(range.max / range.min)
    : (current - range.min) / (range.max - range.min)
}

export function parameterFromPosition(position: number, range: Range): number {
  const fraction = Math.max(0, Math.min(1, Number.isFinite(position) ? position : 0))
  return parameterValue(range.scale === 'log' && range.min > 0
    ? range.min * (range.max / range.min) ** fraction
    : range.min + fraction * (range.max - range.min), range)
}

/** Blank, partial and nonfinite edits never turn into a saved parameter. */
export function parameterEntry(text: string, inputScale = 1): number | null {
  if (!text.trim()) return null
  const value = Number(text.replace(',', '.')) * inputScale
  return Number.isFinite(value) ? value : null
}
