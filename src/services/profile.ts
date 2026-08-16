import { getSupabase } from '../lib/supabase'

/**
 * Perfil propio: usuario, nombre visible y foto.
 *
 * La tabla `profiles` no se consulta directamente —está revocada para
 * `authenticated`— sino a través de funciones que devuelven solo lo necesario.
 * Acá se las envuelve.
 */

const AVATAR_BUCKET = 'avatars'
/** Lo que acepta el bucket; conviene rechazar antes de subir. */
/*
 * Lo que acepta el bucket. **Tiene que coincidir con él**: la lista de verdad
 * está en `storage.buckets`, y si acá fuera más permisiva el archivo viajaría
 * entero para que el servidor lo rechace al final.
 */
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const AVATAR_MAX_BYTES = 8 * 1024 * 1024

export type Profile = {
  userId: string
  username: string
  /** Cómo quiere que la llamen. Si está vacío se muestra el usuario. */
  displayName: string | null
  /** Ruta dentro del bucket `avatars`; null si no puso foto. */
  avatarPath: string | null
  /** Una línea sobre vos. Hasta 180 caracteres, lo valida la base. */
  bio: string | null
  /**
   * La tapa que baña el encabezado del perfil.
   *
   * Es un camino a Storage y no una URL de YouTube: las de ellos vencen, y un
   * perfil no puede quedarse sin fondo porque expiró un enlace.
   */
  bannerPath: string | null
  /** Desde cuándo existe la cuenta. Lo muestra el resumen del perfil. */
  createdAt: string | null
  /**
   * Quién puede ver tu perfil.
   *
   * Arranca en privado para todas las cuentas, incluidas las que ya existían:
   * nadie eligió mostrar nada, así que nadie muestra nada hasta decirlo. Lo
   * hace cumplir la base —la policy de `profile_showcases` mira esto— y no la
   * app, que se puede olvidar de preguntar.
   */
  visibility: 'publico' | 'privado'
  /** Cómo mirar la foto dentro de su círculo. `null` = cubrir y centrar. */
  avatarEncuadre: Encuadre | null
  /** Lo mismo para el fondo. */
  bannerEncuadre: Encuadre | null
  /** El marco dibujado alrededor de la foto; null = ninguno. Ver `ui/Marco`. */
  marco: string | null
}

/**
 * Cómo se mira una imagen adentro de su recuadro.
 *
 * No es un recorte: la imagen sube entera y esto dice cómo dibujarla. Es lo que
 * permite que un GIF de perfil siga animado —recortarlo de verdad lo aplastaría
 * a un cuadro— y que cambiar el encuadre después no vuelva a tocar el archivo.
 *
 * `escala` 1 es «cubrir», que es como se dibujaba antes de que esto existiera;
 * `x` e `y` corren la imagen en fracciones del lado del recuadro. Con `null`
 * entero se dibuja cubriendo y centrado, o sea: lo de siempre.
 */
export type Encuadre = { x: number; y: number; escala: number }

type ProfileRow = {
  user_id?: unknown
  username?: unknown
  display_name?: unknown
  avatar_path?: unknown
  bio?: unknown
  banner_path?: unknown
  created_at?: unknown
  visibility?: unknown
  avatar_encuadre?: unknown
  banner_encuadre?: unknown
  marco?: unknown
}

/** Un encuadre del jsonb, o null. Un número raro lo descarta entero: medio
 *  encuadre dibujaría la imagen en un lugar que nadie eligió. */
function encuadreDe(v: unknown): Encuadre | null {
  const r = v as Record<string, unknown> | null
  if (!r || typeof r !== 'object') return null
  const { x, y, escala } = r
  if (typeof x !== 'number' || typeof y !== 'number' || typeof escala !== 'number') return null
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(escala)) return null
  return { x, y, escala }
}

function profileFromRow(row: ProfileRow | null | undefined): Profile | null {
  if (!row || typeof row.user_id !== 'string' || typeof row.username !== 'string') return null
  return {
    userId: row.user_id,
    username: row.username,
    displayName: typeof row.display_name === 'string' ? row.display_name : null,
    avatarPath: typeof row.avatar_path === 'string' ? row.avatar_path : null,
    bio: typeof row.bio === 'string' ? row.bio : null,
    bannerPath: typeof row.banner_path === 'string' ? row.banner_path : null,
    createdAt: typeof row.created_at === 'string' ? row.created_at : null,
    visibility: row.visibility === 'publico' ? 'publico' : 'privado',
    avatarEncuadre: encuadreDe(row.avatar_encuadre),
    bannerEncuadre: encuadreDe(row.banner_encuadre),
    marco: typeof row.marco === 'string' && row.marco ? row.marco : null,
  }
}

export async function fetchMyProfile(): Promise<Profile | null> {
  const { data, error } = await getSupabase().rpc('get_my_profile')
  if (error) throw error
  return profileFromRow(Array.isArray(data) ? data[0] : data)
}

/**
 * Guarda los campos que se pasen. Lo que se omite queda como está; para vaciar
 * el nombre visible o la foto se manda cadena vacía.
 */
/** Ver el comentario de los `p_*_encuadre` en `saveMyProfile`. */
function encuadreParaLaBase(e: Encuadre | null | undefined): Encuadre | string | null {
  if (e === undefined) return null
  return e === null ? 'BORRAR' : e
}

export async function saveMyProfile(changes: {
  username?: string
  displayName?: string
  avatarPath?: string
  bio?: string
  bannerPath?: string
  visibility?: 'publico' | 'privado'
  /** `null` borra el encuadre y vuelve al centrado; no mandarlo lo deja. */
  avatarEncuadre?: Encuadre | null
  bannerEncuadre?: Encuadre | null
  /** La cadena vacía lo saca, como el resto de los textos de esta función. */
  marco?: string
}): Promise<Profile> {
  const { data, error } = await getSupabase().rpc('update_my_profile', {
    p_username: changes.username ?? null,
    p_display_name: changes.displayName ?? null,
    p_avatar_path: changes.avatarPath ?? null,
    p_bio: changes.bio ?? null,
    p_banner_path: changes.bannerPath ?? null,
    p_visibility: changes.visibility ?? null,
    /*
     * `undefined` no viaja y la base no lo toca. `null` viaja como el texto
     * `BORRAR`, no como JSON null: PostgREST traduce el null de JSON a NULL de
     * SQL, con lo cual «borralo» y «no lo toques» llegarían idénticos y no
     * habría forma de volver al centrado.
     */
    p_avatar_encuadre: encuadreParaLaBase(changes.avatarEncuadre),
    p_banner_encuadre: encuadreParaLaBase(changes.bannerEncuadre),
    p_marco: changes.marco ?? null,
  })
  if (error) throw error
  const profile = profileFromRow(Array.isArray(data) ? data[0] : data)
  if (!profile) throw new Error('No se pudo guardar el perfil.')
  return profile
}

/**
 * URL pública de una foto de perfil.
 *
 * El bucket es público a propósito (ver la migración): una foto aparece en cada
 * fila de la lista y en cada mensaje, y firmar una URL por cada una —y volver a
 * firmarlas al vencer— no se justifica para esto.
 */
export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null
  const { data } = getSupabase().storage.from(AVATAR_BUCKET).getPublicUrl(path)
  return data.publicUrl || null
}

/**
 * Sube una foto y devuelve su ruta.
 *
 * El nombre lleva el uuid de la cuenta como carpeta porque las policies de
 * Storage exigen justamente eso, y una marca de tiempo para que reemplazar la
 * foto genere una URL distinta: con la misma ruta, el navegador seguiría
 * mostrando la vieja desde su caché.
 */
export async function uploadAvatar(
  userId: string,
  /* ArrayBuffer en el teléfono, File en la web. Ver `PickedImage.blob`: con un
     Blob, storage-js ignora el contentType y viajaba `text/plain`. */
  file: Blob | ArrayBuffer,
  fileName: string,
  /* El tipo lo trae quien eligió la imagen: `file.type` viene vacío en el
     teléfono y rechazaba todo. Ver `pickImage`. */
  mime = file instanceof Blob ? file.type : '',
): Promise<string> {
  if (!AVATAR_TYPES.includes(mime)) {
    throw new Error('La foto tiene que ser JPG, PNG, WebP o GIF.')
  }
  const peso = file instanceof Blob ? file.size : file.byteLength
  if (peso > AVATAR_MAX_BYTES) {
    throw new Error('La foto no puede pesar más de 8 MB.')
  }

  const ext = fileName.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${userId}/${Date.now()}.${ext}`

  const { error } = await getSupabase()
    .storage.from(AVATAR_BUCKET)
    .upload(path, file, { contentType: mime, upsert: true })
  if (error) throw error
  return path
}

/**
 * Borra una foto anterior. No tira si falla: quedó un archivo suelto, que es
 * mucho menos grave que impedir el guardado del perfil por eso.
 */
export async function removeAvatar(path: string | null): Promise<void> {
  if (!path) return
  await getSupabase().storage.from(AVATAR_BUCKET).remove([path]).catch(() => {})
}

/** Iniciales para el hueco cuando no hay foto. */
export function initialsFor(name: string): string {
  const parts = name.trim().split(/[\s_]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

/**
 * El perfil público de alguien, por su usuario.
 *
 * Devuelve `null` si esa cuenta está en privado — o si no existe. Las dos cosas
 * se ven igual a propósito: «existe pero no te deja ver» ya es información sobre
 * alguien que decidió no mostrarse.
 */
export async function fetchProfile(username: string): Promise<Profile | null> {
  const { data, error } = await getSupabase().rpc('get_profile', { p_username: username })
  if (error) throw error
  const fila = Array.isArray(data) ? data[0] : data
  const perfil = profileFromRow(fila)
  /* La función pública no devuelve la visibilidad de otro —no es asunto de
     quien mira— así que se completa con lo único que se puede afirmar: si te lo
     está devolviendo, es porque se deja ver. */
  return perfil ? { ...perfil, visibility: 'publico' } : null
}
