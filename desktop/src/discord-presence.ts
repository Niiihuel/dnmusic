import { createConnection, type Socket } from 'node:net'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

/** Public metadata only. Position is measured at snapshot creation, updatedAt is freshness. */
export type ListeningActivity = {
  title: string; artist: string; durationMs: number; positionMs: number
  updatedAt: number; expiresAt: number; trackUrl?: string; artworkUrl?: string
}
export type ConfiguracionDiscord = { enabled: boolean; applicationId: string }
export type EstadoDiscord = ConfiguracionDiscord & {
  status: 'disabled' | 'unconfigured' | 'disconnected' | 'connecting' | 'ready' | 'published' | 'error'
  error?: string
}
type Activity = { type: 2; details: string; state: string; timestamps?: { start: number; end: number }; assets?: { large_image: string; large_text: string }; buttons?: { label: string; url: string }[] }
type Timer = ReturnType<typeof setTimeout>
type Dependencies = {
  connect: (path: string) => Socket; paths: string[]; now: () => number
  later: (fn: () => void, delay: number) => Timer; cancel: (timer: Timer) => void
}
const MAX_FRAME = 64 * 1024
const FRESH_MS = 65_000
const UPDATE_MS = 15_000

export function rutasDiscord(platform = process.platform, env = process.env): string[] {
  const prefix = env.XDG_RUNTIME_DIR || env.TMPDIR || env.TMP || env.TEMP || '/tmp'
  return Array.from({ length: 10 }, (_, n) => platform === 'win32' ? `\\\\?\\pipe\\discord-ipc-${n}` : join(prefix, `discord-ipc-${n}`))
}
export function frameDiscord(opcode: number, value: unknown): Buffer {
  const body = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value))
  const result = Buffer.allocUnsafe(8 + body.length)
  result.writeUInt32LE(opcode, 0); result.writeUInt32LE(body.length, 4); body.copy(result, 8)
  return result
}
/** Handles fragmented frames and concatenated frames without allocating unbounded payloads. */
export class FramesDiscord {
  private pending = Buffer.alloc(0)
  push(chunk: Buffer): { opcode: number; body: Buffer }[] {
    if (this.pending.length + chunk.length > MAX_FRAME * 2) throw Error('Trama Discord demasiado grande')
    this.pending = Buffer.concat([this.pending, chunk])
    const result: { opcode: number; body: Buffer }[] = []
    while (this.pending.length >= 8) {
      const size = this.pending.readUInt32LE(4)
      if (size > MAX_FRAME) throw Error('Trama Discord demasiado grande')
      if (this.pending.length < 8 + size) break
      result.push({ opcode: this.pending.readUInt32LE(0), body: this.pending.subarray(8, 8 + size) })
      this.pending = this.pending.subarray(8 + size)
    }
    return result
  }
}
function text(value: unknown): string {
  return typeof value === 'string' ? Array.from(value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()).slice(0, 128).join('') : ''
}
/** Only public HTTPS URLs: no signed media, local paths, credentials or arbitrary query parameters. */
function publicUrl(value: unknown, artwork: boolean): string | undefined {
  if (typeof value !== 'string' || value.length > (artwork ? 300 : 256)) return
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return
    if (artwork) {
      if (url.search) return
      const cdn = ['i.ytimg.com', 'img.youtube.com', 'yt3.googleusercontent.com', 'lh3.googleusercontent.com', 'yt3.ggpht.com', 'lh3.ggpht.com'].includes(url.hostname)
      const storage = url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/storage/v1/object/public/artwork/')
      if (!cdn && !storage) return
    } else if (url.hostname !== 'music.youtube.com' || url.pathname !== '/watch' || !/^\?v=[A-Za-z0-9_-]{11}$/.test(url.search)) return
    return url.href.length <= (artwork ? 300 : 256) ? url.href : undefined
  } catch { return }
}
export function actividadDiscord(input: unknown, now: number): { activity: Activity; expiresAt: number } | null {
  if (!input || typeof input !== 'object') return null
  const source = input as ListeningActivity
  const title = text(source.title), artist = text(source.artist) || 'Artista desconocido'
  if (!title || !artist || !Number.isFinite(source.updatedAt) || !Number.isFinite(source.expiresAt)
    || source.updatedAt > now + 5_000 || source.updatedAt <= now - FRESH_MS || source.expiresAt <= now) return null
  if (!Number.isFinite(source.positionMs) || source.positionMs < 0 || !Number.isFinite(source.durationMs) || source.durationMs < 0) return null
  if (source.durationMs > 0 && source.positionMs >= source.durationMs) return null
  const duration = Math.min(source.durationMs, 24 * 60 * 60 * 1000)
  const position = Math.min(source.positionMs, duration || source.positionMs)
  const details = Array.from(title).length < 2 ? `♪ ${title}` : title
  const state = Array.from(artist).length < 2 ? `♫ ${artist}` : artist
  const activity: Activity = { type: 2, details, state }
  if (duration > position && duration > 0) {
    const start = Math.floor((now - position) / 1000)
    activity.timestamps = { start, end: Math.floor((now - position + duration) / 1000) }
  }
  const artwork = publicUrl(source.artworkUrl, true)
  if (artwork) activity.assets = { large_image: artwork, large_text: details }
  const track = publicUrl(source.trackUrl, false)
  if (track) activity.buttons = [{ label: 'Escuchar canción', url: track }]
  return { activity, expiresAt: Math.min(source.expiresAt, source.updatedAt + FRESH_MS, now + FRESH_MS, duration > 0 ? now + duration - position : Infinity) }
}

/** Local Discord IPC only; no OAuth, network fetch, account identifiers or audio URLs. */
export class DiscordPresence {
  private config: ConfiguracionDiscord = { enabled: false, applicationId: '' }
  private status: EstadoDiscord['status'] = 'disabled'
  private error: string | undefined
  private socket: Socket | null = null
  private generation = 0
  private ready = false
  private mantener = false
  private desired: ReturnType<typeof actividadDiscord> = null
  private expiry?: Timer
  private work?: Timer
  private deadline?: Timer
  private awaiting: string | null = null
  private lastSent = -Infinity
  private sentKey: string | null = null
  private dependencies: Dependencies
  constructor(private changed: (state: EstadoDiscord) => void = () => {}, deps: Partial<Dependencies> = {}) {
    this.dependencies = { connect: path => createConnection(path), paths: rutasDiscord(), now: Date.now,
      later: (fn, delay) => { const timer = setTimeout(fn, delay); timer.unref(); return timer }, cancel: clearTimeout, ...deps }
  }
  estado(): EstadoDiscord { return { ...this.config, status: this.status, ...(this.error ? { error: this.error } : {}) } }
  private setStatus(status: EstadoDiscord['status'], error?: string): void {
    if (status === this.status && error === this.error) return
    this.status = status; this.error = error; this.changed(this.estado())
  }
  configurar(value: unknown): EstadoDiscord {
    if (!value || typeof value !== 'object') throw Error('Configuración Discord inválida')
    const next = value as ConfiguracionDiscord
    if (typeof next.enabled !== 'boolean' || typeof next.applicationId !== 'string'
      || next.applicationId !== '' && !/^[1-9]\d{16,19}$/.test(next.applicationId)) throw Error('Application ID de Discord inválido')
    if (next.enabled === this.config.enabled && next.applicationId === this.config.applicationId) {
      this.mantener = next.enabled
      if (this.permitido() && !this.socket) {
        if (this.work) this.dependencies.cancel(this.work)
        this.work = undefined; this.connect(0)
      }
      return this.estado()
    }
    this.limpiar()
    this.config = { enabled: next.enabled, applicationId: next.applicationId }
    this.setStatus(!next.enabled ? 'disabled' : !next.applicationId ? 'unconfigured' : 'disconnected')
    this.mantener = next.enabled
    if (this.permitido()) this.connect(0)
    this.changed(this.estado())
    return this.estado()
  }
  publicar(input: unknown): EstadoDiscord {
    if (!this.config.enabled || !this.config.applicationId) return this.estado()
    this.desired = actividadDiscord(input, this.dependencies.now())
    if (!this.desired) { this.vaciar(); return this.estado() }
    this.mantener = true
    if (this.expiry) this.dependencies.cancel(this.expiry)
    this.expiry = this.dependencies.later(() => this.vaciar(), Math.max(0, this.desired.expiresAt - this.dependencies.now()))
    if (this.ready) this.flush()
    else if (!this.socket && !this.work) this.connect(0)
    return this.estado()
  }
  /** Clear music immediately while retaining the explicitly enabled connection. */
  private vaciar(): void {
    this.desired = null
    if (this.expiry) this.dependencies.cancel(this.expiry)
    this.expiry = undefined
    if (this.ready) this.flush()
  }
  /** Used for opt-out, logout, navigation, renderer crash and application shutdown. */
  limpiar(): void {
    this.mantener = false
    this.desired = null
    if (this.expiry) this.dependencies.cancel(this.expiry)
    this.expiry = undefined
    this.close(true)
    this.setStatus(!this.config.enabled ? 'disabled' : !this.config.applicationId ? 'unconfigured' : 'disconnected')
  }
  private close(clear = false): void {
    ++this.generation
    for (const timer of [this.work, this.deadline]) if (timer) this.dependencies.cancel(timer)
    this.work = this.deadline = undefined
    const socket = this.socket, wasReady = this.ready
    this.socket = null; this.ready = false; this.awaiting = null; this.sentKey = null; this.lastSent = -Infinity
    if (socket && !socket.destroyed) {
      if (clear && wasReady && socket.writable) {
        socket.end(frameDiscord(1, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: null }, nonce: randomUUID() }))
        socket.destroySoon()
        // A stuck pipe must not retain resources after opt-out. Unref'd and bounded.
        this.dependencies.later(() => socket.destroy(), 1000)
      } else socket.destroy()
    }
  }
  private permitido(): boolean { return this.mantener && this.config.enabled && !!this.config.applicationId }
  private fresh(): boolean { return !!this.desired && this.desired.expiresAt > this.dependencies.now() }
  private reconnect(error?: string): void {
    this.close()
    this.setStatus(error ? 'error' : 'disconnected', error)
    if (this.permitido()) this.work = this.dependencies.later(() => { this.work = undefined; if (this.permitido()) this.connect(0) }, UPDATE_MS)
  }
  private connect(index: number): void {
    if (!this.permitido()) return
    if (index >= this.dependencies.paths.length) { this.reconnect(); return }
    this.setStatus('connecting')
    const version = ++this.generation
    let socket: Socket
    try { socket = this.dependencies.connect(this.dependencies.paths[index]) }
    catch { this.connect(index + 1); return }
    this.socket = socket
    const parser = new FramesDiscord()
    const active = () => this.generation === version && this.socket === socket
    const next = () => {
      if (!active()) return
      const connected = this.ready
      this.close()
      if (connected) this.reconnect()
      else this.connect(index + 1)
    }
    this.deadline = this.dependencies.later(next, 2500)
    socket.on('connect', () => {
      if (active()) socket.write(frameDiscord(0, { v: 1, client_id: this.config.applicationId }))
    })
    socket.on('error', next)
    socket.on('close', next)
    socket.on('data', (chunk: Buffer) => {
      if (!active()) return
      try {
        for (const frame of parser.push(chunk)) {
          if (!active()) break
          if (frame.opcode === 3) { socket.write(frameDiscord(4, frame.body)); continue }
          if (frame.opcode === 2) { this.reconnect('Discord cerró la conexión.'); break }
          if (frame.opcode !== 1) continue
          const data = JSON.parse(frame.body.toString('utf8'))
          if (!data || typeof data !== 'object') throw Error('Respuesta inválida')
          if (data.evt === 'READY' && data.cmd === 'DISPATCH' && !this.ready) {
            if (this.deadline) this.dependencies.cancel(this.deadline)
            this.deadline = undefined; this.ready = true; this.setStatus('ready'); this.flush()
          } else if (data.evt === 'ERROR' && (!data.nonce || data.nonce === this.awaiting)) {
            this.reconnect('Discord rechazó la conexión o la actividad. Volvé a abrir Discord e intentá nuevamente.')
          } else if (data.cmd === 'SET_ACTIVITY' && this.awaiting && data.nonce === this.awaiting) {
            if (this.deadline) this.dependencies.cancel(this.deadline)
            this.deadline = undefined; this.awaiting = null
            this.setStatus(this.sentKey !== 'null' && this.fresh() ? 'published' : 'ready')
            this.flush()
          }
        }
      } catch { this.reconnect('Discord envió una respuesta inválida.') }
    })
  }
  private flush(): void {
    if (!this.ready || !this.socket) return
    const activity = this.fresh() ? this.desired!.activity : null
    const key = JSON.stringify(activity)
    // An idle handshake confirms connection without inventing an activity.
    if (key === this.sentKey || (!activity && this.sentKey === null)) return
    if (activity && this.awaiting) return
    const wait = activity && this.sentKey !== 'null' ? UPDATE_MS - (this.dependencies.now() - this.lastSent) : 0
    if (wait > 0) {
      if (!this.work) this.work = this.dependencies.later(() => { this.work = undefined; this.flush() }, wait)
      return
    }
    // Pause supersedes any pending activity ACK and bypasses the update throttle.
    if (this.work) this.dependencies.cancel(this.work)
    if (this.deadline) this.dependencies.cancel(this.deadline)
    this.work = undefined
    this.awaiting = randomUUID(); this.lastSent = this.dependencies.now(); this.sentKey = key
    this.deadline = this.dependencies.later(() => this.reconnect('Discord no confirmó la actividad.'), 10_000)
    this.socket.write(frameDiscord(1, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity }, nonce: this.awaiting }))
  }
}
