import AsyncStorage from '@react-native-async-storage/async-storage'
import { artworkRemoto, registerArteLocal } from '../lib/artwork'
import { mensajeError } from '../lib/mensajeError'
import { clasificarRedPrecarga } from '../lib/politicaPrecarga'
import {
  audioV1, arteGuardado, escritorioAudio, escucharRedAudio, espacioLibreAudio, estadoRedAudio,
  guardarArte, hayAlmacenAudio, limpiarParciales, listarAudio, quitarAudio, quitarPausa, RESERVA_AUDIO,
  transferirAudio, type PausaAudio, type TransferenciaAudio, type UsoTransferenciaAudio,
} from '../lib/almacenAudio'
import { resolveSong, signedUrl } from '../services/music'
import type { PlaylistTrack } from '../services/playlists'
import { leerAjustes } from './ajustes'
import { createStore, useStore } from './store'

export const HAY_DESCARGAS = hayAlmacenAudio
const CLAVE = 'descargas:v2'
const MB = 1024 * 1024
const ESTIMADO = 8 * MB
const MAX_INTENTOS = 3
export type EstadoDescarga = 'espera' | 'preparando' | 'bajando' | 'pausada' | 'error' | 'lista'
export type Descarga = {
  audioPath: string; artworkPath: string | null; videoId: string; title: string; artist: string
  estado: EstadoDescarga; progreso: number; bytes: number; arte: boolean
  temporal: boolean; ultimoUso: number; error: string | null; intentos: number
  uri?: string; arteUri?: string; quitarAlLiberar?: boolean; pausa?: PausaAudio; proximoIntento?: number; track?: PlaylistTrack
}
type Estado = {
  items: Record<string, Descarga>; cola: string[]; cargado: boolean
  esperandoWifi: boolean; esperandoRed: boolean; limiteCacheMB: number; error: string | null
}
const store = createStore<Estado>({ items: {}, cola: [], cargado: false, esperandoWifi: false, esperandoRed: false, limiteCacheMB: escritorioAudio ? 1024 : 250, error: null })
const protecciones = new Map<string | symbol, Set<string>>()
const protegidos = new Set<string>()
let carga: Promise<void> | null = null
let escritura = Promise.resolve()
let mantenimiento = Promise.resolve()
let corriendo = false
let reproduccionOcupada = false
let despertar: ReturnType<typeof setTimeout> | null = null
let activo: Trabajo | null = null
let limiteModificado = false
const consumidores = new Map<string, number>()
const cacheExplicita = new Set<string>()

type Trabajo = { key: string; controller: AbortController; transferencia?: TransferenciaAudio; uso?: UsoTransferenciaAudio; detener?: 'pausa' | 'cancelar' | 'prioridad' | 'red'; detenido?: Promise<void> }
function escribir(items = store.get().items) {
  const s = store.get()
  const texto = JSON.stringify({ version: 2, items, cola: s.cola, limiteCacheMB: s.limiteCacheMB })
  const resultado = escritura.catch(() => {}).then(() => AsyncStorage.setItem(CLAVE, texto))
  escritura = resultado
  return resultado
}
function persistir() { void escribir().catch(e => store.set({ error: `No se pudo guardar la cola: ${mensajeError(e)}` })) }
function poner(key: string, cambios: Partial<Descarga>, guardar = true) {
  const items = store.get().items
  if (!items[key]) return
  store.set({ items: { ...items, [key]: { ...items[key], ...cambios } } })
  if (guardar) persistir()
}
function sacar(key: string) {
  cacheExplicita.delete(key)
  const items = { ...store.get().items }; delete items[key]
  store.set({ items, cola: store.get().cola.filter(k => k !== key) }); persistir()
}
function buscar(key: string) {
  const items = store.get().items
  return items[key] ? key : Object.keys(items).find(k => items[k].audioPath === key || `video:${items[k].videoId}` === key)
}
export function claveDescarga(track: Pick<PlaylistTrack, 'audioPath' | 'videoId'>) { return track.audioPath || `video:${track.videoId}` }
function protegida(d: Descarga) { return protegidos.has(d.audioPath) || protegidos.has(`video:${d.videoId}`) }
function vigente(t: Trabajo) { return activo === t && !t.detener && Boolean(store.get().items[t.key]) }
function programar(ms: number) {
  if (despertar) clearTimeout(despertar)
  despertar = setTimeout(() => { despertar = null; impulsar() }, Math.max(10, ms))
}
function impulsar() { void arrancar().catch(e => store.set({ error: mensajeError(e) })) }
function luego(fn: () => void | Promise<void>) {
  void cargarDescargas().then(() => { if (store.get().cargado) return fn() }).catch(e => store.set({ error: mensajeError(e) }))
}

/** Una sola inicialización; las acciones esperan su reconciliación antes de modificar el índice. */
export function cargarDescargas(): Promise<void> {
  if (carga) return carga
  carga = inicializar().catch(() => { carga = null })
  return carga
}
async function inicializar() {
  if (!HAY_DESCARGAS) { store.set({ cargado: true }); return }
  registerArteLocal(path => Object.values(store.get().items).find(d => d.estado === 'lista' && d.artworkPath === path && d.arteUri)?.arteUri ?? null)
  try {
    const raw = await AsyncStorage.getItem(CLAVE)
    const legacy = raw ? null : await AsyncStorage.getItem('descargas:v1')
    const data = raw ? JSON.parse(raw) : null
    const anteriores: Record<string, Descarga> = data?.version === 2 && data.items && typeof data.items === 'object' ? data.items : {}
    if (legacy) for (const d of JSON.parse(legacy)) if (d?.audioPath) anteriores[d.audioPath] = { ...d, temporal: false, ultimoUso: Date.now(), error: null, intentos: 0 }
    const archivos = new Map((await listarAudio()).filter(f => f.bytes > 0).map(f => [f.key, f]))
    const items: Record<string, Descarga> = {}
    for (const [key, d] of Object.entries(anteriores)) {
      if (!d || typeof d.audioPath !== 'string' || typeof d.videoId !== 'string') continue
      const f = archivos.get(d.audioPath) ?? (d.audioPath ? audioV1(d.audioPath) : null)
      const arteUri = d.artworkPath ? arteGuardado(d.artworkPath) : null
      const estado: EstadoDescarga = f ? 'lista' : d.estado === 'pausada' || d.estado === 'error' ? d.estado : 'espera'
      items[key] = { ...d, temporal: d.temporal === true, ultimoUso: Number(d.ultimoUso) || Date.now(), intentos: Number(d.intentos) || 0,
        estado, progreso: f ? 1 : 0, bytes: f?.bytes ?? 0, uri: f?.uri, arte: Boolean(arteUri), arteUri: arteUri ?? undefined,
        pausa: f ? undefined : d.pausa, error: f ? null : d.error ?? null }
    }
    const orden: string[] = Array.isArray(data?.cola) ? data.cola.filter((k: unknown): k is string => typeof k === 'string' && Boolean(items[k])) : []
    const cola = [...new Set([...orden, ...Object.keys(items)])].filter(k => items[k].estado !== 'lista')
    const limite = Number(data?.limiteCacheMB)
    store.set({ items, cola, ...(!limiteModificado && Number.isFinite(limite) && limite >= 0 ? { limiteCacheMB: limite } : {}), cargado: true, error: null })
    await limpiarParciales(Object.values(items).flatMap(d => d.pausa ? [d.pausa] : []))
    await escribir()
  } catch (e) {
    // Una lectura fallida no autoriza a borrar archivos ni sobrescribir su catálogo.
    store.set({ cargado: false, error: `No se pudo recuperar las descargas: ${mensajeError(e)}` })
    carga = null
    throw e
  }
  escucharRedAudio(() => {
    void redPermitida(activo ? store.get().items[activo.key]?.temporal : false).then(ok => { if (!ok) detenerActivo('red'); else impulsar() }).catch(() => {})
  })
  impulsar()
}

export function rutaLocal(audioPath: string): string | null {
  const key = buscar(audioPath)
  const d = key ? store.get().items[key] : null
  if (!d || d.estado !== 'lista' || !d.uri) return null
  return d.uri
}
/** Sólo desde un efecto de reproducción; rutaLocal también se consulta durante render. */
export function marcarAudioUsado(audioPath: string) {
  const key = buscar(audioPath), d = key ? store.get().items[key] : null
  if (key && d?.estado === 'lista' && Date.now() - d.ultimoUso > 30_000) poner(key, { ultimoUso: Date.now() })
}
export function espacioUsado(items: Record<string, Descarga>) { return Object.values(items).reduce((s, d) => s + d.bytes, 0) }
export function cuantasListas(items: Record<string, Descarga>) { return Object.values(items).filter(d => d.estado === 'lista').length }
export function cuantasPendientes(items: Record<string, Descarga>) { return Object.values(items).filter(d => d.estado !== 'lista').length }
export function resumenLista(tracks: PlaylistTrack[], items: Record<string, Descarga>) {
  let listas = 0, bajando = 0, parcial = 0
  for (const t of tracks) {
    const d = items[claveDescarga(t)] ?? Object.values(items).find(d => d.videoId === t.videoId)
    if (!d || d.temporal) continue
    if (d.estado === 'lista') { listas++; parcial++ } else { bajando++; parcial += d.progreso }
  }
  return { total: tracks.length, listas, bajando, progreso: tracks.length ? parcial / tracks.length : 0 }
}
export function formatoBytes(bytes: number) {
  if (bytes <= 0) return '0 MB'
  const mb = bytes / MB
  return mb < 1 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : mb < 1024 ? `${Math.round(mb)} MB` : `${(mb / 1024).toFixed(1)} GB`
}
function encolar(track: PlaylistTrack, temporal: boolean): string {
  const s = store.get()
  const existente = buscar(claveDescarga(track)) ?? buscar(`video:${track.videoId}`)
  if (existente) {
    const d = s.items[existente]
    poner(existente, { temporal: d.temporal && temporal, ultimoUso: Date.now(), quitarAlLiberar: temporal ? d.quitarAlLiberar : false })
    return existente
  }
  const key = claveDescarga(track)
  const d: Descarga = { audioPath: track.audioPath || '', videoId: track.videoId, title: track.title, artist: track.artist, artworkPath: track.artworkPath,
    estado: 'espera', progreso: 0, bytes: 0, arte: false, temporal, ultimoUso: Date.now(), error: null, intentos: 0, track }
  store.set({ items: { ...s.items, [key]: d }, cola: [...s.cola, key] }); persistir()
  return key
}
export function descargar(track: PlaylistTrack) { if (HAY_DESCARGAS) luego(() => { encolar(track, false); impulsar() }) }
export function descargarLista(tracks: PlaylistTrack[]) { if (HAY_DESCARGAS) luego(() => { for (const t of tracks) encolar(t, false); impulsar() }) }

function detenerActivo(motivo: NonNullable<Trabajo['detener']>) {
  const t = activo
  if (!t || t.detener === 'cancelar') return
  if (t.detener) { if (motivo === 'cancelar') { t.detener = motivo; t.controller.abort(); t.transferencia?.cancelar() }; return }
  t.detener = motivo
  t.controller.abort()
  if (motivo === 'cancelar') { t.transferencia?.cancelar(); return }
  t.detenido = (async () => {
    try {
      const pausa = await t.transferencia?.pausar()
      if (store.get().items[t.key] && t.detener !== 'cancelar') poner(t.key, { pausa: pausa ?? undefined })
    } catch { t.transferencia?.cancelar() }
  })()
}
export function pausarDescarga(key: string) { luego(() => {
  const k = buscar(key); if (!k || store.get().items[k].estado === 'lista') return
  poner(k, { estado: 'pausada', error: null }); if (activo?.key === k) detenerActivo('pausa')
}) }
export function reanudarDescarga(key: string) { luego(() => {
  const k = buscar(key); if (!k || store.get().items[k].estado === 'lista') return
  cacheExplicita.add(k)
  poner(k, { estado: 'espera', error: null, proximoIntento: 0 }); impulsar()
}) }
export function reintentarDescarga(key: string) { luego(() => {
  const k = buscar(key); if (!k || store.get().items[k].estado === 'lista') return
  cacheExplicita.add(k)
  poner(k, { estado: 'espera', error: null, intentos: 0, proximoIntento: 0, pausa: undefined }); impulsar()
}) }
export function cancelarDescarga(key: string) { luego(() => {
  const k = buscar(key); if (!k || store.get().items[k].estado === 'lista') return
  const pausa = store.get().items[k].pausa
  if (activo?.key === k) detenerActivo('cancelar')
  sacar(k)
  void quitarPausa(pausa).catch(() => {})
}) }
export function reanudarDescargas() { if (HAY_DESCARGAS) luego(() => { impulsar() }) }

/** El mismo archivo se promueve a descarga fijada; no se duplica ni se vuelve a bajar. */
export async function prepararCache(track: PlaylistTrack, signal?: AbortSignal): Promise<string | null> {
  if (!HAY_DESCARGAS || signal?.aborted) return null
  await cargarDescargas()
  if (signal?.aborted || !store.get().cargado) return null
  const local = track.audioPath ? rutaLocal(track.audioPath) : null
  if (local) return local
  if (store.get().limiteCacheMB <= 0) return null
  const key = encolar(track, true)
  const identidad = `video:${track.videoId}`
  consumidores.set(identidad, (consumidores.get(identidad) ?? 0) + 1)
  return new Promise(resolve => {
    let off: () => void = () => {}
    let terminado = false
    const terminar = (uri: string | null) => {
      if (terminado) return
      terminado = true; off(); signal?.removeEventListener('abort', abortar)
      const restantes = (consumidores.get(identidad) ?? 1) - 1
      if (restantes) consumidores.set(identidad, restantes); else consumidores.delete(identidad)
      resolve(uri)
    }
    const abortar = () => {
      terminar(null)
      const k = buscar(key) ?? buscar(identidad), d = k ? store.get().items[k] : null
      // Protección evita evicción de audio en uso, no autoriza red sin consumidor.
      // La microtarea permite adoptar la petición durante un cambio de canción.
      queueMicrotask(() => {
        if (!k || !d?.temporal || consumidores.has(identidad) || cacheExplicita.has(k)) return
        const actual = store.get().items[k]
        if (!actual?.temporal || actual.estado === 'lista') return
        if (activo?.key === k) detenerActivo('prioridad')
        if (!protegida(actual)) cancelarDescarga(k)
      })
    }
    const mirar = () => {
      const k = buscar(key) ?? buscar(`video:${track.videoId}`)
      const d = k ? store.get().items[k] : null
      if (!d || d.estado === 'error' || d.estado === 'pausada') terminar(null)
      else if (d.estado === 'lista') terminar(d.uri ?? null)
    }
    off = store.subscribe(mirar); signal?.addEventListener('abort', abortar, { once: true }); mirar()
    const enCurso = activo && store.get().items[activo.key]
    if (!terminado && enCurso && enCurso.estado !== 'lista') {
      const necesaria = consumidores.has(`video:${enCurso.videoId}`)
      // Si era una descarga offline ya iniciada, adoptarla también cambia la
      // sesión al reanudar: conservar background podría dejarla esperando a iOS.
      if (!necesaria || (activo?.transferencia && activo.uso !== 'reproduccion')) detenerActivo('prioridad')
    }
    impulsar()
  })
}
/** Cada reproductor reemplaza sólo sus rutas; [] libera únicamente a ese propietario. */
export function protegerDescargas(paths: string[], propietario: string | symbol = 'motor') {
  const anteriores = new Set(protegidos)
  if (paths.length) protecciones.set(propietario, new Set(paths))
  else protecciones.delete(propietario)
  protegidos.clear()
  for (const rutas of protecciones.values()) for (const path of rutas) protegidos.add(path)
  const liberadas = [...anteriores].some(p => !protegidos.has(p))
  if (liberadas) luego(async () => {
    await mantener(async () => {
      for (const [k, d] of Object.entries(store.get().items)) {
        if (!d.temporal || protegida(d)) continue
        if (d.quitarAlLiberar || (d.estado !== 'lista' && !consumidores.has(`video:${d.videoId}`) && !cacheExplicita.has(k))) await eliminar(k, true)
      }
    })
    await podarCache(0); impulsar()
  })
}
export function priorizarReproduccion(ocupada: boolean) {
  reproduccionOcupada = ocupada
  if (ocupada) detenerActivo('prioridad'); else impulsar()
}
export const getDescargas = () => store.get()
export const useDescargasCargadas = () => useStore(store, s => s.cargado)
export const useDescargasError = () => useStore(store, s => s.error)
export const getLimiteCacheMB = () => store.get().limiteCacheMB
export const useLimiteCacheMB = () => useStore(store, s => s.limiteCacheMB)
export function setLimiteCacheMB(mb: number) {
  if (!Number.isFinite(mb) || mb < 0) return
  limiteModificado = true; store.set({ limiteCacheMB: Math.round(mb) })
  luego(async () => { persistir(); await podarCache(0); impulsar() })
}

/** Borrar y descargar se serializan para que un borrado viejo nunca elimine una descarga nueva. */
function mantener(fn: () => Promise<void>) {
  mantenimiento = mantenimiento.catch(() => {}).then(fn)
  return mantenimiento
}
async function eliminar(key: string, soloTemporal: boolean) {
  const d = store.get().items[key]
  if (!d || (soloTemporal && !d.temporal)) return
  if (protegida(d)) { poner(key, { quitarAlLiberar: true }); return }
  if (activo?.key === key) { detenerActivo('cancelar'); sacar(key); return }
  if (d.estado === 'lista') poner(key, { estado: 'espera', uri: undefined, bytes: 0, progreso: 0 })
  try { await quitarAudio(d.audioPath || key); await quitarPausa(d.pausa) }
  catch (e) {
    if (store.get().items[key]) poner(key, { ...d, temporal: store.get().items[key].temporal })
    throw e
  }
  // Puede haberse fijado mientras el adaptador eliminaba el archivo: conservar intención y volver a encolar.
  const actual = store.get().items[key]
  if (actual && soloTemporal && !actual.temporal) {
    poner(key, { estado: 'espera', bytes: 0, progreso: 0, uri: undefined })
    store.set({ cola: [...new Set([...store.get().cola, key])] }); persistir()
  } else sacar(key)
}
export function quitarDescarga(key: string) { luego(() => mantener(async () => {
  const k = buscar(key); if (!k) return
  if (protegida(store.get().items[k])) poner(k, { temporal: true, ultimoUso: Date.now(), quitarAlLiberar: true })
  else await eliminar(k, false)
})) }
export function quitarLista(tracks: PlaylistTrack[]) { for (const t of tracks) quitarDescarga(claveDescarga(t)) }
export function borrarTodo() { luego(() => mantener(async () => {
  for (const k of Object.keys(store.get().items)) {
    if (protegida(store.get().items[k])) poner(k, { temporal: true, quitarAlLiberar: true }); else await eliminar(k, false)
  }
})) }
export function limpiarCache() { luego(() => mantener(async () => {
  for (const k of Object.keys(store.get().items)) await eliminar(k, true)
})) }
async function podarCache(reservar: number, excepto?: string) {
  await mantener(async () => {
    const candidatos = Object.entries(store.get().items).filter(([k, d]) => k !== excepto && d.temporal && d.estado === 'lista' && !protegida(d)).sort((a, b) => a[1].ultimoUso - b[1].ultimoUso)
    for (const [k] of candidatos) {
      const usados = Object.values(store.get().items).filter(d => d.temporal).reduce((s, d) => s + d.bytes, 0)
      const libre = espacioLibreAudio()
      if (usados + reservar <= store.get().limiteCacheMB * MB && (libre === null || libre >= RESERVA_AUDIO + reservar)) break
      await eliminar(k, true)
    }
  })
}
async function redPermitida(temporal = false) {
  const r = await estadoRedAudio()
  const esperandoRed = !r.conectada
  const preferencias = leerAjustes()
  const esperandoWifi = !esperandoRed && (temporal
    ? clasificarRedPrecarga({ conectada: r.conectada, segura: r.segura, datosPermitidos: preferencias.precargaDatos }) === 'no'
    : preferencias.soloWifi && !r.segura)
  store.set({ esperandoRed, esperandoWifi })
  return !esperandoRed && !esperandoWifi && (!temporal || leerAjustes().precargaAutomatica)
}
async function arrancar() {
  if (corriendo || !HAY_DESCARGAS || !store.get().cargado || reproduccionOcupada) return
  corriendo = true
  try {
    while (!reproduccionOcupada) {
      await mantenimiento.catch(() => {})
      const s = store.get(), ahora = Date.now()
      const pendientes = s.cola.filter(k => s.items[k]?.estado === 'espera' &&
        (!s.items[k].temporal || consumidores.has(`video:${s.items[k].videoId}`) || cacheExplicita.has(k)))
      const elegibles = pendientes.filter(k => (s.items[k].proximoIntento ?? 0) <= ahora)
      let key = elegibles.find(k => consumidores.has(`video:${s.items[k].videoId}`)) ?? elegibles[0]
      if (!key) {
        const fechas = pendientes.flatMap(k => s.items[k]?.estado === 'espera' && s.items[k].proximoIntento ? [s.items[k].proximoIntento!] : [])
        if (fechas.length) programar(Math.min(...fechas) - ahora)
        else store.set({ esperandoRed: false, esperandoWifi: false })
        break
      }
      if (!(await redPermitida(s.items[key].temporal))) {
        const alternativa = elegibles.find(k => s.items[k].temporal !== s.items[key].temporal)
        if (alternativa && await redPermitida(s.items[alternativa].temporal)) key = alternativa
        else { programar(15_000); break }
      }
      if (reproduccionOcupada || store.get().items[key]?.estado !== 'espera') continue
      const candidata = store.get().items[key]
      if (candidata.temporal && !consumidores.has(`video:${candidata.videoId}`) && !cacheExplicita.has(key)) continue
      const t: Trabajo = { key, controller: new AbortController() }; activo = t
      try { await bajar(t) }
      catch (e) {
        if (vigente(t)) {
          const d = store.get().items[t.key]
          const permitida = await redPermitida(d.temporal)
          if (!vigente(t)) continue
          if (!permitida) poner(t.key, { estado: 'espera', pausa: undefined })
          else {
            const intentos = d.intentos + 1
            poner(t.key, { estado: intentos >= MAX_INTENTOS ? 'error' : 'espera', error: mensajeError(e), intentos, pausa: undefined, proximoIntento: Date.now() + 1000 * 2 ** (intentos - 1) })
          }
        }
      } finally {
        await t.detenido
        if (t.detener === 'cancelar') {
          try { await quitarAudio(store.get().items[t.key]?.audioPath || t.key) } catch { /* Se reconciliará al reiniciar. */ }
        } else if (t.detener && store.get().items[t.key] && store.get().items[t.key].estado !== 'pausada' && store.get().items[t.key].estado !== 'lista') poner(t.key, { estado: 'espera' })
        activo = null
      }
    }
  } finally { corriendo = false }
}
async function bajar(t: Trabajo) {
  let d = store.get().items[t.key]
  poner(t.key, { estado: 'preparando', error: null })
  await escribir()
  if (!vigente(t)) return
  if (!d.audioPath) {
    if (!d.track) throw new Error('No se pudo recuperar la canción. Volvé a agregarla.')
    const resolved = await resolveSong({ ...d.track, album: '', albumId: null }, t.controller.signal)
    if (!vigente(t)) return
    if (!resolved.path) throw new Error('La canción todavía no tiene audio disponible.')
    const old = t.key, items = { ...store.get().items }, existente = items[resolved.path]
    d = { ...items[old], audioPath: resolved.path, artworkPath: resolved.artworkPath, pausa: undefined }
    delete items[old]
    if (existente) {
      items[resolved.path] = { ...existente, temporal: existente.temporal && d.temporal }
      store.set({ items, cola: store.get().cola.filter(k => k !== old) }); persistir(); return
    }
    t.key = resolved.path; items[t.key] = d
    store.set({ items, cola: store.get().cola.map(k => k === old ? t.key : k) }); persistir()
  }
  await podarCache(d.temporal ? ESTIMADO : 0, t.key)
  if (!vigente(t)) return
  d = store.get().items[t.key]
  if (d.temporal && Object.values(store.get().items).filter(x => x.temporal && x.estado === 'lista').reduce((s, x) => s + x.bytes, 0) + ESTIMADO > store.get().limiteCacheMB * MB) throw new Error('La caché está ocupada por canciones en uso.')
  const libre = espacioLibreAudio()
  if (libre !== null && libre < RESERVA_AUDIO + ESTIMADO) throw new Error('No queda espacio libre suficiente.')
  const url = await signedUrl(d.audioPath)
  if (!vigente(t)) return
  poner(t.key, { estado: 'bajando' })
  let aviso = 0, bytesTotal = 0, sinEspacio = false
  t.uso = consumidores.has(`video:${d.videoId}`) ? 'reproduccion' : 'descarga'
  t.transferencia = transferirAudio(d.audioPath, url, ({ bytesWritten, totalBytes }) => {
    if (!vigente(t)) return
    bytesTotal = Math.max(bytesTotal, totalBytes)
    const libres = espacioLibreAudio()
    if (libres !== null && libres < RESERVA_AUDIO + Math.max(0, totalBytes - bytesWritten)) { sinEspacio = true; t.transferencia?.cancelar() }
    if (Date.now() - aviso >= 200) { aviso = Date.now(); poner(t.key, { progreso: totalBytes > 0 ? Math.min(.99, bytesWritten / totalBytes) : 0 }, false) }
  }, d.pausa, t.uso)
  const f = await t.transferencia.resultado
  if (!vigente(t)) return
  if (sinEspacio || !f || f.key !== d.audioPath || !f.uri || !Number.isFinite(f.bytes) || f.bytes <= 0 || (bytesTotal > 0 && f.bytes < bytesTotal)) {
    if (f) await quitarAudio(d.audioPath)
    throw new Error('La descarga quedó incompleta o no hay espacio suficiente.')
  }
  if (store.get().items[t.key].temporal) {
    await podarCache(f.bytes, t.key)
    if (!vigente(t)) return
    const usados = Object.entries(store.get().items).filter(([k, x]) => k !== t.key && x.temporal).reduce((s, [, x]) => s + x.bytes, 0)
    if (usados + f.bytes > store.get().limiteCacheMB * MB) { await quitarAudio(d.audioPath); throw new Error('La canción supera el espacio disponible de la caché.') }
  }
  const lista: Descarga = { ...store.get().items[t.key], estado: 'lista', uri: f.uri, bytes: f.bytes, progreso: 1, pausa: undefined, error: null, intentos: 0, ultimoUso: Date.now() }
  // Commit del catálogo después del movimiento atómico y antes de ofrecer la URI al motor.
  await escribir({ ...store.get().items, [t.key]: lista })
  if (!vigente(t)) return
  cacheExplicita.delete(t.key)
  store.set({ items: { ...store.get().items, [t.key]: { ...lista, temporal: store.get().items[t.key].temporal } }, cola: store.get().cola.filter(k => k !== t.key), error: null }); persistir()
  // Las portadas son accesorias: nunca retienen la cola de precarga o un
  // lote con más audio pendiente. La última descarga explícita conserva arte.
  if (d.artworkPath && !store.get().items[t.key].temporal && store.get().cola.length === 0 && !reproduccionOcupada && !t.detener) {
    const remoto = artworkRemoto(d.artworkPath)
    if (remoto) {
      const arteUri = await guardarArte(d.artworkPath, remoto)
      if (vigente(t) && arteUri) poner(t.key, { arte: true, arteUri })
    }
  }
}
export const useDescargas = () => useStore(store, s => s)
export const useDescarga = (audioPath: string | undefined) => useStore(store, s => { const k = audioPath ? buscar(audioPath) : undefined; return k ? s.items[k] ?? null : null })
