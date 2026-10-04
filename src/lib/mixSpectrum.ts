/** Tres bandas medidas en la misma ventana temporal que los picos de PCM. */
export type MixSpectrumBands = {
  low: readonly number[]
  mid: readonly number[]
  high: readonly number[]
}

export function validMixSpectrum(bands: MixSpectrumBands | null | undefined, length: number): bands is MixSpectrumBands {
  return !!bands && length > 0 && (['low', 'mid', 'high'] as const).every(band =>
    Array.isArray(bands[band]) && bands[band].length === length &&
    bands[band].every(value => Number.isFinite(value) && value >= 0 && value <= 1))
}

export type MixSpectrumPaths = { low: string; mid: string; high: string; fallback: string }

/**
 * Pinta cada barra como tres segmentos simétricos. La envolvente sigue siendo
 * `peaks`; las bandas sólo reparten ese alto, así nunca falsean su amplitud.
 * El RMS de cada banda se eleva al cuadrado para usar proporción de energía.
 */
export function mixSpectrumPaths(
  peaks: readonly number[],
  bands: MixSpectrumBands,
  pitch: number,
  height: number,
  barWidth: number,
): MixSpectrumPaths {
  const paths: MixSpectrumPaths = { low: '', mid: '', high: '', fallback: '' }
  if (!validMixSpectrum(bands, peaks.length) || pitch <= 0 || height <= 0 || barWidth <= 0) return paths
  const center = height / 2
  for (let index = 0; index < peaks.length; index++) {
    const x = (index * pitch + pitch / 2).toFixed(1)
    const amplitude = Math.max(0, Math.min(1, peaks[index] ?? 0))
    const total = Math.max(2, Math.pow(amplitude, 0.78) * height * 0.92)
    const radius = Math.max(0.01, total - barWidth) / 2
    const low = bands.low[index] ** 2
    const mid = bands.mid[index] ** 2
    const high = bands.high[index] ** 2
    const sum = low + mid + high
    if (sum <= 1e-9) {
      paths.fallback += `M${x} ${(center - radius).toFixed(1)}v${(radius * 2).toFixed(1)}`
      continue
    }
    const lowRadius = radius * low / sum
    const midRadius = radius * mid / sum
    const segment = (part: 'low' | 'mid' | 'high', from: number, to: number) => {
      if (to - from < 0.05) return
      paths[part] += `M${x} ${from.toFixed(1)}v${(to - from).toFixed(1)}`
    }
    segment('low', center - lowRadius, center + lowRadius)
    segment('mid', center - lowRadius - midRadius, center - lowRadius)
    segment('mid', center + lowRadius, center + lowRadius + midRadius)
    segment('high', center - radius, center - lowRadius - midRadius)
    segment('high', center + lowRadius + midRadius, center + radius)
  }
  return paths
}
