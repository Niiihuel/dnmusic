import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import { makeRedirectUri } from 'expo-auth-session'
import { randomUUID, digestStringAsync, CryptoDigestAlgorithm, CryptoEncoding } from 'expo-crypto'
import type { User } from '@supabase/supabase-js'
import { getSupabase } from '../lib/supabase'

/**
 * Auth.
 *
 * Las cuentas anteriores entran por usuario y contraseña; las nuevas usan Google.
 * Supabase Auth solo hace password
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

/** Sólo nombres internos legacy: nunca revelar un correo externo como fallback visible. */
export function emailToUsername(email: string | undefined): string {
  if (!email) return ''
  return email.endsWith(`@${AUTH_DOMAIN}`) ? email.slice(0, -`@${AUTH_DOMAIN}`.length) : ''
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

/** Las cuentas nuevas usan Google. El acceso por contraseña existente sigue en signIn. */
export async function signUp(...credenciales: [username: string, password: string]): Promise<User> {
  void credenciales
  throw new Error('Para crear una cuenta nueva, continuá con Google.')
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
  await cancelarGoogle()
  callbackEnCurso = null
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


/* Google usa códigos PKCE; nunca se leen access_token/refresh_token de una URL. */
const GOOGLE_PENDIENTE = 'auth:google:pendiente:v1'
const DURACION_GOOGLE = 10 * 60 * 1000
const CALLBACK_NATIVO = 'dnmusic://auth/callback'
type PendienteGoogle = { nonce: string; redirectTo: string; vence: number; flowId?: string | null; desktopId?: string; userId?: string }
type ResultadoNavegadorGoogle = { type: 'success'; url: string } | { type: 'cancel' }
type OAuthEscritorio = {
  preparar: () => Promise<{ id: string; redirectTo: string }>
  abrir: (pedido: { id: string; url: string }) => Promise<ResultadoNavegadorGoogle>
  abrirVinculacion?: (pedido: { id: string; url: string; retorno: string }) => Promise<ResultadoNavegadorGoogle>
  cancelar: (id: string) => Promise<void>
}
function escritorioGoogle() {
  return (globalThis as { dnmusicEscritorio?: { oauthGoogle?: OAuthEscritorio } }).dnmusicEscritorio
}
function guardarPendiente(p: PendienteGoogle | null) {
  if (Platform.OS === 'web') {
    if (p) window.sessionStorage.setItem(GOOGLE_PENDIENTE, JSON.stringify(p))
    else window.sessionStorage.removeItem(GOOGLE_PENDIENTE)
    return Promise.resolve()
  }
  return p ? AsyncStorage.setItem(GOOGLE_PENDIENTE, JSON.stringify(p)) : AsyncStorage.removeItem(GOOGLE_PENDIENTE)
}
async function leerPendiente(): Promise<PendienteGoogle | null> {
  const raw = Platform.OS === 'web' ? window.sessionStorage.getItem(GOOGLE_PENDIENTE) : await AsyncStorage.getItem(GOOGLE_PENDIENTE)
  if (!raw) return null
  try {
    const p = JSON.parse(raw)
    return typeof p.nonce === 'string' && typeof p.redirectTo === 'string' && typeof p.vence === 'number' ? p : null
  } catch { return null }
}
async function limpiarPendiente(nonce: string) {
  if ((await leerPendiente())?.nonce === nonce) await guardarPendiente(null)
}
let inicioGoogle: Promise<User | null> | null = null
let intentoGoogle: { cancelado: boolean; desktopId?: string } | null = null
let callbackEnCurso: { url: string; resultado: Promise<User | null> } | null = null
let nonceReclamado: string | null = null
let googleCancelado = false
let generacionGoogle = 0
let intercambiandoGoogle = false
let intercambioValidado: Promise<User | null> | null = null

export function signInWithGoogle(): Promise<User | null> { return comenzarGoogle() }

/** Agrega una identidad a la sesión actual; jamás crea otra cuenta mediante signIn. */
export function conectarGoogle(userId: string): Promise<User | null> {
  if (!userId) return Promise.reject(new Error('Iniciá sesión antes de conectar Google.'))
  return comenzarGoogle(userId)
}
let vinculacionActual = false
export async function destinoTrasGoogle(): Promise<'/ajustes?seccion=cuenta' | '/'> {
  return (await leerPendiente())?.userId || vinculacionActual ? '/ajustes?seccion=cuenta' : '/'
}
function comenzarGoogle(userId?: string): Promise<User | null> {
  if (inicioGoogle) return inicioGoogle
  if (intercambiandoGoogle && intercambioValidado) return intercambioValidado
  vinculacionActual = !!userId
  generacionGoogle++
  const intento = { cancelado: false } as NonNullable<typeof intentoGoogle>
  intentoGoogle = intento
  googleCancelado = false
  callbackEnCurso = null; nonceReclamado = null; intercambioValidado = null
  inicioGoogle = iniciarGoogle(intento, userId).finally(() => { inicioGoogle = null; if (intentoGoogle === intento) intentoGoogle = null })
  return inicioGoogle
}

async function iniciarGoogle(intento: NonNullable<typeof intentoGoogle>, userId?: string): Promise<User | null> {
  const desktop = escritorioGoogle()
  if (desktop && !desktop.oauthGoogle) throw new Error('Actualizá la app de escritorio para continuar con Google.')
  if (userId) {
    if (desktop?.oauthGoogle && !desktop.oauthGoogle.abrirVinculacion) throw new Error('Actualizá la app de escritorio para conectar Google.')
    const { data, error } = await getSupabase().auth.getUser()
    if (error || data.user?.id !== userId) throw new Error('La sesión cambió. Volvé a abrir Configuración.')
    if (data.user.identities?.some(i => i.provider === 'google')) return data.user
  }
  const anterior = await leerPendiente()
  if (anterior?.desktopId) await desktop?.oauthGoogle?.cancelar(anterior.desktopId)
  await guardarPendiente(null)
  if (intento.cancelado) return null
  let pendiente: PendienteGoogle | null = null
  let redirigido = false
  try {
    let redirectTo: string
    if (desktop?.oauthGoogle) {
      const local = await desktop.oauthGoogle.preparar()
      intento.desktopId = local.id
      redirectTo = local.redirectTo
      const u = new URL(redirectTo)
      if (u.protocol !== 'http:' || u.hostname !== '127.0.0.1' || !u.port || u.pathname !== `/auth/callback/${local.id}` || u.search || u.hash || u.username || u.password) throw new Error('El retorno de escritorio no es válido.')
    } else if (Platform.OS === 'web') {
      redirectTo = new URL('/auth/callback', window.location.origin).href
    } else {
      redirectTo = makeRedirectUri({ scheme: 'dnmusic', path: 'auth/callback', native: CALLBACK_NATIVO })
      if (redirectTo !== CALLBACK_NATIVO) throw new Error('Para usar Google, abrí una compilación de dnmusic instalada en el dispositivo.')
    }
    if (intento.cancelado) return null
    pendiente = { nonce: randomUUID(), redirectTo, vence: Date.now() + DURACION_GOOGLE, desktopId: intento.desktopId, userId }
    const retorno = new URL(redirectTo); retorno.searchParams.set('dn_state', pendiente.nonce)
    const credentials = { provider: 'google' as const, options: {
      redirectTo: retorno.href, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' },
    } }
    const { data, error } = userId
      ? await getSupabase().auth.linkIdentity(credentials)
      : await getSupabase().auth.signInWithOAuth(credentials)
    if (error) throw error
    if (intento.cancelado) return null
    if (!data.url) throw new Error('No se pudo abrir Google.')
    let authURL = data.url
    if (!userId && Platform.OS !== 'web') {
      const nativa = new URL(authURL)
      // El SDK puede emitir plain internamente sin WebCrypto. El verificador permanece en su storage;
      // sólo su SHA-256 sale al navegador, calculado por el módulo criptográfico nativo.
      if (nativa.searchParams.get('code_challenge_method') === 'plain') {
        const verifier = nativa.searchParams.get('code_challenge') ?? ''
        if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) throw new Error('No se pudo preparar PKCE.')
        const digest = await digestStringAsync(CryptoDigestAlgorithm.SHA256, verifier, { encoding: CryptoEncoding.BASE64 })
        nativa.searchParams.set('code_challenge', digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''))
        nativa.searchParams.set('code_challenge_method', 's256')
        authURL = nativa.href
      }
    }
    pendiente.flowId = data.flowId ?? null
    if (userId) {
      validarVinculacionGoogle(authURL)
      if (pendiente.flowId) retorno.searchParams.set('sb_flow_id', pendiente.flowId)
    } else validarInicioGoogle(authURL, retorno, pendiente.flowId)
    await guardarPendiente(pendiente)
    if (intento.cancelado) return null
    if (desktop?.oauthGoogle && intento.desktopId) {
      const result = userId
        ? await desktop.oauthGoogle.abrirVinculacion!({ id: intento.desktopId, url: authURL, retorno: retorno.href })
        : await desktop.oauthGoogle.abrir({ id: intento.desktopId, url: authURL })
      return result.type === 'success' && !intento.cancelado ? await completarGoogleCallback(result.url) : null
    }
    if (Platform.OS === 'web') {
      window.location.assign(authURL)
      redirigido = true
      return null
    }
    const result = await WebBrowser.openAuthSessionAsync(authURL, redirectTo)
    return result.type === 'success' && !intento.cancelado ? await completarGoogleCallback(result.url) : null
  } finally {
    if (intento.desktopId) await desktop?.oauthGoogle?.cancelar(intento.desktopId).catch(() => {})
    // En web la transacción sobrevive a la navegación completa al proveedor.
    if (pendiente && !redirigido) await limpiarPendiente(pendiente.nonce)
  }
}
/** linkIdentity retorna la URL del proveedor, firmada por Auth, no /authorize. */
function validarVinculacionGoogle(raw: string) {
  const u = new URL(raw), base = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL ?? '')
  if (u.origin !== 'https://accounts.google.com' || !['/o/oauth2/auth', '/o/oauth2/v2/auth'].includes(u.pathname) ||
    u.username || u.password || u.hash || u.searchParams.get('response_type') !== 'code' ||
    u.searchParams.get('redirect_uri') !== `${base.origin}${base.pathname.replace(/\/$/, '')}/auth/v1/callback` ||
    !u.searchParams.get('state') || !u.searchParams.get('client_id')?.endsWith('.apps.googleusercontent.com') ||
    [...u.searchParams.keys()].some(k => u.searchParams.getAll(k).length !== 1)) throw new Error('La vinculación con Google no es válida.')
}

function validarInicioGoogle(raw: string, retorno: URL, flowId?: string | null) {
  const u = new URL(raw), base = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL ?? '')
  const redirect = new URL(u.searchParams.get('redirect_to') ?? '')
  if (flowId) retorno.searchParams.set('sb_flow_id', flowId)
  if (u.origin !== base.origin || u.pathname !== `${base.pathname.replace(/\/$/, '')}/auth/v1/authorize` || u.username || u.password || u.hash ||
    u.searchParams.get('provider') !== 'google' || u.searchParams.get('code_challenge_method')?.toLowerCase() !== 's256' ||
    !/^[A-Za-z0-9_-]{43}$/.test(u.searchParams.get('code_challenge') ?? '') || redirect.href !== retorno.href) {
    throw new Error('El inicio de Google no es válido.')
  }
}

/** Cancela la espera del navegador. Un código ya validado se termina de intercambiar una sola vez. */
export async function cancelarGoogle(): Promise<void> {
  const generacion = ++generacionGoogle
  googleCancelado = true
  const intento = intentoGoogle
  if (intento) intento.cancelado = true
  if (intercambiandoGoogle && intercambioValidado) { await intercambioValidado.catch(() => {}); return }
  const p = await leerPendiente()
  if (generacion !== generacionGoogle) return
  const desktopId = intento?.desktopId ?? p?.desktopId
  if (desktopId) await escritorioGoogle()?.oauthGoogle?.cancelar(desktopId)
  else if (Platform.OS !== 'web') { try { WebBrowser.dismissAuthSession() } catch { /* No había navegador abierto. */ } }
  if (p) await limpiarPendiente(p.nonce)
}

export async function completarGoogleCallback(url?: string): Promise<User | null> {
  const raw = url ?? (Platform.OS === 'web' ? window.location.href : await Linking.getInitialURL())
  if (!raw) throw new Error('No llegó el retorno de Google.')
  if (callbackEnCurso?.url === raw) return callbackEnCurso.resultado
  const resultado = intercambiarGoogle(raw)
  callbackEnCurso = { url: raw, resultado }
  return resultado
}
async function intercambiarGoogle(raw: string): Promise<User | null> {
  const generacion = generacionGoogle
  const p = await leerPendiente()
  if (p) vinculacionActual = !!p.userId
  if (googleCancelado || generacion !== generacionGoogle) throw new Error('El inicio con Google fue cancelado.')
  if (!p || p.vence <= Date.now()) throw new Error('El inicio con Google venció. Volvé a intentarlo.')
  const u = new URL(raw), esperado = new URL(p.redirectTo)
  const desktop = escritorioGoogle()
  const destinoValido = desktop?.oauthGoogle && p.desktopId
    ? esperado.protocol === 'http:' && esperado.hostname === '127.0.0.1' && Boolean(esperado.port) && esperado.pathname === `/auth/callback/${p.desktopId}`
    : Platform.OS === 'web'
      ? esperado.origin === window.location.origin && esperado.pathname === '/auth/callback' && ['https:', 'http:'].includes(esperado.protocol)
      : p.redirectTo === CALLBACK_NATIVO
  if (!destinoValido || esperado.username || esperado.password || esperado.search || esperado.hash) throw new Error('El destino de Google no es válido.')
  const claves = new Set(['code', 'error', 'error_code', 'error_description', 'dn_state', 'sb_flow_id'])
  if (u.protocol !== esperado.protocol || u.host !== esperado.host || u.pathname !== esperado.pathname || u.username || u.password || u.hash ||
    u.searchParams.get('dn_state') !== p.nonce || (u.searchParams.get('sb_flow_id') ?? null) !== (p.flowId ?? null) ||
    [...u.searchParams.keys()].some(k => !claves.has(k) || u.searchParams.getAll(k).length !== 1)) throw new Error('El retorno de Google no corresponde a este inicio.')
  const code = u.searchParams.get('code'), error = u.searchParams.get('error')
  if ((code && error) || (!code && !error) || (code && !/^[A-Za-z0-9._~-]{1,2048}$/.test(code))) throw new Error('El retorno de Google está incompleto.')
  if (nonceReclamado === p.nonce) throw new Error('Este retorno de Google ya se está procesando.')
  nonceReclamado = p.nonce
  if (Platform.OS === 'web' && !escritorioGoogle() && window.location.origin === u.origin && window.location.pathname === u.pathname) window.history.replaceState(null, '', u.pathname)
  // Publicar la promesa antes de entrar al SDK: logout también la espera si el SDK emite un evento síncrono.
  intercambiandoGoogle = true
  const resultado = Promise.resolve().then(async () => {
    try {
      if (error === 'access_denied') return null
      if (error) throw new Error('Google no pudo completar el acceso. Volvé a intentarlo.')
      if (p.userId) {
        const { data: actual } = await getSupabase().auth.getSession()
        if (actual.session?.user.id !== p.userId) throw new Error('La sesión cambió. La vinculación fue cancelada.')
      }
      const { data, error: fallo } = await getSupabase().auth.exchangeCodeForSession(code!, p.flowId ? { flowId: p.flowId } : undefined)
      if (fallo) throw fallo
      if (!data.user || !data.session) throw new Error('No se pudo completar el acceso con Google.')
      if (p.userId && data.user.id !== p.userId) {
        await getSupabase().auth.signOut({ scope: 'local' })
        throw new Error('Google no devolvió la cuenta original. Iniciá sesión nuevamente.')
      }
      if (p.userId && !data.user.identities?.some(i => i.provider === 'google')) throw new Error('No se confirmó la vinculación. Ese Google puede estar conectado a otra cuenta.')
      return data.user
    } finally { await limpiarPendiente(p.nonce) }
  }).finally(() => { intercambiandoGoogle = false })
  intercambioValidado = resultado
  return resultado
}
