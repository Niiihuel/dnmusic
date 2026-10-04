import { AnalysisError, rutaCacheAnalisis, verificarAudioAccesible, type StorageReader } from './analysis.js'
import { peaks } from './youtube.js'
import type { FrequencyBands } from './frequency-bands.js'

export type WaveformRange = { desdeMs: number; durMs: number; buckets: number }
export type WaveformResult = { peaks: number[]; bands?: FrequencyBands; durationMs: number }

type WaveformDependencies = {
  /** info y firma usan el JWT del usuario, nunca una service_role. */
  reader: Pick<StorageReader, 'info' | 'createSignedUrl'>
  decode?: (signedUrl: string, buckets: number, range: { desdeMs: number; durMs: number }) => Promise<WaveformResult>
}

const MAX_END_MS = 4 * 60 * 60_000
const MAX_ACTIVE_WAVEFORMS = 2
const MEMORY_CACHE_MAX = 32
const MEMORY_CACHE_TTL_MS = 5 * 60_000
const pending = new Map<string, Promise<WaveformResult>>()
const memoryCache = new Map<string, { value: WaveformResult; expiresAt: number }>()

function entero(raw: string | null): number {
  if (raw === null || !/^\d+$/.test(raw)) throw new AnalysisError(400, 'Rango de onda inválido.')
  return Number(raw)
}

export function validarRangoOnda(range: WaveformRange): WaveformRange {
  const { desdeMs, durMs, buckets } = range
  if (!Number.isSafeInteger(desdeMs) || desdeMs < 0 ||
    !Number.isSafeInteger(durMs) || durMs < 250 || durMs > 30_000 ||
    !Number.isSafeInteger(buckets) || buckets < 40 || buckets > 600 ||
    desdeMs + durMs > MAX_END_MS) {
    throw new AnalysisError(400, 'El tramo debe durar entre 250 ms y 30 s, con 40 a 600 barras.')
  }
  return range
}

export function leerRangoOnda(params: URLSearchParams): WaveformRange {
  return validarRangoOnda({
    desdeMs: entero(params.get('desdeMs')),
    durMs: entero(params.get('durMs')),
    buckets: entero(params.get('buckets')),
  })
}

function deMemoria(key: string): WaveformResult | null {
  const cached = memoryCache.get(key)
  if (!cached) return null
  memoryCache.delete(key)
  if (cached.expiresAt <= Date.now()) return null
  memoryCache.set(key, cached)
  return cached.value
}

function aMemoria(key: string, value: WaveformResult): void {
  memoryCache.delete(key)
  memoryCache.set(key, { value, expiresAt: Date.now() + MEMORY_CACHE_TTL_MS })
  while (memoryCache.size > MEMORY_CACHE_MAX) {
    const oldest = memoryCache.keys().next().value
    if (oldest === undefined) break
    memoryCache.delete(oldest)
  }
}

function ondaValida(wave: WaveformResult, range: WaveformRange): boolean {
  // Los códecs por cuadros pueden dejar unas muestras adicionales al recortar.
  return Number.isFinite(wave.durationMs) && wave.durationMs > 0 && wave.durationMs <= range.durMs + 100 &&
    Array.isArray(wave.peaks) && wave.peaks.length === range.buckets &&
    wave.peaks.every(value => Number.isFinite(value) && value >= 0 && value <= 1) &&
    (!wave.bands || (['low', 'mid', 'high'] as const).every(band =>
      Array.isArray(wave.bands?.[band]) && wave.bands[band].length === range.buckets &&
      wave.bands[band].every(value => Number.isFinite(value) && value >= 0 && value <= 1)))
}

/** Calcula un tramo PCM después de comprobar lectura de la ruta exacta. */
export async function obtenerOndaAudio(
  audioPath: string,
  range: WaveformRange,
  deps: WaveformDependencies,
): Promise<WaveformResult> {
  validarRangoOnda(range)
  const info = await verificarAudioAccesible(audioPath, deps.reader)
  const sourceVersion = rutaCacheAnalisis(audioPath, info).version
  const key = `onda1:${sourceVersion}:${range.desdeMs}:${range.durMs}:${range.buckets}`

  const cached = deMemoria(key)
  if (cached) return cached
  const existing = pending.get(key)
  if (existing) return existing
  if (pending.size >= MAX_ACTIVE_WAVEFORMS) {
    throw new AnalysisError(429, 'Hay demasiadas ondas en curso. Reintentá en unos segundos.')
  }

  const task = (async () => {
    const { data: signed, error } = await deps.reader.createSignedUrl(audioPath, 60)
    if (error || !signed?.signedUrl) throw new AnalysisError(404, 'Audio no disponible.')
    let wave: WaveformResult
    try {
      wave = await (deps.decode ?? ((url, buckets, tramo) =>
        peaks(url, buckets, tramo, { timeoutMs: 45_000, maxBufferBytes: 2 * 1024 * 1024 })))(
        signed.signedUrl, range.buckets, { desdeMs: range.desdeMs, durMs: range.durMs })
    } catch {
      // execFile puede llevar la URL firmada en su error: nunca se expone ni registra.
      throw new AnalysisError(502, 'No se pudo medir la onda del audio.')
    }
    if (!ondaValida(wave, range)) throw new AnalysisError(502, 'No se pudo medir la onda del audio.')
    aMemoria(key, wave)
    return wave
  })()
  pending.set(key, task)
  try { return await task } finally { pending.delete(key) }
}
