import type { User } from '@supabase/supabase-js'
import { getSupabase } from '../lib/supabase'

/**
 * Auth.
 *
 * El login es por **usuario**, no por email. Supabase Auth solo hace password
 * auth contra un email o un teléfono, así que cada cuenta lleva uno interno con
 * un dominio reservado (RFC 6761): `nihuel@flora.local`. Nunca sale un mail, y
 * por eso tampoco hay recuperación de contraseña por correo.
 *
 * Ese email se arma al registrarse y **no se toca nunca más**: es un
 * identificador interno, no el nombre de la persona. El usuario visible vive en
 * `profiles` y se puede cambiar; para entrar, `auth_email_for_username` traduce
 * el usuario actual al email interno.
 *
 * Antes la traducción era una regla fija en el cliente (`dany` →
 * `dany@flora.local`) y no hacía falta consultar nada. Se cambió porque hacía
 * imposible renombrarse: mover el email deja en GoTrue un cambio pendiente de
 * confirmación, y a un dominio que no recibe correo esa confirmación no llega
 * nunca — la cuenta quedaba inaccesible con su nombre nuevo.
 */
const AUTH_DOMAIN = 'flora.local'

/** `nihuel` → `nihuel@flora.local`. Si ya viene con @, se respeta tal cual. */
export function usernameToEmail(username: string): string {
  const clean = username.trim().toLowerCase()
  return clean.includes('@') ? clean : `${clean}@${AUTH_DOMAIN}`
}

/** La inversa, para mostrar el usuario en la UI sin el dominio interno. */
export function emailToUsername(email: string | undefined): string {
  if (!email) return ''
  return email.endsWith(`@${AUTH_DOMAIN}`) ? email.slice(0, -`@${AUTH_DOMAIN}`.length) : email
}

export function subscribeToAuth(onChange: (user: User | null) => void): () => void {
  const supabase = getSupabase()
  // onAuthStateChange emite INITIAL_SESSION apenas se suscribe, así que no hace
  // falta un getSession() previo para resolver el arranque.
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    onChange(session?.user ?? null)
  })
  return () => data.subscription.unsubscribe()
}

export async function signIn(username: string, password: string): Promise<User> {
  /*
   * Si la consulta no encuentra el usuario se sigue igual con la regla vieja:
   * la respuesta tiene que ser "usuario o contraseña incorrectos" y no "esa
   * cuenta no existe". Cortar acá convertiría el login en un detector de
   * usuarios más preciso que el propio intento de entrar.
   */
  const email = (await authEmailFor(username)) ?? usernameToEmail(username)
  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.user
}

/** Email interno de una cuenta, a partir de su usuario actual. */
async function authEmailFor(username: string): Promise<string | null> {
  const { data, error } = await getSupabase().rpc('auth_email_for_username', {
    p_username: username.trim().toLowerCase(),
  })
  if (error) return null
  return typeof data === 'string' && data.length > 0 ? data : null
}

/**
 * Alta de cuenta.
 *
 * El usuario elegido viaja en la metadata además de en el email: el trigger
 * `sync_auth_profile` lo toma de ahí para crear el perfil. Si ya está tomado,
 * el índice único hace fallar el alta entera —no queda una cuenta huérfana sin
 * perfil— y acá se traduce a un mensaje que el formulario pueda mostrar.
 *
 * `enable_confirmations` está apagado, así que Supabase devuelve la sesión ya
 * iniciada. Tiene que ser así: un dominio reservado no recibe correo, con lo
 * cual un mail de confirmación no llegaría nunca.
 */
export async function signUp(username: string, password: string): Promise<User> {
  const clean = username.trim().toLowerCase()
  const { data, error } = await getSupabase().auth.signUp({
    email: usernameToEmail(clean),
    password,
    options: { data: { username: clean } },
  })
  if (error) throw error
  if (!data.user) throw new Error('No se pudo crear la cuenta.')
  return data.user
}

/** ¿Está libre ese nombre? Se puede preguntar sin tener sesión. */
export async function isUsernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('username_available', {
    p_username: username.trim().toLowerCase(),
  })
  if (error) throw error
  return data === true
}

export async function logOut(): Promise<void> {
  const { error } = await getSupabase().auth.signOut()
  if (error) throw error
}

/**
 * Descubre el par al que pertenece el usuario.
 *
 * `maybeSingle` en vez de `single`: no encontrar par es un estado válido
 * (usuario todavía sin vincular), no un error.
 */
export async function findPairId(uid: string): Promise<string | null> {
  const { data, error } = await getSupabase()
    .from('pair_members')
    .select('pair_id')
    .eq('user_id', uid)
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return (data?.pair_id as string | undefined) ?? null
}

export type PairContact = {
  id: string
  username: string
}

/**
 * Devuelve la otra cuenta del par.
 *
 * El email vive en auth.users y el cliente no puede (ni debería) leer esa tabla.
 * La función SQL valida la pertenencia al par y expone únicamente el nombre de
 * usuario del otro integrante.
 */
export async function findPairContact(pairId: string): Promise<PairContact | null> {
  const { data, error } = await getSupabase().rpc('get_pair_contact', {
    p_pair_id: pairId,
  })

  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row.user_id !== 'string' || typeof row.username !== 'string') return null

  return { id: row.user_id, username: row.username }
}

export type { User }
