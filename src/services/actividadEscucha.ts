import { VIGENCIA_ESCUCHA_MS } from './lecturaViva'

/** Único payload apto para una integración externa; nunca incluye rutas privadas. */
export type ListeningActivity = {
  title: string
  artist: string
  durationMs: number
  /** Posición al crear el snapshot; updatedAt mide frescura, no el inicio. */
  positionMs: number
  updatedAt: number
  /** Instante de la posición, distinto de la frescura del latido remoto. */
  sampledAt: number
  expiresAt: number
  trackUrl?: string
  artworkUrl?: string
}

function texto(value: unknown, limite = 128): string {
  return typeof value === 'string' ? Array.from(value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, limite).join('') : ''
}
function milisegundos(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(86_400_000, Math.round(value))) : 0
}
function caratulaPublica(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2048) return
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) return
    const cdn = ['i.ytimg.com', 'img.youtube.com', 'yt3.googleusercontent.com', 'lh3.googleusercontent.com', 'yt3.ggpht.com', 'lh3.ggpht.com'].includes(url.hostname)
    const storage = url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/storage/v1/object/public/artwork/')
    if (cdn || storage) return url.href
  } catch { /* Metadatos malformados no salen del dispositivo. */ }
}

export function actividadParaCompartir({ track, sonando, autorizada, actualizadoEn, posicionMs, ahora = Date.now() }: {
  track: unknown; sonando: boolean; autorizada: boolean; actualizadoEn: number | null
  posicionMs?: number; ahora?: number
}): ListeningActivity | null {
  if (autorizada !== true || sonando !== true || typeof actualizadoEn !== 'number' || !Number.isFinite(actualizadoEn) || !Number.isFinite(ahora)) return null
  const edad = ahora - actualizadoEn
  if (edad < -VIGENCIA_ESCUCHA_MS || edad >= VIGENCIA_ESCUCHA_MS) return null
  if (!track || typeof track !== 'object' || Array.isArray(track)) return null
  const data = track as Record<string, unknown>
  const title = texto(data.title)
  if (!title) return null
  const durationMs = milisegundos(data.durationMs)
  const positionMs = Math.min(milisegundos(posicionMs), durationMs || 86_400_000)
  if (durationMs > 0 && positionMs >= durationMs) return null
  const updatedAt = Math.min(actualizadoEn, ahora)
  const videoId = typeof data.videoId === 'string' ? data.videoId : ''
  const trackUrl = /^[A-Za-z0-9_-]{11}$/.test(videoId) ? `https://music.youtube.com/watch?v=${videoId}` : undefined
  const artworkUrl = caratulaPublica(data.artworkUrl)
  return { title, artist: texto(data.artist), durationMs, positionMs, updatedAt, sampledAt: ahora, expiresAt: Math.min(updatedAt + VIGENCIA_ESCUCHA_MS, durationMs > 0 ? ahora + durationMs - positionMs : Infinity),
    ...(trackUrl ? { trackUrl } : {}), ...(artworkUrl ? { artworkUrl } : {}) }
}
