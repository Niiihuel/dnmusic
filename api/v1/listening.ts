import type { IncomingMessage, ServerResponse } from 'node:http'
import { actividadParaCompartir } from '../../src/services/actividadEscucha'

type Json = Record<string, unknown>
function objeto(value: unknown): Json | null { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Json : null }

/** Cuenta del token exclusivamente. Nunca usa service_role ni recibe un UUID ajeno. */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Vary', 'Authorization')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  const responder = (status: number, body: unknown) => { res.statusCode = status; res.end(JSON.stringify(body)) }
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); responder(405, { error: 'method_not_allowed' }); return }
  if (new URL(req.url ?? '/', 'https://localhost').search) { responder(400, { error: 'query_not_supported' }); return }
  const authorization = req.headers.authorization
  if (typeof authorization !== 'string' || !/^Bearer \S+$/.test(authorization)) { responder(401, { error: 'unauthorized' }); return }
  const origin = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  if (!origin || !key) { responder(503, { error: 'unavailable' }); return }
  const abort = new AbortController()
  const timeout = setTimeout(() => abort.abort(), 8000)
  const cancelar = () => abort.abort()
  req.once('aborted', cancelar)
  const headers = { apikey: key, Authorization: authorization, 'Content-Type': 'application/json' }
  const rpc = async (name: string, args: Json) => {
    const response = await fetch(`${origin}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(args), signal: abort.signal })
    if (!response.ok) throw new Error('rpc_unavailable')
    return response.json() as Promise<unknown>
  }
  try {
    const session = await fetch(`${origin}/auth/v1/user`, { headers, signal: abort.signal })
    if (session.status === 401 || session.status === 403) { responder(401, { error: 'unauthorized' }); return }
    if (!session.ok) throw new Error('auth_unavailable')
    const user = objeto(await session.json())
    if (typeof user?.id !== 'string' || !user.id) { responder(401, { error: 'unauthorized' }); return }
    const access = objeto(await rpc('access_status', {}))
    if (access?.status !== 'approved') { responder(403, { error: 'access_required' }); return }

    const t0 = Date.now()
    const snapshot = objeto(await rpc('escucha_estado', {}))
    const t1 = Date.now()
    // La lectura pública va última: volver a comprobar opt-in incluso si se
    // revocó mientras llegaba el snapshot privado. Éste nunca sale en la respuesta.
    const data = await rpc('escucha_de_contacto', { p_usuario: user.id })
    const publicada = Array.isArray(data) ? objeto(data[0]) : null
    const propia = objeto(snapshot?.escucha)
    const now = Date.now()
    if (!publicada || !propia || publicada.suena !== true || propia.suena !== true ||
      typeof publicada.updated_at !== 'string' || typeof propia.updated_at !== 'string' || Date.parse(publicada.updated_at) !== Date.parse(propia.updated_at) ||
      typeof objeto(publicada.track)?.videoId !== 'string' || !objeto(publicada.track)?.videoId ||
      objeto(publicada.track)?.videoId !== objeto(propia.track)?.videoId ||
      typeof snapshot?.ahora !== 'number' || !Number.isFinite(snapshot.ahora)) {
      responder(200, { version: 1, activity: null }); return
    }
    const offset = snapshot.ahora - (t0 + t1) / 2
    const updatedAt = Date.parse(publicada.updated_at) - offset
    const startedAt = typeof propia.arrancado_en === 'string' ? Date.parse(propia.arrancado_en) : NaN
    const position = typeof propia.posicion_ms === 'number' && Number.isFinite(propia.posicion_ms) ? propia.posicion_ms : 0
    const positionMs = position + (Number.isFinite(startedAt) ? Math.max(0, now + offset - startedAt) : 0)
    const activity = actividadParaCompartir({ track: publicada.track, sonando: true, autorizada: true, actualizadoEn: updatedAt, posicionMs: positionMs, ahora: now })
    responder(200, { version: 1, activity })
  } catch {
    if (!res.writableEnded) responder(503, { error: 'unavailable' })
  } finally {
    clearTimeout(timeout)
    req.removeListener('aborted', cancelar)
  }
}
