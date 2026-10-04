/** Sólo estado de conexión; jamás viajan cuentas de Discord, tokens ni canciones. */
export type EstadoDiscordRemoto = {
  enabled: boolean
  status: 'disabled' | 'unconfigured' | 'disconnected' | 'connecting' | 'ready' | 'published' | 'error'
  error?: string
}
export type PresenciaControlDiscord = { version: 1; sesion: string; discord?: EstadoDiscordRemoto }
export type MensajeControlDiscord = {
  version: 1
  tipo: 'solicitud' | 'oferta' | 'aplicar' | 'resultado' | 'confirmar' | 'cancelar'
  requestId: string
  origen: string
  origenSesion: string
  destino: string
  destinoSesion: string
  enabled?: boolean
  estado?: EstadoDiscordRemoto
  error?: 'ocupado' | 'fallo' | 'cancelado'
}
const ESTADOS = new Set(['disabled', 'unconfigured', 'disconnected', 'connecting', 'ready', 'published', 'error'])
const TIPOS = new Set(['solicitud', 'oferta', 'aplicar', 'resultado', 'confirmar', 'cancelar'])
export const identidadControlDiscord = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
const identidad = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 128 && /^[a-zA-Z0-9:_-]+$/.test(v)

export function estadoDiscordRemoto(valor: unknown): EstadoDiscordRemoto | null {
  if (!valor || typeof valor !== 'object') return null
  const e = valor as Partial<EstadoDiscordRemoto>
  if (typeof e.enabled !== 'boolean' || !ESTADOS.has(e.status ?? '')) return null
  if (!e.enabled && e.status !== 'disabled' && e.status !== 'error') return null
  return { enabled: e.enabled, status: e.status!, ...(e.status === 'error' ? { error: 'No se pudo comunicar con Discord en esa computadora.' } : {}) }
}
export function presenciaControlDiscord(valor: unknown): PresenciaControlDiscord | undefined {
  if (!valor || typeof valor !== 'object') return
  const p = valor as Partial<PresenciaControlDiscord>
  if (p.version !== 1 || !identidad(p.sesion)) return
  const discord = estadoDiscordRemoto(p.discord)
  return { version: 1, sesion: p.sesion, ...(discord ? { discord } : {}) }
}
export function mensajeControlDiscord(valor: unknown): MensajeControlDiscord | null {
  if (!valor || typeof valor !== 'object') return null
  const m = valor as Partial<MensajeControlDiscord>
  if (m.version !== 1 || !TIPOS.has(m.tipo ?? '') || !identidad(m.requestId) || !identidad(m.origen)
    || !identidad(m.origenSesion) || !identidad(m.destino) || !identidad(m.destinoSesion)) return null
  if (m.tipo === 'solicitud' && typeof m.enabled !== 'boolean') return null
  const estado = estadoDiscordRemoto(m.estado)
  const error = ['ocupado', 'fallo', 'cancelado'].includes(m.error ?? '') ? m.error : undefined
  return { version: 1, tipo: m.tipo!, requestId: m.requestId, origen: m.origen, origenSesion: m.origenSesion,
    destino: m.destino, destinoSesion: m.destinoSesion, ...(typeof m.enabled === 'boolean' ? { enabled: m.enabled } : {}),
    ...(estado ? { estado } : {}), ...(error ? { error } : {}) }
}
