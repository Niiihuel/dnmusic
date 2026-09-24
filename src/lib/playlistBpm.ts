import type { AnalisisMusical } from '../services/analisisMusical'

type Loader = (audioPath: string, signal: AbortSignal) => Promise<AnalisisMusical>
type Job = {
  path: string
  controller: AbortController
  listeners: Set<() => void>
}
export type TempoDeLista = {
  bpm: number
  approximate: boolean
  minBpm: number
  maxBpm: number
  varying: boolean
}
type Cached = { tempo: TempoDeLista | null; expiresAt: number }

const MIN_CONFIDENCE = 0.75
const SUCCESS_TTL_MS = 30 * 60_000
const ERROR_TTL_MS = 30_000
const MAX_CACHE_ITEMS = 256

/** La etiqueta sólo usa un pulso real y estable del PCM de esta versión de audio. */
export function bpmConfiable(analysis: AnalisisMusical): number | null {
  const rhythm = analysis.rhythm
  if (analysis.version !== 1 || !Number.isFinite(analysis.durationMs) || analysis.durationMs <= 0 ||
    !rhythm || !Number.isFinite(rhythm.bpm) || rhythm.bpm < 60 || rhythm.bpm > 200 ||
    !Number.isFinite(rhythm.confidence) || rhythm.confidence < MIN_CONFIDENCE ||
    !Array.isArray(rhythm.beatMs) || rhythm.beatMs.length < 16) return null
  let previous = -1
  for (const beat of rhythm.beatMs) {
    if (!Number.isFinite(beat) || beat <= previous || beat < 0 || beat > analysis.durationMs) return null
    previous = beat
  }
  return Math.round(rhythm.bpm)
}

/** Una cifra orientativa para elegir temas; nunca habilita la rejilla del mix. */
export function tempoDeLista(analysis: AnalisisMusical): TempoDeLista | null {
  const reliable = bpmConfiable(analysis)
  if (reliable !== null) return {
    bpm: reliable, approximate: false, minBpm: reliable, maxBpm: reliable, varying: false,
  }
  const tempo = analysis.tempo
  if (!tempo || !Number.isFinite(tempo.bpm) || tempo.bpm < 60 || tempo.bpm > 200 ||
    !Number.isFinite(tempo.minBpm) || !Number.isFinite(tempo.maxBpm) ||
    tempo.minBpm < 60 || tempo.maxBpm > 200 || tempo.minBpm > tempo.bpm || tempo.maxBpm < tempo.bpm ||
    !Number.isFinite(tempo.confidence) || tempo.confidence < 0 || tempo.confidence > 1 ||
    typeof tempo.varying !== 'boolean') return null
  return {
    bpm: Math.round(tempo.bpm), approximate: true,
    minBpm: Math.round(tempo.minBpm), maxBpm: Math.round(tempo.maxBpm), varying: tempo.varying,
  }
}

/**
 * Una cola compartida entre playlists montadas: máximo dos análisis en vuelo,
 * sin duplicar rutas y sin conservar trabajos que ya no tienen observadores.
 */
export class PlaylistBpmQueue {
  private readonly cache = new Map<string, Cached>()
  private readonly jobs = new Map<string, Job>()
  private readonly queue: Job[] = []
  private active = 0

  constructor(private readonly load: Loader, private readonly now = () => Date.now()) {}

  read(path: string): TempoDeLista | null {
    const cached = this.cache.get(path)
    if (!cached) return null
    if (cached.expiresAt <= this.now()) { this.cache.delete(path); return null }
    return cached.tempo
  }

  subscribe(paths: readonly string[], listener: () => void): () => void {
    const unique = [...new Set(paths.filter(Boolean))]
    let cached = false
    for (const path of unique) {
      const found = this.cache.get(path)
      if (found && found.expiresAt > this.now()) { cached = true; continue }
      if (found) this.cache.delete(path)
      let job = this.jobs.get(path)
      if (!job || job.controller.signal.aborted) {
        job = { path, controller: new AbortController(), listeners: new Set() }
        this.jobs.set(path, job)
        this.queue.push(job)
      }
      job.listeners.add(listener)
    }
    this.pump()
    let live = true
    if (cached) queueMicrotask(() => { if (live) listener() })
    return () => {
      live = false
      for (const path of unique) {
        const job = this.jobs.get(path)
        if (!job) continue
        job.listeners.delete(listener)
        if (!job.listeners.size) {
          job.controller.abort()
          if (this.jobs.get(path) === job) this.jobs.delete(path)
        }
      }
    }
  }

  private save(path: string, tempo: TempoDeLista | null, ttl: number) {
    this.cache.delete(path)
    this.cache.set(path, { tempo, expiresAt: this.now() + ttl })
    if (this.cache.size > MAX_CACHE_ITEMS) this.cache.delete(this.cache.keys().next().value!)
  }

  private pump() {
    while (this.active < 2 && this.queue.length) {
      const job = this.queue.shift()!
      if (this.jobs.get(job.path) !== job || !job.listeners.size || job.controller.signal.aborted) continue
      this.active++
      void this.run(job)
    }
  }

  private async run(job: Job) {
    try {
      const analysis = await this.load(job.path, job.controller.signal)
      if (this.jobs.get(job.path) === job && !job.controller.signal.aborted) {
        this.save(job.path, tempoDeLista(analysis), SUCCESS_TTL_MS)
      }
    } catch {
      if (this.jobs.get(job.path) === job && !job.controller.signal.aborted) {
        this.save(job.path, null, ERROR_TTL_MS)
      }
    } finally {
      if (this.jobs.get(job.path) === job) {
        this.jobs.delete(job.path)
        for (const notify of job.listeners) { try { notify() } catch { /* Otro observador sigue recibiendo. */ } }
      }
      this.active--
      this.pump()
    }
  }
}
