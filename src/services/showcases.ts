import { getSupabase } from '../lib/supabase'
import type { Encuadre } from './profile'

/** Un encuadre del payload, o null. Mismo criterio que en `profile`. */
function encuadreDe(v: unknown): Encuadre | null {
  const r = v as Record<string, unknown> | null
  if (!r || typeof r !== 'object') return null
  const { x, y, escala } = r
  if (typeof x !== 'number' || typeof y !== 'number' || typeof escala !== 'number') return null
  return { x, y, escala }
}

/**
 * Las vitrinas de un perfil.
 *
 * La idea viene de Steam: el perfil no es una plantilla fija sino una lista
 * ordenada de bloques que quien lo arma elige. Acá los bloques son de música —
 * una canción fijada, un fragmento, una lista, un texto suelto.
 *
 * Cada tipo guarda cosas distintas, así que el contenido va en un JSON y la
 * validación de su forma vive **acá**, que es el único lugar que escribe en esa
 * tabla. La base solo garantiza el tipo y el dueño.
 */

export type ShowcaseKind =
  | 'cancion'
  | 'fragmento'
  | 'lista'
  | 'texto'
  | 'imagen'
  | 'artista'
  | 'album'
  | 'letra'

/**
 * Cuánto ocupa una vitrina: el modelo de los widgets de iOS.
 *
 * `mitad` es el chico (1×1), `entero` el mediano (2×1) y `grande` el 2×2 — la
 * fila entera con el doble de presencia vertical. Tres tamaños cerrados y no
 * una grilla libre: con tamaños arbitrarios cada perfil necesita su propio
 * criterio de qué entra en una fila, y lo que se gana en libertad se pierde en
 * que ningún perfil se ve bien sin trabajarlo. Con estos tres, cualquier
 * combinación cierra sola.
 */
export type ShowcaseAncho = 'entero' | 'mitad' | 'grande'

/** El tamaño que sigue al tocar el control: chico → mediano → grande → chico. */
export function siguienteAncho(ancho: ShowcaseAncho): ShowcaseAncho {
  return ancho === 'mitad' ? 'entero' : ancho === 'entero' ? 'grande' : 'mitad'
}

/** Una canción fijada, o el fragmento de una. */
export type ShowcaseCancion = {
  videoId: string
  title: string
  artist: string
  artworkUrl: string
  artworkPath: string | null
  audioPath: string
  durationMs: number
  /**
   * El recorte, solo en los fragmentos.
   *
   * Es el mismo par que ya viaja en un mensaje con canción, así que un
   * fragmento que mandaste se puede fijar en el perfil sin convertir nada.
   */
  startMs?: number
  endMs?: number
}

/** Una imagen fijada. Guarda su encuadre, igual que la foto de perfil. */
export type ShowcaseImagen = {
  /** Ruta dentro del bucket `showcases`. */
  path: string
  encuadre: Encuadre | null
}

/** Un artista fijado. Todo desnormalizado: la vitrina no vuelve a preguntar. */
export type ShowcaseArtista = {
  artistId: string
  nombre: string
  fotoUrl: string
}

/** Un álbum fijado. */
export type ShowcaseAlbum = {
  albumId: string
  titulo: string
  artista: string
  tapaUrl: string
}

/**
 * Un verso fijado: unas líneas de la letra, con de qué canción son.
 *
 * El texto viaja congelado, como todo lo demás: la letra se pidió una vez al
 * fijar y la vitrina no depende de que el servicio de letras siga contestando.
 */
export type ShowcaseLetra = {
  texto: string
  title: string
  artist: string
}

type Base = { id: string; ancho: ShowcaseAncho }

export type Showcase =
  | (Base & { kind: 'cancion'; cancion: ShowcaseCancion })
  | (Base & { kind: 'fragmento'; cancion: ShowcaseCancion })
  | (Base & { kind: 'lista'; playlistId: string })
  | (Base & { kind: 'texto'; texto: string })
  | (Base & { kind: 'imagen'; imagen: ShowcaseImagen })
  | (Base & { kind: 'artista'; artista: ShowcaseArtista })
  | (Base & { kind: 'album'; album: ShowcaseAlbum })
  | (Base & { kind: 'letra'; letra: ShowcaseLetra })

type Row = {
  id?: unknown
  kind?: unknown
  payload?: unknown
  ancho?: unknown
}

/**
 * Una fila cruda, o `null` si no se entiende.
 *
 * Se descarta en silencio en vez de romper la pantalla: el contenido es JSON
 * libre, y una vitrina guardada por una versión más nueva de la app —o a mano—
 * no puede dejar el perfil entero en blanco. Es el mismo criterio que ya usa la
 * cola guardada al restaurarse.
 */
function showcaseFromRow(row: Row): Showcase | null {
  if (typeof row.id !== 'string' || typeof row.kind !== 'string') return null
  const p = (row.payload ?? {}) as Record<string, unknown>
  /* Ante cualquier cosa rara, entero: es como se dibujaba antes de que el
     ancho existiera, así que lo desconocido cae en lo de siempre. */
  const ancho: ShowcaseAncho =
    row.ancho === 'mitad' ? 'mitad' : row.ancho === 'grande' ? 'grande' : 'entero'
  const base = { id: row.id, ancho }

  if (row.kind === 'texto') {
    return typeof p.texto === 'string' && p.texto.trim()
      ? { ...base, kind: 'texto', texto: p.texto }
      : null
  }

  if (row.kind === 'lista') {
    return typeof p.playlistId === 'string'
      ? { ...base, kind: 'lista', playlistId: p.playlistId }
      : null
  }

  if (row.kind === 'artista') {
    if (typeof p.artistId !== 'string' || typeof p.nombre !== 'string') return null
    return {
      ...base,
      kind: 'artista',
      artista: {
        artistId: p.artistId,
        nombre: p.nombre,
        fotoUrl: typeof p.fotoUrl === 'string' ? p.fotoUrl : '',
      },
    }
  }

  if (row.kind === 'album') {
    if (typeof p.albumId !== 'string' || typeof p.titulo !== 'string') return null
    return {
      ...base,
      kind: 'album',
      album: {
        albumId: p.albumId,
        titulo: p.titulo,
        artista: typeof p.artista === 'string' ? p.artista : '',
        tapaUrl: typeof p.tapaUrl === 'string' ? p.tapaUrl : '',
      },
    }
  }

  if (row.kind === 'letra') {
    if (typeof p.texto !== 'string' || !p.texto.trim()) return null
    return {
      ...base,
      kind: 'letra',
      letra: {
        texto: p.texto,
        title: typeof p.title === 'string' ? p.title : '',
        artist: typeof p.artist === 'string' ? p.artist : '',
      },
    }
  }

  /* `ilustracion` es el nombre viejo de lo mismo: quedó en el check de la base
     de cuando esto era «la pieza grande del centro» de Steam. Se lee igual para
     no perder ninguna que haya quedado guardada. */
  if (row.kind === 'imagen' || row.kind === 'ilustracion') {
    if (typeof p.path !== 'string' || !p.path) return null
    return {
      ...base,
      kind: 'imagen',
      imagen: { path: p.path, encuadre: encuadreDe(p.encuadre) },
    }
  }

  if (row.kind === 'cancion' || row.kind === 'fragmento') {
    if (typeof p.videoId !== 'string' || typeof p.audioPath !== 'string') return null
    const cancion: ShowcaseCancion = {
      videoId: p.videoId,
      title: typeof p.title === 'string' ? p.title : '',
      artist: typeof p.artist === 'string' ? p.artist : '',
      artworkUrl: typeof p.artworkUrl === 'string' ? p.artworkUrl : '',
      artworkPath: typeof p.artworkPath === 'string' ? p.artworkPath : null,
      audioPath: p.audioPath,
      durationMs: typeof p.durationMs === 'number' ? p.durationMs : 0,
      startMs: typeof p.startMs === 'number' ? p.startMs : undefined,
      endMs: typeof p.endMs === 'number' ? p.endMs : undefined,
    }
    return { ...base, kind: row.kind, cancion }
  }

  return null
}

/** Las vitrinas de alguien, en su orden. Se leen entre todos. */
export async function listShowcases(ownerId: string): Promise<Showcase[]> {
  const { data, error } = await getSupabase()
    .from('profile_showcases')
    .select('id, kind, payload, ancho')
    .eq('owner_id', ownerId)
    .order('position', { ascending: true })
  if (error) throw error
  return (data ?? []).map(showcaseFromRow).filter((s): s is Showcase => s !== null)
}

/**
 * Suma una vitrina al final.
 *
 * La posición se calcula acá con la cantidad que ya hay, y no con un contador
 * en la base: entre dos personas nadie va a agregar dos al mismo tiempo, y una
 * secuencia sería más maquinaria de la que el problema pide.
 */
export async function addShowcase(
  ownerId: string,
  kind: ShowcaseKind,
  payload: Record<string, unknown>,
  /* Entero salvo que se pida otra cosa: es como se fijaba todo antes de que el
     ancho existiera, así que quien no lo sepa sigue obteniendo lo de siempre. */
  ancho: ShowcaseAncho = 'entero',
): Promise<void> {
  const { count, error: countError } = await getSupabase()
    .from('profile_showcases')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', ownerId)
  if (countError) throw countError

  const { error } = await getSupabase()
    .from('profile_showcases')
    .insert({ owner_id: ownerId, kind, position: count ?? 0, payload, ancho })
  if (error) throw error
}

/**
 * Cambia cuánto ocupa una vitrina en su fila.
 *
 * Va aparte de `reorderShowcases` aunque las dos reacomoden el mosaico: el
 * orden es de todas a la vez y el ancho es de una sola, así que mezclarlas
 * obligaría a mandar la lista entera para mover un solo control.
 */
export async function setShowcaseAncho(id: string, ancho: ShowcaseAncho): Promise<void> {
  const { error } = await getSupabase().from('profile_showcases').update({ ancho }).eq('id', id)
  if (error) throw error
}

export async function removeShowcase(id: string): Promise<void> {
  const { error } = await getSupabase().from('profile_showcases').delete().eq('id', id)
  if (error) throw error
}

/**
 * Reacomoda: recibe los ids en el orden nuevo y les reescribe la posición.
 *
 * Se mandan todas y no solo la que se movió porque las posiciones son relativas
 * entre sí: mover una cambia el lugar de todas las que estaban en el medio.
 */
export async function reorderShowcases(ids: string[]): Promise<void> {
  const supabase = getSupabase()
  await Promise.all(
    ids.map((id, position) =>
      supabase.from('profile_showcases').update({ position }).eq('id', id),
    ),
  )
}

const TIPOS_VITRINA = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
]
const VITRINA_MAX_BYTES = 25 * 1024 * 1024

/** Si esa ruta es un clip y no una imagen. Lo mira el fondo para dibujarlo. */
export function esVideo(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return ext === 'mp4' || ext === 'mov'
}

/**
 * Sube una imagen de fondo y devuelve su ruta. Va en la carpeta de su dueño.
 *
 * Se llama «ilustración» por el bucket, que es el mismo de siempre. Ya no hay
 * vitrina de ilustración: una imagen subida es **el fondo del perfil** y nada
 * más — tenerla además como tarjeta era la misma imagen en dos lugares, y la
 * tarjeta ganaba siempre porque estaba en la columna del medio.
 */
export async function uploadIlustracion(
  ownerId: string,
  /* ArrayBuffer en el teléfono, File en la web. Ver `PickedImage.blob`: con un
     Blob, storage-js ignora el contentType y viajaba `text/plain`. */
  file: Blob | ArrayBuffer,
  fileName: string,
  /* Igual que el avatar: el tipo lo trae el selector, no el Blob. */
  mime = file instanceof Blob ? file.type : '',
): Promise<string> {
  /* Espejo de lo que acepta el bucket: rechazar acá evita mandar veinte megas
     para que el servidor diga que no. */
  if (!TIPOS_VITRINA.includes(mime)) {
    throw new Error('Tiene que ser una imagen (JPG, PNG, WebP, GIF) o un video MP4.')
  }
  const peso = file instanceof Blob ? file.size : file.byteLength
  if (peso > VITRINA_MAX_BYTES) {
    throw new Error('No puede pesar más de 25 MB.')
  }

  const ext = fileName.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  /* La carpeta es el id de quien sube: la policy del bucket lo exige, y es lo
     que impide pisar la ilustración de otro. */
  const path = `${ownerId}/${Date.now()}.${ext}`

  const { error } = await getSupabase()
    .storage.from('showcases')
    .upload(path, file, { contentType: mime, upsert: true })
  if (error) throw error
  return path
}

/** La URL pública de una ilustración. El bucket es público, no hay que firmar. */
export function ilustracionUrl(path: string): string {
  return getSupabase().storage.from('showcases').getPublicUrl(path).data.publicUrl
}
