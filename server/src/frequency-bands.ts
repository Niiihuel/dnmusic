/**
 * Forma de onda y energía de tres bandas, medidas en el mismo PCM mono.
 * Las bandas se separan con dos filtros pasa bajos (160 y 1000 Hz). Sus
 * amplitudes usan la misma referencia que `peaks`; la UI puede componer los
 * colores sin alterar el alto ni la posición temporal de cada barra.
 */
export type FrequencyBands = { low: number[]; mid: number[]; high: number[] }
export type FrequencyWaveform = {
  peaks: number[]
  bands: FrequencyBands
  durationMs: number
}

export function medirOndaFrecuencias(
  muestras: Int16Array,
  buckets: number,
  sampleRate = 8_000,
): FrequencyWaveform {
  if (!muestras.length || !Number.isSafeInteger(buckets) || buckets < 1 || sampleRate <= 0) {
    throw new Error('Audio vacío o cantidad de barras inválida')
  }
  const total = new Float64Array(buckets)
  const bajos = new Float64Array(buckets)
  const medios = new Float64Array(buckets)
  const altos = new Float64Array(buckets)
  const cuentas = new Uint32Array(buckets)
  const alfaBajo = Math.exp(-2 * Math.PI * 160 / sampleRate)
  const alfaMedio = Math.exp(-2 * Math.PI * 1_000 / sampleRate)
  let filtroBajo = 0
  let filtroMedio = 0

  for (let i = 0; i < muestras.length; i++) {
    const bucket = Math.min(buckets - 1, Math.floor(i * buckets / muestras.length))
    const v = muestras[i] / 32768
    filtroBajo = alfaBajo * filtroBajo + (1 - alfaBajo) * v
    filtroMedio = alfaMedio * filtroMedio + (1 - alfaMedio) * v
    const bajo = filtroBajo
    const medio = filtroMedio - filtroBajo
    const alto = v - filtroMedio
    total[bucket] += v * v
    bajos[bucket] += bajo * bajo
    medios[bucket] += medio * medio
    altos[bucket] += alto * alto
    cuentas[bucket]++
  }

  const rms = (sum: Float64Array, bucket: number) =>
    Math.sqrt(sum[bucket] / Math.max(1, cuentas[bucket]))
  let referencia = 1e-9
  for (let b = 0; b < buckets; b++) referencia = Math.max(referencia, rms(total, b))
  const normalizar = (sum: Float64Array) => Array.from({ length: buckets }, (_, b) =>
    Math.min(1, Number((rms(sum, b) / referencia).toFixed(3))))

  return {
    peaks: normalizar(total),
    bands: { low: normalizar(bajos), mid: normalizar(medios), high: normalizar(altos) },
    durationMs: Math.round(muestras.length / sampleRate * 1_000),
  }
}
