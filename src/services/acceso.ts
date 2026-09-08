import { getSupabase } from '../lib/supabase'

export type AccessState = 'pending' | 'approved' | 'rejected'
export type AccessStatus = { status: AccessState; is_admin: boolean }
export type AccessRequest = {
  user_id: string
  email: string | null
  display_name: string | null
  username: string | null
  avatar_url: string | null
  status: AccessState
  requested_at: string
  decided_at: string | null
}
export type AccessDecision = { user_id: string; status: 'approved' | 'rejected'; decided_at: string }

function isAccessState(value: unknown): value is AccessState {
  return value === 'pending' || value === 'approved' || value === 'rejected'
}

/** El permiso siempre procede del servidor; una respuesta inválida nunca concede acceso. */
export async function fetchAccessStatus(): Promise<AccessStatus> {
  const { data, error } = await getSupabase().rpc('access_status')
  if (error) throw error
  if (!data || !isAccessState(data.status) || typeof data.is_admin !== 'boolean') {
    throw new Error('No se pudo verificar el permiso de acceso.')
  }
  return { status: data.status, is_admin: data.is_admin }
}

export async function listAccessRequests(): Promise<AccessRequest[]> {
  const { data, error } = await getSupabase().rpc('access_requests')
  if (error) throw error
  if (!Array.isArray(data) || data.some(row => !row || typeof row.user_id !== 'string' || !isAccessState(row.status) || typeof row.requested_at !== 'string')) {
    throw new Error('No se pudieron leer las solicitudes de acceso.')
  }
  return data as AccessRequest[]
}

export async function decideAccess(userId: string, approve: boolean): Promise<AccessDecision> {
  const { data, error } = await getSupabase().rpc('decide_access', { p_user_id: userId, p_approve: approve })
  if (error) throw error
  if (!data || data.user_id !== userId || data.status !== (approve ? 'approved' : 'rejected') || typeof data.decided_at !== 'string') {
    throw new Error('No se pudo confirmar la decisión. Actualizá las solicitudes.')
  }
  return { user_id: data.user_id, status: data.status, decided_at: data.decided_at }
}

/** Solo orienta la renovación del JWT; no verifica firmas ni concede acceso. */
function sessionRole(token: string): string | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')))
    return typeof claims?.role === 'string' ? claims.role : null
  } catch {
    return null
  }
}

/** Llamar solo después de que access_status confirme approved, antes de activar servicios. */
export async function ensureApprovedSession(): Promise<void> {
  const { auth } = getSupabase()
  const { data, error } = await auth.getSession()
  if (error) throw error
  if (!data.session) throw new Error('La sesión terminó. Volvé a iniciar sesión.')
  if (sessionRole(data.session.access_token) === 'authenticated') return

  // app_pending requiere el JWT nuevo del token hook. Si no se puede leer el
  // rol también se renueva una vez, sin interpretar un token desconocido como aprobado.
  const refreshed = await auth.refreshSession()
  if (refreshed.error) throw refreshed.error
  if (!refreshed.data.session) throw new Error('La sesión terminó. Volvé a iniciar sesión.')
  if (sessionRole(refreshed.data.session.access_token) !== 'authenticated') {
    throw new Error('El permiso de la sesión todavía no se actualizó. Volvé a consultar.')
  }
}
