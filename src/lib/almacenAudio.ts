import { Platform } from 'react-native'
import type { Directory, DownloadPauseState, DownloadTask, File } from 'expo-file-system'
import { excluirDeCopias } from '../../modules/backup-exclusion'

export const RESERVA_AUDIO = 300 * 1024 * 1024
export type AudioLocal = { key: string; uri: string; bytes: number }
export type ProgresoAudio = { bytesWritten: number; totalBytes: number }
export type UsoTransferenciaAudio = 'descarga' | 'reproduccion'
export type PausaAudio = DownloadPauseState
export type TransferenciaAudio = {
  resultado: Promise<AudioLocal | null>
  pausar: () => Promise<PausaAudio | null>
  cancelar: () => void
}
export type PuenteAudioOffline = {
  listar: () => Promise<AudioLocal[]>
  descargar: (datos: { key: string; url: string }) => Promise<AudioLocal>
  cancelar: (key: string) => void | Promise<void>
  quitar: (key: string) => void | Promise<void>
  alProgreso: (fn: (p: ProgresoAudio & { key: string }) => void) => () => void
}
export function puenteAudio() {
  return (globalThis as { dnmusicEscritorio?: { audioOffline?: PuenteAudioOffline } }).dnmusicEscritorio?.audioOffline
}
type FS = typeof import('expo-file-system')
type Red = typeof import('expo-network')
let archivos: FS | null = null
let red: Red | null = null
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    archivos = require('expo-file-system') as FS
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    red = require('expo-network') as Red
  } catch { archivos = null; red = null }
}
export const hayAlmacenAudio = Boolean(puenteAudio() || (archivos && red))
export const escritorioAudio = Boolean(puenteAudio())
let dir: Directory | null = null
function carpeta() {
  if (!archivos) throw new Error('Este dispositivo no permite guardar audio.')
  if (!dir) {
    dir = new archivos.Directory(archivos.Paths.document, 'descargas')
    dir.create({ intermediates: true, idempotent: true })
    excluirDeCopias(dir.uri)
  }
  return dir
}
function archivo(nombre: string): File {
  if (!archivos) throw new Error('No hay almacenamiento local.')
  return new archivos.File(carpeta(), nombre)
}
function seguroV1(key: string) { return key.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+$/, '_') }
function nombre(key: string) { return `audio-${encodeURIComponent(key)}` }
export function espacioLibreAudio(): number | null {
  // Escritorio aplica la reserva en el proceso que escribe el archivo.
  if (!archivos) return null
  const libre = archivos.Paths.availableDiskSpace
  return Number.isFinite(libre) && libre >= 0 ? libre : 0
}
export async function listarAudio(): Promise<AudioLocal[]> {
  const puente = puenteAudio()
  if (puente) return puente.listar()
  if (!archivos) return []
  const items: AudioLocal[] = []
  for (const f of carpeta().list()) {
    if (!(f instanceof archivos.File) || !f.name.startsWith('audio-') || f.size <= 0) continue
    try { items.push({ key: decodeURIComponent(f.name.slice(6)), uri: f.uri, bytes: f.size }) } catch { /* Nombre ajeno al índice. */ }
  }
  return items
}
export function audioV1(key: string): AudioLocal | null {
  if (!archivos) return null
  const f = archivo(seguroV1(key))
  return f.exists && f.size > 0 ? { key, uri: f.uri, bytes: f.size } : null
}
export function arteGuardado(path: string): string | null {
  if (!archivos) return null
  const f = archivo(`arte-${seguroV1(path)}`)
  return f.exists && f.size > 0 ? f.uri : null
}
export async function guardarArte(path: string, url: string): Promise<string | null> {
  if (!archivos) return null
  const f = archivo(`arte-${seguroV1(path)}`)
  try {
    await archivos.File.downloadFileAsync(url, f, { idempotent: true })
    return f.exists && f.size > 0 ? f.uri : null
  } catch { return null }
}
export async function quitarAudio(key: string) {
  const puente = puenteAudio()
  if (puente) { await puente.quitar(key); return }
  if (!archivos) return
  for (const f of [archivo(nombre(key)), archivo(seguroV1(key))]) if (f.exists) f.delete()
}
export async function limpiarParciales(pausas: PausaAudio[]) {
  if (!archivos) return
  const conservar = new Set(pausas.map(p => p.fileUri))
  for (const f of carpeta().list()) {
    if (f instanceof archivos.File && f.name.startsWith('parcial-') && !conservar.has(f.uri)) {
      try { f.delete() } catch { /* Se vuelve a intentar al reiniciar. */ }
    }
  }
}

function pausaValida(pausa: PausaAudio) {
  const base = carpeta().uri.replace(/\/$/, '') + '/'
  return !pausa.isDirectory && pausa.fileUri.startsWith(base) && /^parcial-[A-Za-z0-9.-]+$/.test(pausa.fileUri.slice(base.length))
}
export async function quitarPausa(pausa?: PausaAudio) {
  if (!archivos || !pausa || !pausaValida(pausa)) return
  const f = new archivos.File(pausa.fileUri)
  if (f.exists) f.delete()
}

/** Un archivo sólo aparece en listarAudio después del movimiento final. */
export function transferirAudio(key: string, url: string, onProgress: (p: ProgresoAudio) => void, pausa?: PausaAudio, uso: UsoTransferenciaAudio = 'descarga'): TransferenciaAudio {
  const puente = puenteAudio()
  if (puente) {
    const off = puente.alProgreso(p => { if (p.key === key) onProgress(p) })
    let cancelada = false
    const resultado = Promise.resolve().then(() => cancelada ? null : puente.descargar({ key, url })).finally(off)
    const cancelar = () => { cancelada = true; void Promise.resolve(puente.cancelar(key)).catch(() => {}) }
    return { resultado, cancelar, pausar: async () => { cancelar(); return null } }
  }
  if (!archivos) throw new Error('No hay almacenamiento local.')
  const fs = archivos
  const final = archivo(nombre(key))
  // iOS ignora la URL nueva al usar resumeData: la petición original está embebida en ese blob.
  const restaurable = pausa?.resumeData && pausaValida(pausa) && (Platform.OS !== 'ios' || pausa.url === url)
  if (pausa && !restaurable && pausaValida(pausa)) {
    const anterior = new fs.File(pausa.fileUri)
    if (anterior.exists) anterior.delete()
  }
  const destino = restaurable ? new fs.File(pausa.fileUri) : archivo(`parcial-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  // Las sesiones background pueden ser diferidas por iOS cuando el siguiente
  // tema se solicita con la pantalla bloqueada. La precarga forma parte de la
  // reproducción activa: usa la sesión normal mientras el audio mantiene la app.
  // Las descargas offline siguen en la sesión que sobrevive a la suspensión.
  const sessionType = Platform.OS === 'ios' && uso === 'reproduccion' ? 'foreground' : 'background'
  const options = { sessionType, onProgress } as const
  let task: DownloadTask
  if (restaurable) task = fs.DownloadTask.fromSavable({ ...pausa, url }, options)
  else task = fs.File.createDownloadTask(url, destino, options)
  const resultado = (restaurable ? task.resumeAsync() : task.downloadAsync()).then(f => {
    if (!f) return null
    if (!destino.exists || destino.size <= 0) throw new Error('La descarga quedó incompleta.')
    const bytes = destino.size
    if (fs.Paths.availableDiskSpace < RESERVA_AUDIO) throw new Error('No queda espacio libre suficiente.')
    if (final.exists) final.delete()
    destino.move(final)
    return { key, uri: final.uri, bytes }
  }).finally(() => {
    if (task.state !== 'paused') {
      try { if (destino.exists && destino.uri !== final.uri) destino.delete() } catch { /* Limpieza al reiniciar. */ }
    }
    task.release()
  })
  return {
    resultado,
    cancelar: () => task.cancel(),
    pausar: async () => {
      if (task.state !== 'active') return null
      await task.pauseAsync()
      return (task as DownloadTask).state === 'paused' ? task.savable() : null
    },
  }
}

export type EstadoRedAudio = { conectada: boolean; segura: boolean }
export async function estadoRedAudio(): Promise<EstadoRedAudio> {
  if (red) {
    try {
      const r = await red.getNetworkStateAsync()
      return { conectada: r.isConnected === true && r.isInternetReachable !== false && r.type !== red.NetworkStateType.NONE,
        segura: r.type === red.NetworkStateType.WIFI || r.type === red.NetworkStateType.ETHERNET }
    } catch { return { conectada: false, segura: false } }
  }
  if (typeof navigator === 'undefined') return { conectada: false, segura: false }
  const c = (navigator as Navigator & { connection?: { type?: string } }).connection
  return { conectada: navigator.onLine === true && c?.type !== 'none',
    // Chromium de escritorio normalmente no expone type. Una red celular conocida sigue bloqueada.
    segura: escritorioAudio ? c?.type !== 'cellular' : c?.type === 'wifi' || c?.type === 'ethernet' }
}
export function escucharRedAudio(fn: () => void) {
  if (red) { const listener = red.addNetworkStateListener(fn); return () => listener.remove() }
  if (typeof window === 'undefined') return () => {}
  const c = (navigator as Navigator & { connection?: EventTarget }).connection
  window.addEventListener('online', fn); window.addEventListener('offline', fn); c?.addEventListener('change', fn)
  return () => { window.removeEventListener('online', fn); window.removeEventListener('offline', fn); c?.removeEventListener('change', fn) }
}
