import type { PlaylistTrack } from '../services/playlists'
import {
  descargarLista, pausarDescarga, reanudarDescarga, reintentarDescarga, quitarDescarga, cancelarDescarga,
  type Descarga,
} from '../state/descargas'
import type { MenuItem } from './Menu'

/** Lee también índices anteriores, que no tenían metadatos completos ni tipo de caché. */
export type DescargaUI = Descarga & Partial<Pick<PlaylistTrack, 'durationMs' | 'artistId' | 'artworkUrl' | 'truePeak'>>
export type EntradaDescarga = { clave: string; descarga: DescargaUI }
export const DETALLE_PRECARGA_SESION = 'En el navegador, la precarga prepara audio temporalmente durante esta sesión para reducir las esperas. No guarda descargas sin conexión para después de cerrar la app.'
export const DETALLE_RED_PC = 'En PC no siempre podemos distinguir Wi-Fi de una conexión compartida. Una red desconocida puede usar datos móviles.'
export const LIMITES_CACHE_MB = [125, 250, 500, 1024, 2048] as const
const activa = (d: DescargaUI) => ['preparando', 'espera', 'bajando'].includes(d.estado)
const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()

export function inventarioDescargas(items: Record<string, DescargaUI>, filtro = '') {
  const palabras = normalizar(filtro).trim().split(/\s+/).filter(Boolean)
  return Object.entries(items).map(([clave, descarga]) => ({ clave, descarga }))
    .filter(({ descarga: d }) => palabras.every(p => normalizar(`${d.title} ${d.artist}`).includes(p)))
    .sort((a, b) => a.descarga.title.localeCompare(b.descarga.title, 'es', { sensitivity: 'base' }))
}

/** La clave del índice puede ser provisional mientras se resuelve el audio. */
export function entradaDeTrack(track: PlaylistTrack, items: Record<string, DescargaUI>): EntradaDescarga | null {
  if (track.audioPath && items[track.audioPath]) return { clave: track.audioPath, descarga: items[track.audioPath] }
  const entry = Object.entries(items).find(([, d]) => d.videoId === track.videoId)
  return entry ? { clave: entry[0], descarga: entry[1] } : null
}

export function cancionDescargada({ clave, descarga: d }: EntradaDescarga): PlaylistTrack | null {
  if (d.estado !== 'lista' || !d.audioPath) return null
  return {
    id: d.track?.id || `descarga:${clave}`, videoId: d.videoId, title: d.title, artist: d.artist,
    audioPath: d.audioPath, artworkPath: d.artworkPath,
    artworkUrl: d.track?.artworkUrl ?? d.artworkUrl ?? '',
    artistId: d.track?.artistId ?? d.artistId ?? null,
    durationMs: d.track?.durationMs ?? d.durationMs ?? 0,
    truePeak: d.track?.truePeak ?? d.truePeak,
  }
}

export function colaDescargada(entradas: EntradaDescarga[]) {
  return entradas.flatMap(e => { const t = cancionDescargada(e); return t ? [{ clave: e.clave, track: t }] : [] })
}

export function estadoDescarga(d: DescargaUI, esperandoWifi: boolean, esperandoRed = false): string {
  switch (d.estado) {
    case 'lista': return 'Disponible sin conexión'
    case 'preparando': return 'Preparando audio'
    case 'pausada': return 'Pausada'
    case 'error': return d.error || 'No se pudo descargar'
    case 'bajando': return `Descargando · ${Math.round(Math.max(0, Math.min(1, d.progreso)) * 100)} %`
    case 'espera': return esperandoRed ? 'Esperando conexión' : esperandoWifi ? 'Esperando Wi-Fi' : 'En cola'
  }
}

export function menuDescarga({ clave, descarga: d }: EntradaDescarga): MenuItem[] {
  const opciones: MenuItem[] = []
  if (activa(d)) opciones.push({ label: 'Pausar descarga', sfSymbol: 'pause', onPress: () => pausarDescarga(clave) })
  if (d.estado === 'pausada') opciones.push({ label: 'Reanudar descarga', sfSymbol: 'play', onPress: () => reanudarDescarga(clave) })
  if (d.estado === 'error') opciones.push({ label: 'Reintentar descarga', sfSymbol: 'arrow.clockwise', onPress: () => reintentarDescarga(clave) })
  opciones.push({
    label: d.estado === 'lista' ? d.temporal ? 'Quitar de la caché' : 'Quitar descarga' : 'Cancelar descarga',
    destructive: true, sfSymbol: d.estado === 'lista' ? 'trash' : 'xmark',
    onPress: () => d.estado === 'lista' ? quitarDescarga(clave) : cancelarDescarga(clave),
  })
  return opciones
}

/** Acciones explícitas: pausar y cancelar pendientes jamás quitan canciones terminadas. */
export function menuDescargasLista(tracks: PlaylistTrack[], items: Record<string, DescargaUI>): MenuItem[] {
  if (!tracks.length) return []
  const entradas = [...new Map(tracks.flatMap(t => {
    const e = entradaDeTrack(t, items)
    return e && !e.descarga.temporal ? [[e.clave, e] as const] : []
  })).values()]
  const opciones: MenuItem[] = []
  if (tracks.some(t => { const e = entradaDeTrack(t, items); return !e || e.descarga.temporal })) {
    opciones.push({ label: 'Descargar para escuchar sin conexión', sfSymbol: 'arrow.down.circle', onPress: () => descargarLista(tracks) })
  }
  const grupo = (label: string, estados: DescargaUI['estado'][], accion: (clave: string) => unknown, destructive = false) => {
    const claves = entradas.filter(e => estados.includes(e.descarga.estado)).map(e => e.clave)
    if (claves.length) opciones.push({ label, destructive, onPress: () => { claves.forEach(accion) } })
  }
  grupo('Pausar descargas', ['preparando', 'espera', 'bajando'], pausarDescarga)
  grupo('Reanudar descargas', ['pausada'], reanudarDescarga)
  grupo('Reintentar descargas', ['error'], reintentarDescarga)
  grupo('Cancelar pendientes', ['preparando', 'espera', 'bajando', 'pausada', 'error'], cancelarDescarga, true)
  grupo('Quitar descargas terminadas', ['lista'], quitarDescarga, true)
  return opciones
}
