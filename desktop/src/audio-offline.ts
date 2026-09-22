import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { mkdir, readdir, readFile, lstat, open, rename, rm, statfs } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { esOrigenNubePermitido } from './audio-offline-origen'

export type AudioOffline = { key: string; uri: string; bytes: number }
export type ProgresoAudioOffline = { key: string; bytesWritten: number; totalBytes: number }
type Registro = { key: string; bytes: number; extension: string; mime: string }
const TIPOS: Record<string, string> = {
  'audio/mp4': 'm4a', 'video/mp4': 'm4a', 'audio/x-m4a': 'm4a',
  'audio/webm': 'webm', 'video/webm': 'webm', 'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg', 'application/ogg': 'ogg', 'audio/flac': 'flac',
  'audio/wav': 'wav', 'audio/x-wav': 'wav',
}
const EXTENSIONES = new Set(Object.values(TIPOS))
const RESERVA = 300 * 1024 * 1024
const PATRON = /^[a-f0-9]{64}\.(m4a|webm|mp3|ogg|flac|wav)$/
const hash = (key: string) => createHash('sha256').update(key).digest('hex')
function validarKey(key: unknown): asserts key is string {
  if (typeof key !== 'string' || !key || Buffer.byteLength(key) > 4096 || key.includes('\0')) throw Error('Clave de audio inválida')
}

/** El origen viene de configuración de main, nunca del argumento IPC. */
export function validarUrlAudio(url: string, key: string, origen: string | null, desarrollo = false): URL {
  validarKey(key)
  if (!origen || typeof url !== 'string' || url.length > 32768) throw Error('Origen de audio no configurado')
  const u = new URL(url), base = new URL(origen)
  const nube = esOrigenNubePermitido(base)
  const local = desarrollo && base.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(base.hostname) && !!base.port
  if ((!nube && !local) || u.origin !== base.origin || u.username || u.password || u.hash || base.username || base.password) throw Error('Origen de audio no permitido')
  const prefix = '/storage/v1/object/sign/songs/'
  if (!u.pathname.startsWith(prefix) || decodeURIComponent(u.pathname.slice(prefix.length)) !== key || !u.searchParams.get('token')) throw Error('Se requiere la URL firmada de este audio')
  return u
}

type Opciones = {
  origen: string | null
  desarrollo?: boolean
  fetch?: typeof fetch
  espacioLibre?: () => Promise<number | null>
  timeoutMs?: number
}
type Trabajo = { controller: AbortController; promise: Promise<AudioOffline | void>; borrando?: boolean }

/** Sólo almacena identidad/tamaño del archivo: la cola y metadatos de música siguen en renderer. */
export class DiscoAudioOffline {
  private readonly lista = new Map<string, Registro>()
  private readonly trabajos = new Map<string, Trabajo>()
  private cola: Promise<unknown> = Promise.resolve()
  private readonly listo: Promise<void>
  constructor(private readonly carpeta: string, private readonly opciones: Opciones) {
    this.listo = this.iniciar()
    // Registrar el rechazo aun si el renderer tarda en pedir su primera operación.
    void this.listo.catch(() => {})
  }
  private archivo(r: Registro): string { return `${hash(r.key)}.${r.extension}` }
  private resultado(r: Registro): AudioOffline { return { key: r.key, uri: `app://dnmusic/_audio/${this.archivo(r)}`, bytes: r.bytes } }
  private async iniciar(): Promise<void> {
    await mkdir(this.carpeta, { recursive: true, mode: 0o700 })
    const dir = await lstat(this.carpeta)
    if (!dir.isDirectory() || dir.isSymbolicLink()) throw Error('Carpeta offline inválida')
    const entries = await readdir(this.carpeta)
    for (const name of entries) if (/^[a-f0-9]{64}\.[a-z0-9]+\.part$/.test(name)) await rm(join(this.carpeta, name), { force: true })
    for (const name of entries) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue
      try {
        const file = join(this.carpeta, name), info = await lstat(file)
        if (!info.isFile() || info.isSymbolicLink() || info.size > 16384) continue
        const r: Registro = JSON.parse(await readFile(file, 'utf8'))
        validarKey(r.key)
        if (name !== `${hash(r.key)}.json` || !EXTENSIONES.has(r.extension) || TIPOS[r.mime] !== r.extension || !Number.isSafeInteger(r.bytes) || r.bytes <= 0) continue
        if (await this.verificado(r)) this.lista.set(r.key, r)
      } catch { /* Un par incompleto/corrupto no es una descarga disponible. */ }
    }
    const completos = new Set([...this.lista.values()].map(r => this.archivo(r)))
    for (const name of entries) if (PATRON.test(name) && !completos.has(name)) await rm(join(this.carpeta, name), { force: true })
  }
  private async verificado(r: Registro): Promise<boolean> {
    try {
      const info = await lstat(join(this.carpeta, this.archivo(r)))
      return info.isFile() && !info.isSymbolicLink() && info.size === r.bytes
    } catch { return false }
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.cola.then(async () => { await this.listo; return fn() })
    this.cola = p.catch(() => {})
    return p
  }
  async listar(): Promise<AudioOffline[]> {
    await this.listo
    const result: AudioOffline[] = []
    for (const r of this.lista.values()) {
      if (await this.verificado(r)) result.push(this.resultado(r))
      else this.lista.delete(r.key)
    }
    return result
  }
  descargar(pedido: { key: string; url: string }, progreso: (p: ProgresoAudioOffline) => void = () => {}): Promise<AudioOffline> {
    validarKey(pedido?.key)
    const { key, url } = pedido
    validarUrlAudio(url, key, this.opciones.origen, this.opciones.desarrollo)
    const anterior = this.trabajos.get(key)
    if (anterior) return anterior.borrando
      ? anterior.promise.then(() => this.descargar(pedido, progreso))
      : anterior.promise as Promise<AudioOffline>
    const controller = new AbortController()
    const trabajo: Trabajo = { controller, promise: Promise.resolve() }
    trabajo.promise = this.serial(async () => {
      controller.signal.throwIfAborted()
      const existente = this.lista.get(key)
      if (existente && await this.verificado(existente)) return this.resultado(existente)
      this.lista.delete(key)
      return this.bajar(key, url, controller, progreso)
    }).finally(() => { if (this.trabajos.get(key) === trabajo) this.trabajos.delete(key) })
    this.trabajos.set(key, trabajo)
    return trabajo.promise as Promise<AudioOffline>
  }
  async cancelar(key: string): Promise<void> {
    validarKey(key)
    const trabajo = this.trabajos.get(key)
    if (!trabajo) return
    trabajo.controller.abort(Error('Descarga cancelada'))
    await trabajo.promise.catch(() => {})
  }
  quitar(key: string): Promise<void> {
    validarKey(key)
    const previo = this.trabajos.get(key)
    if (previo?.borrando) return previo.promise as Promise<void>
    previo?.controller.abort(Error('Descarga eliminada'))
    const trabajo: Trabajo = { controller: new AbortController(), promise: Promise.resolve(), borrando: true }
    trabajo.promise = this.serial(async () => {
      this.lista.delete(key)
      // Primero retirar el marcador de commit; un reinicio nunca publica un archivo a medio borrar.
      await rm(join(this.carpeta, `${hash(key)}.json`), { force: true })
      for (const ext of EXTENSIONES) await rm(join(this.carpeta, `${hash(key)}.${ext}`), { force: true })
    }).finally(() => { if (this.trabajos.get(key) === trabajo) this.trabajos.delete(key) })
    this.trabajos.set(key, trabajo)
    return trabajo.promise as Promise<void>
  }
  private async espacio(bytes: number): Promise<void> {
    let libre: number | null
    if (this.opciones.espacioLibre) libre = await this.opciones.espacioLibre()
    else {
      try { const s = await statfs(this.carpeta); libre = s.bavail * s.bsize }
      catch (error) {
        if (!['ENOSYS', 'ENOTSUP', 'EOPNOTSUPP'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
        libre = null
      }
    }
    if (libre !== null && libre - bytes < RESERVA) throw Error('Espacio insuficiente: se reservan 300 MB libres')
  }
  private async bajar(key: string, url: string, controller: AbortController, progreso: (p: ProgresoAudioOffline) => void): Promise<AudioOffline> {
    const { signal } = controller
    let timer: ReturnType<typeof setTimeout>
    const renovar = () => { clearTimeout(timer); timer = setTimeout(() => controller.abort(Error('Tiempo de descarga agotado')), this.opciones.timeoutMs ?? 45000) }
    const meta = join(this.carpeta, `${hash(key)}.json`), metaPart = `${meta}.part`
    let temporal = '', final = '', committed = false
    renovar()
    try {
      await this.espacio(1)
      const res = await (this.opciones.fetch ?? fetch)(url, { signal, redirect: 'error', credentials: 'omit', headers: { 'Accept-Encoding': 'identity' } })
      if (res.status !== 200 || !res.body) throw Error(`Descarga de audio fallida (${res.status})`)
      let mime = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
      if (mime === 'application/octet-stream') {
        const ext = key.split('.').pop()?.toLowerCase()
        mime = Object.keys(TIPOS).find(t => TIPOS[t] === ext) ?? ''
      }
      const extension = Object.hasOwn(TIPOS, mime) ? TIPOS[mime] : undefined
      if (!extension) { await res.body.cancel(); throw Error('Formato de audio no admitido') }
      const length = res.headers.get('content-length')
      const totalBytes = length === null ? 0 : /^\d+$/.test(length) ? Number(length) : NaN
      if (!Number.isSafeInteger(totalBytes)) throw Error('Tamaño de audio inválido')
      await this.espacio(totalBytes)
      final = join(this.carpeta, `${hash(key)}.${extension}`)
      temporal = `${final}.part`
      const file = await open(temporal, 'wx', 0o600)
      const reader = res.body.getReader()
      const abort = () => { void reader.cancel(signal.reason).catch(() => {}) }
      signal.addEventListener('abort', abort, { once: true })
      let bytes = 0, ultimo = 0
      try {
        while (true) {
          signal.throwIfAborted()
          const chunk = await reader.read()
          signal.throwIfAborted()
          if (chunk.done) break
          renovar()
          await this.espacio(chunk.value.byteLength)
          let offset = 0
          while (offset < chunk.value.byteLength) {
            const { bytesWritten } = await file.write(chunk.value, offset, chunk.value.byteLength - offset)
            if (!bytesWritten) throw Error('No se pudo escribir el audio')
            offset += bytesWritten
          }
          bytes += chunk.value.byteLength
          if (length !== null && bytes > totalBytes) throw Error('Tamaño de audio inconsistente')
          if (Date.now() - ultimo >= 150) { progreso({ key, bytesWritten: bytes, totalBytes }); ultimo = Date.now() }
        }
        if (!bytes || (length !== null && bytes !== totalBytes)) throw Error('Audio incompleto')
        await file.sync()
      } finally {
        signal.removeEventListener('abort', abort)
        await reader.cancel().catch(() => {})
        reader.releaseLock()
        await file.close()
      }
      signal.throwIfAborted()
      const r: Registro = { key, bytes, extension, mime }
      const descriptor = await open(metaPart, 'wx', 0o600)
      try { await descriptor.writeFile(JSON.stringify(r)); await descriptor.sync() } finally { await descriptor.close() }
      signal.throwIfAborted()
      await rename(temporal, final)
      signal.throwIfAborted()
      await rename(metaPart, meta)
      committed = true
      this.lista.set(key, r)
      progreso({ key, bytesWritten: bytes, totalBytes: totalBytes || bytes })
      return this.resultado(r)
    } finally {
      clearTimeout(timer!)
      controller.abort()
      await rm(metaPart, { force: true })
      if (temporal) await rm(temporal, { force: true })
      if (!committed && final) await rm(final, { force: true })
    }
  }
  /** Ruta cerrada: sólo hashes de archivos verificados; Range nunca toca el bundle/otros archivos. */
  async servir(request: Request): Promise<Response> {
    await this.listo
    const url = new URL(request.url), name = url.pathname.slice('/_audio/'.length)
    if (url.protocol !== 'app:' || url.hostname !== 'dnmusic' || url.port || url.username || url.password || !url.pathname.startsWith('/_audio/') || !PATRON.test(name)) return new Response(null, { status: 404 })
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } })
    const r = [...this.lista.values()].find(r => this.archivo(r) === name)
    if (!r) return new Response(null, { status: 404 })
    let file
    try {
      const path = join(this.carpeta, name)
      if ((await lstat(path)).isSymbolicLink()) return new Response(null, { status: 404 })
      file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    }
    catch { return new Response(null, { status: 404 }) }
    const info = await file.stat()
    if (!info.isFile() || info.size !== r.bytes) { await file.close(); return new Response(null, { status: 404 }) }
    const headers = new Headers({ 'content-type': r.mime, 'accept-ranges': 'bytes', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
    const range = request.headers.get('range')
    let start = 0, end = r.bytes - 1
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (m && (m[1] || m[2]) && (!m[1] || Number.isSafeInteger(Number(m[1]))) && (!m[2] || Number.isSafeInteger(Number(m[2])))) {
        if (m[1]) { start = Number(m[1]); if (m[2]) end = Math.min(end, Number(m[2])) }
        else start = Math.max(0, r.bytes - Number(m[2]))
      } else start = r.bytes
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= r.bytes) {
        await file.close(); headers.set('content-range', `bytes */${r.bytes}`)
        return new Response(null, { status: 416, headers })
      }
      headers.set('content-range', `bytes ${start}-${end}/${r.bytes}`)
    }
    headers.set('content-length', String(end - start + 1))
    if (request.method === 'HEAD') { await file.close(); return new Response(null, { status: range ? 206 : 200, headers }) }
    const stream = file.createReadStream({ start, end, autoClose: true })
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { status: range ? 206 : 200, headers })
  }
}
