import { fetchMusica, fetchWaveform } from './music'
import { validMixSpectrum, type MixSpectrumBands } from '../lib/mixSpectrum'

/** Contrato de GET /analysis v1. El servidor calcula solo lo medible del PCM. */
export type AnalisisMusical = {
  version: 1
  audioPath: string
  sourceVersion: string
  durationMs: number
  waveform: { rms: number[]; bucketMs: number; bands?: MixSpectrumBands | null }
  energy: { meanRms: number; peakRms: number; dynamicsDb: number }
  silence: { introEndMs: number; outroStartMs: number; regions: { startMs: number; endMs: number }[] }
  /** Presente en la caché nueva; `null` si la medición no fue fiable. */
  loudness?: { integratedLufs: number; truePeakDbtp: number } | null
  rhythm: null | {
    bpm: number
    confidence: number
    beatMs: number[]
    meter: 4 | null
    barMs: number[] | null
  }
  /** Estimación de tempo sin beatgrid; puede existir aunque `rhythm` sea null. */
  tempo?: null | {
    bpm: number
    minBpm: number
    maxBpm: number
    confidence: number
    varying: boolean
    alternateBpm: number | null
  }
}

export type OndaDeMix = {
  /** La forma siempre procede de PCM medido por el servidor. */
  peaks: number[]
  bands?: MixSpectrumBands | null
  durationMs: number
  source: 'analysis' | 'peaks'
  /** Tempo, silencio, LUFS y compases sólo existen si /analysis respondió. */
  analysis: AnalisisMusical | null
  analysisError: string | null
}

const MUSIC_API = (process.env.EXPO_PUBLIC_MUSIC_API ?? 'http://localhost:8787').trim().replace(/\/+$/, '')

function esperarCupo(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Análisis cancelado.')); return }
    const onAbort = () => {
      clearTimeout(timer)
      reject(new Error('Análisis cancelado.'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function validTempo(tempo: AnalisisMusical['tempo']): boolean {
  if (tempo == null) return true
  return Number.isFinite(tempo.bpm) && Number.isFinite(tempo.minBpm) && Number.isFinite(tempo.maxBpm) &&
    tempo.minBpm >= 60 && tempo.maxBpm <= 200 && tempo.minBpm <= tempo.bpm && tempo.bpm <= tempo.maxBpm &&
    Number.isFinite(tempo.confidence) && tempo.confidence >= 0 && tempo.confidence <= 1 &&
    typeof tempo.varying === 'boolean' &&
    (tempo.alternateBpm === null || (Number.isFinite(tempo.alternateBpm) &&
      tempo.alternateBpm >= 60 && tempo.alternateBpm <= 200))
}

/**
 * La ruta pertenece al bucket `songs`. Un pulso sin confianza vuelve como
 * `rhythm:null`; el `tempo` opcional puede informar BPM aproximado, pero la
 * app no debe inventar beatgrid, compás ni tonalidad a partir de ese dato.
 */
export async function pedirAnalisisMusical(audioPath: string, signal?: AbortSignal): Promise<AnalisisMusical> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetchMusica(`${MUSIC_API}/analysis?audioPath=${encodeURIComponent(audioPath)}`, { signal })
    if (response.status === 429 && attempt < 3) {
      const after = Number(response.headers.get('Retry-After'))
      await esperarCupo(Number.isFinite(after) && after > 0 ? Math.min(5_000, after * 1_000) : 2_000, signal)
      continue
    }
    const body = await response.json() as AnalisisMusical & { error?: string }
    if (!response.ok || body.error) throw new Error(body.error ?? 'No se pudo analizar la canción.')
    if (body.version !== 1 || body.audioPath !== audioPath || !Array.isArray(body.waveform?.rms) ||
      !Number.isFinite(body.durationMs) || !Array.isArray(body.silence?.regions) ||
      (body.loudness != null && (!Number.isFinite(body.loudness.integratedLufs) ||
        !Number.isFinite(body.loudness.truePeakDbtp)))) {
      throw new Error('El análisis recibido no tiene un formato válido.')
    }
    if (body.waveform.bands && !validMixSpectrum(body.waveform.bands, body.waveform.rms.length)) {
      body.waveform.bands = null
    }
    // El tempo complementario no debe invalidar una onda PCM o un beatgrid válido.
    if (!validTempo(body.tempo)) body.tempo = null
    return body
  }
  throw new Error('El análisis está ocupado. Reintentá dentro de unos segundos.')
}

function mensaje(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : 'No se pudo analizar la canción.'
}

/**
 * El editor necesita una onda aunque aún falte el análisis de ritmo. `/peaks`
 * es otra medición real del audio guardado y sólo se usa para temas del catálogo:
 * las canciones propias no tienen videoId resoluble. No deducimos de la onda
 * BPM, silencio, compás o volumen; esos campos permanecen ausentes.
 */
export async function pedirOndaDeMix(
  track: { audioPath?: string | null; videoId?: string | null },
  signal?: AbortSignal,
): Promise<OndaDeMix> {
  let analysisError: string | null = null
  if (track.audioPath) {
    try {
      const analysis = await pedirAnalisisMusical(track.audioPath, signal)
      return { peaks: analysis.waveform.rms, bands: analysis.waveform.bands ?? null, durationMs: analysis.durationMs,
        source: 'analysis', analysis, analysisError: null }
    } catch (error) {
      if (signal?.aborted) throw error
      analysisError = mensaje(error)
    }
  } else {
    analysisError = 'El audio todavía no está preparado.'
  }

  if (!track.videoId || track.videoId.startsWith('propia:')) {
    throw new Error(analysisError ?? 'Esta canción aún no tiene audio medible.')
  }
  try {
    const waveform = await fetchWaveform(track.videoId, 256, signal)
    if (!Number.isFinite(waveform.durationMs) || waveform.durationMs <= 0 ||
      !Array.isArray(waveform.peaks) || waveform.peaks.length < 2 || waveform.peaks.length > 600 ||
      waveform.peaks.some(value => !Number.isFinite(value) || value < 0 || value > 1)) {
      throw new Error('El servidor devolvió una onda inválida.')
    }
    return { peaks: waveform.peaks,
      bands: validMixSpectrum(waveform.bands, waveform.peaks.length) ? waveform.bands : null,
      durationMs: waveform.durationMs,
      source: 'peaks', analysis: null, analysisError }
  } catch (error) {
    if (signal?.aborted) throw error
    throw new Error(`${analysisError ?? 'No se pudo analizar el audio.'} ${mensaje(error)}`)
  }
}
