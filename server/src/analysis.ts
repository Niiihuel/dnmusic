import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { ANALYSIS_MAX_DURATION_MS, ANALYSIS_SAMPLE_RATE, ANALYSIS_VERSION, ANALYSIS_WAVEFORM_BUCKETS, analizarPcm, type AnalysisFeaturesV1, type LoudnessV1 } from './analysis-dsp.js'
import { FFMPEG, FFPROBE } from './binarios.js'

export type MusicAnalysisV1 = Omit<AnalysisFeaturesV1, 'loudness'> & {
  version: typeof ANALYSIS_VERSION
  audioPath: string
  /** Huella opaca de ruta, versión y tamaño del objeto; cambia al reemplazarlo. */
  sourceVersion: string
  loudness: LoudnessV1 | null
}

type DecodedAnalysisFeatures = AnalysisFeaturesV1 & {
  /** Solo interno: loudnorm completó y vio silencio en los canales originales. */
  loudnessSilenceConfirmed?: boolean
}

export class AnalysisError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

type AudioInfo = {
  version?: string | null
  etag?: string | null
  lastModified?: string | null
  size?: number | null
  contentType?: string | null
}

export type StorageReader = {
  info(path: string): Promise<{ data: AudioInfo | null; error: unknown }>
  createSignedUrl(path: string, expiresIn: number): Promise<{ data: { signedUrl: string } | null; error: unknown }>
}

type StorageCache = {
  download(path: string): Promise<{ data: Blob | null; error: unknown }>
  upload(path: string, body: string, options: { contentType: string; upsert: boolean }): Promise<{ error: unknown }>
}

export type AnalysisDependencies = {
  /** Ambas operaciones usan el JWT de la persona y las policies de Storage. */
  reader: StorageReader
  /** El servicio usa su credencial para los JSON calculados. */
  cache: StorageCache
  reserveStorage: (bytes: number) => Promise<unknown>
  decode?: (signedUrl: string) => Promise<DecodedAnalysisFeatures>
}

const MAX_AUDIO_BYTES = 80 * 1024 * 1024
const PCM_MAX_BUFFER = 24 * 1024 * 1024
const LOUDNESS_MAX_BUFFER = 128 * 1024
const LOUDNESS_TIMEOUT_MS = 75_000
/** El formato HTTP continúa en v1; la caché v5 incluye tempo separado de beatgrid. */
export const ANALYSIS_CACHE_VERSION = 5
/** Cada trabajo puede mantener PCM y procesos FFmpeg durante varios minutos. */
export const MAX_CONCURRENT_ANALYSES = 2
/** La consulta de caché es barata, pero también necesita un límite de I/O. */
export const MAX_CONCURRENT_CACHE_LOOKUPS = 8
const pendientes = new Map<string, Promise<MusicAnalysisV1>>()
const consultasCache = new Map<string, Promise<MusicAnalysisV1 | null>>()

/** La service key es `apikey`; Authorization sigue siendo el JWT del usuario. */
export function clienteLecturaAudio(url: string, serviceKey: string, authorization: string, fetchImpl?: typeof fetch) {
  return createClient(url, serviceKey, {
    global: { headers: { Authorization: authorization }, ...(fetchImpl ? { fetch: fetchImpl } : {}) },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Solo rutas de audio, nunca claves de caché, cuarentenas ni URLs externas. */
export function rutaAudioValida(path: string): boolean {
  return /^(?:[A-Za-z0-9_-]{1,128}|propias\/[A-Za-z0-9_-]{1,128})\.(?:m4a|mp4|webm|mp3|flac|wav|aac)$/i.test(path)
}

/** La misma lectura exacta y los mismos límites preceden análisis y ondas. */
export async function verificarAudioAccesible(audioPath: string, reader: Pick<StorageReader, 'info'>): Promise<AudioInfo> {
  if (!rutaAudioValida(audioPath)) throw new AnalysisError(400, 'Ruta de audio inválida.')
  const { data: info, error } = await reader.info(audioPath)
  if (error || !info) throw new AnalysisError(404, 'Audio no disponible.')
  if (info.contentType && !info.contentType.startsWith('audio/')) throw new AnalysisError(422, 'El archivo no es audio.')
  if (!Number.isFinite(info.size) || Number(info.size) <= 0 || Number(info.size) > MAX_AUDIO_BYTES) {
    throw new AnalysisError(422, 'El archivo supera el límite de análisis.')
  }
  return info
}

export function rutaCacheAnalisis(path: string, info: AudioInfo): { ruta: string; version: string } {
  const revision = info.version || info.etag || info.lastModified
  if (!revision || !Number.isFinite(info.size) || Number(info.size) <= 0) {
    throw new AnalysisError(502, 'No se pudo verificar la versión del audio.')
  }
  const version = createHash('sha256').update(JSON.stringify([ANALYSIS_CACHE_VERSION, path, revision, info.size])).digest('hex')
  return { ruta: `analysis/v${ANALYSIS_CACHE_VERSION}/${version}.json`, version }
}

function ejecutar(binario: string, args: string[], maxBuffer: number, timeout: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(binario, args, { encoding: 'buffer', maxBuffer, timeout }, (error, stdout) => {
      if (error) reject(error)
      else resolve(stdout)
    })
  })
}

/** Sólo acepta los valores de entrada de loudnorm; los de salida describen audio normalizado descartado. */
function leerLoudnormDetallado(raw: string): { loudness: LoudnessV1 | null; silenceConfirmed: boolean } {
  const blocks = raw.match(/\{[^{}]*"input_i"[^{}]*\}/g)
  if (!blocks?.length) return { loudness: null, silenceConfirmed: false }
  try {
    const data = JSON.parse(blocks[blocks.length - 1]) as Record<string, unknown>
    if (data.input_i === '-inf' && data.input_tp === '-inf') {
      return { loudness: null, silenceConfirmed: true }
    }
    const parse = (value: unknown): number | null => {
      if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '') return null
      const number = Number(value)
      return Number.isFinite(number) ? number : null
    }
    const integratedLufs = parse(data.input_i)
    const truePeakDbtp = parse(data.input_tp)
    if (integratedLufs === null || truePeakDbtp === null ||
      integratedLufs < -99 || integratedLufs > 10 || truePeakDbtp < -120 || truePeakDbtp > 24) {
      return { loudness: null, silenceConfirmed: false }
    }
    return { loudness: { integratedLufs, truePeakDbtp }, silenceConfirmed: false }
  } catch { return { loudness: null, silenceConfirmed: false } }
}

export function leerLoudnorm(raw: string): LoudnessV1 | null {
  return leerLoudnormDetallado(raw).loudness
}

/** Primera pasada de loudnorm sobre el audio multicanal original, sin guardar la salida procesada. */
async function medirLoudnessDetallado(signedUrl: string): Promise<{ loudness: LoudnessV1 | null; silenceConfirmed: boolean }> {
  try {
    const stderr = await new Promise<string>((resolve, reject) => {
      execFile(FFMPEG, [
        '-nostdin', '-hide_banner', '-nostats', '-loglevel', 'info',
        '-filter_threads', '1', '-threads', '1', '-i', signedUrl,
        '-map', '0:a:0', '-vn', '-sn', '-dn', '-threads', '1',
        '-t', String(ANALYSIS_MAX_DURATION_MS / 1_000),
        '-af', 'loudnorm=I=-24:TP=-2:LRA=7:dual_mono=true:print_format=json',
        '-f', 'null', '-',
      ], { encoding: 'utf8', maxBuffer: LOUDNESS_MAX_BUFFER, timeout: LOUDNESS_TIMEOUT_MS }, (error, _stdout, output) => {
        if (error) reject(error)
        else resolve(output)
      })
    })
    return leerLoudnormDetallado(stderr)
  } catch {
    // FFmpeg puede fallar por codec, red, tiempo o filtro ausente. No se inventa loudness.
    return { loudness: null, silenceConfirmed: false }
  }
}

export async function medirLoudness(signedUrl: string): Promise<LoudnessV1 | null> {
  return (await medirLoudnessDetallado(signedUrl)).loudness
}

/** ffprobe acota el trabajo; el PCM de ritmo y la medición multicanal usan pasadas separadas. */
export async function decodificarYAnalizar(signedUrl: string): Promise<DecodedAnalysisFeatures> {
  try {
    const duracion = await ejecutar(FFPROBE, [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', signedUrl,
    ], 16 * 1024, 20_000)
    const duracionMs = Number(duracion.toString().trim()) * 1_000
    if (!Number.isFinite(duracionMs) || duracionMs <= 0) throw new AnalysisError(422, 'El audio no tiene una duración medible.')
    if (duracionMs > ANALYSIS_MAX_DURATION_MS) throw new AnalysisError(422, 'El análisis admite canciones de hasta 20 minutos.')

    const bytes = await ejecutar(FFMPEG, [
      '-nostdin', '-loglevel', 'error', '-i', signedUrl, '-map', '0:a:0', '-vn',
      '-ac', '1', '-ar', String(ANALYSIS_SAMPLE_RATE), '-f', 's16le', '-',
    ], PCM_MAX_BUFFER, 150_000)
    if (bytes.length % 2 !== 0 || bytes.length === 0) throw new AnalysisError(422, 'No se pudo decodificar el audio.')
    const muestras = new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
    const features = analizarPcm(muestras)
    const medicion = await medirLoudnessDetallado(signedUrl)
    return { ...features, loudness: medicion.loudness, loudnessSilenceConfirmed: medicion.silenceConfirmed }
  } catch (error) {
    if (error instanceof AnalysisError) throw error
    // execFile incluye los argumentos en el error; la URL firmada nunca sale
    // en la respuesta HTTP ni en el mensaje expuesto al cliente.
    throw new AnalysisError(502, 'No se pudo analizar el audio.')
  }
}

function tempoValido(value: unknown): boolean {
  if (value === null) return true
  if (!value || typeof value !== 'object') return false
  const tempo = value as Record<string, unknown>
  return typeof tempo.bpm === 'number' && Number.isFinite(tempo.bpm) && tempo.bpm >= 60 && tempo.bpm <= 200 &&
    typeof tempo.minBpm === 'number' && Number.isFinite(tempo.minBpm) && tempo.minBpm >= 60 && tempo.minBpm <= tempo.bpm &&
    typeof tempo.maxBpm === 'number' && Number.isFinite(tempo.maxBpm) && tempo.maxBpm >= tempo.bpm && tempo.maxBpm <= 200 &&
    typeof tempo.confidence === 'number' && Number.isFinite(tempo.confidence) && tempo.confidence >= 0 && tempo.confidence <= 1 &&
    typeof tempo.varying === 'boolean' &&
    (tempo.alternateBpm === null || (typeof tempo.alternateBpm === 'number' && Number.isFinite(tempo.alternateBpm) &&
      tempo.alternateBpm >= 60 && tempo.alternateBpm <= 200))
}

function cacheValida(value: unknown, path: string, version: string): value is MusicAnalysisV1 {
  if (!value || typeof value !== 'object') return false
  const a = value as Partial<MusicAnalysisV1>
  return a.version === ANALYSIS_VERSION && a.audioPath === path && a.sourceVersion === version &&
    typeof a.durationMs === 'number' && a.durationMs > 0 && a.durationMs <= ANALYSIS_MAX_DURATION_MS &&
    Array.isArray(a.waveform?.rms) && a.waveform.rms.length === ANALYSIS_WAVEFORM_BUCKETS &&
    a.waveform.rms.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1) &&
    typeof a.energy?.meanRms === 'number' && Number.isFinite(a.energy.meanRms) &&
    typeof a.energy.peakRms === 'number' && Number.isFinite(a.energy.peakRms) &&
    typeof a.silence?.introEndMs === 'number' &&
    (a.loudness === null || (typeof a.loudness?.integratedLufs === 'number' && Number.isFinite(a.loudness.integratedLufs) &&
      typeof a.loudness.truePeakDbtp === 'number' && Number.isFinite(a.loudness.truePeakDbtp))) &&
    (a.loudness !== null || audioSilencioso(a.energy)) &&
    tempoValido(a.tempo) &&
    (a.rhythm === null || (typeof a.rhythm?.bpm === 'number' && Array.isArray(a.rhythm.beatMs)))
}

function audioSilencioso(energy: AnalysisFeaturesV1['energy']): boolean {
  return energy.meanRms === 0 && energy.peakRms === 0
}

async function leerCache(cache: StorageCache, ruta: string, path: string, version: string): Promise<MusicAnalysisV1 | null> {
  try {
    const { data, error } = await cache.download(ruta)
    if (error || !data) return null
    const json: unknown = JSON.parse(await data.text())
    return cacheValida(json, path, version) ? json : null
  } catch { return null }
}

/**
 * Comprueba lectura EXACTA antes de tocar el cache. La ruta se firma con el
 * cliente del usuario; una service_role nunca autoriza acceso a audio privado.
 */
export async function obtenerAnalisisMusical(audioPath: string, deps: AnalysisDependencies): Promise<MusicAnalysisV1> {
  const info = await verificarAudioAccesible(audioPath, deps.reader)
  const { ruta, version } = rutaCacheAnalisis(audioPath, info)
  const existente = pendientes.get(ruta)
  if (existente) return existente

  // Un acierto de caché se sirve aunque los dos cálculos de FFmpeg estén
  // ocupados. Las consultas de una misma huella comparten lectura de Storage.
  let consulta = consultasCache.get(ruta)
  if (!consulta) {
    if (consultasCache.size >= MAX_CONCURRENT_CACHE_LOOKUPS) {
      throw new AnalysisError(429, 'Hay demasiados análisis en curso. Reintentá en unos segundos.')
    }
    consulta = (async () => {
      try { return await leerCache(deps.cache, ruta, audioPath, version) }
      finally { consultasCache.delete(ruta) }
    })()
    consultasCache.set(ruta, consulta)
  }
  const cacheado = await consulta
  if (cacheado) return cacheado

  // Varios misses pueden reanudarse del mismo await: solo el primero reserva
  // el cupo, y el resto reutiliza su promesa de cálculo.
  const trasConsulta = pendientes.get(ruta)
  if (trasConsulta) return trasConsulta
  if (pendientes.size >= MAX_CONCURRENT_ANALYSES) {
    throw new AnalysisError(429, 'Hay demasiados análisis en curso. Reintentá en unos segundos.')
  }

  const trabajo = (async () => {
    const { data: firma, error: errorFirma } = await deps.reader.createSignedUrl(audioPath, 300)
    if (errorFirma || !firma?.signedUrl) throw new AnalysisError(404, 'Audio no disponible.')
    const features = await (deps.decode ?? decodificarYAnalizar)(firma.signedUrl)
    const { loudnessSilenceConfirmed, ...publicFeatures } = features
    const resultado: MusicAnalysisV1 = { version: ANALYSIS_VERSION, audioPath, sourceVersion: version, ...publicFeatures,
      loudness: publicFeatures.loudness ?? null }
    // Un fallo transitorio de loudnorm no debe quedar fijado en la caché.
    // Silencio se confirma con loudnorm sobre los canales originales, ya que
    // el downmix a mono puede cancelar dos canales audibles en contrafase.
    if (resultado.loudness !== null || (loudnessSilenceConfirmed && audioSilencioso(resultado.energy))) {
      const json = JSON.stringify(resultado)
      try {
        await deps.reserveStorage(Buffer.byteLength(json))
        const { error: errorCache } = await deps.cache.upload(ruta, json, { contentType: 'application/json', upsert: true })
        if (errorCache) console.warn('[dnmusic] análisis entregado sin caché: Storage rechazó la escritura.')
      } catch {
        // El cálculo ya existe y se entrega; nunca se registra la URL firmada.
        console.warn('[dnmusic] análisis entregado sin caché: no se pudo reservar o escribir Storage.')
      }
    }
    return resultado
  })()
  pendientes.set(ruta, trabajo)
  try { return await trabajo } finally { pendientes.delete(ruta) }
}
