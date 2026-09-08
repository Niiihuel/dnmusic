import type { SupabaseClient } from '@supabase/supabase-js'

/** Validates the session and live approval; never trust user_metadata or a cached JWT flag. */
export async function accesoAprobado(db: SupabaseClient | null, authorization: string | null | undefined): Promise<boolean> {
  if (!db || !authorization?.startsWith('Bearer ')) return false
  const token = authorization.slice(7)
  if (!token) return false
  try {
    const { data, error } = await db.auth.getUser(token)
    if (error || !data.user) return false
    const access = await db.rpc('access_user_approved', { p_user_id: data.user.id })
    return !access.error && access.data === true
  } catch { return false }
}
