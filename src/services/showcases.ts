import { artworkSource } from '../lib/artwork'
import { getSupabase, SUPABASE_ANON_KEY } from '../lib/supabase'
import { temaDe, type Tema } from '../lib/tema'
import type { Encuadre } from './profile'

/** Un encuadre del payload, o null. Mismo criterio que en `profile`. */
function encuadreDe(v: unknown): Encuadre | null {
  const r = v as Record<string, unknown> | null
  if (!r || typeof r !== 'object') return null
  const { x, y, escala, rotacion } = r
  if (typeof x !== 'number' || typeof y !== 'number' || typeof escala !== 'number') return null
  return typeof rotacion === 'number' && Number.isFinite(rotacion) && rotacion !== 0
    ? { x, y, escala, rotacion }
    : { x, y, escala }
}

/**
 * Las vitrinas de un perfil.
 *
 * La idea viene de Steam: el perfil no es una plantilla fija sino una lista
 * ordenada de bloques que quien lo arma elige. Acá los bloques son de música —
 * una canción fijada, un fragmento, una lista, un texto suelto— más las piezas
 * de composición que hacen que el mosaico tenga capítulos: un encabezado y un
 * espacio.
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
  | 'encabezado'
  | 'espaciador'
  | 'subspace'

/** Cómo se llama cada tipo, para las hojas del editor. */
export const ROTULO_TIPO: Record<ShowcaseKind, string> = {
  cancion: 'Canción',
  fragmento: 'Fragmento',
  lista: 'Lista',
  texto: 'Texto',
  imagen: 'Imagen',
  artista: 'Artista',
  album: 'Álbum',
  letra: 'Letras',
  encabezado: 'Encabezado de sección',
  espaciador: 'Espaciador',
  subspace: 'Sub-space',
}

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

/**
 * Los tamaños que admite cada tipo.
 *
 * Un encabezado y un espacio no tienen «grande»: son una línea y un hueco, y
 * el 2×2 les daría el doble de alto a algo que no tiene con qué llenarlo.
 */
export function anchosDe(kind: ShowcaseKind): ShowcaseAncho[] {
  return kind === 'encabezado' || kind === 'espaciador'
    ? ['mitad', 'entero']
    : ['mitad', 'entero', 'grande']
}

/** El tamaño que sigue al tocar el control: chico → mediano → grande → chico. */
export function siguienteAncho(ancho: ShowcaseAncho, kind: ShowcaseKind = 'cancion'): ShowcaseAncho {
  const anchos = anchosDe(kind)
  return anchos[(anchos.indexOf(ancho) + 1) % anchos.length]
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
 * La tapa es opcional —los versos fijados desde la letra no la traían— y la
 * vitrina la dibuja solo si está.
 */
export type ShowcaseLetra = {
  texto: string
  title: string
  artist: string
  artworkUrl?: string
}

/**
 * Cómo se viste una vitrina: su tema y la imagen que va detrás.
 *
 * Va aparte del contenido, en su propia columna (ver la migración
 * `space_del_perfil`): elegir otra canción no toca el tema, y cambiar el tema
 * no toca la canción. `tema` en `null` no es «sin tema»: es «sin opinión», y
 * entonces la vitrina hereda el del perfil (ver `lib/tema`).
 */
export type ShowcaseEstilo = {
  presentacion?: 'portada' | 'reproductor' | 'completa'
  tema: Tema | null
  fondo: ShowcaseImagen | null
  /** La tipografía de las piezas de texto; `null` es la del sistema. Ver `lib/fuentes`. */
  fuente: string | null
}

export const SIN_ESTILO: ShowcaseEstilo = { tema: null, fondo: null, fuente: null }

/** Lo que muestra una vitrina, sin su identidad ni su tamaño. */
export type ShowcaseContenido =
  | { kind: 'cancion'; cancion: ShowcaseCancion }
  | { kind: 'fragmento'; cancion: ShowcaseCancion }
  | { kind: 'lista'; playlistId: string }
  | { kind: 'texto'; texto: string }
  | { kind: 'imagen'; imagen: ShowcaseImagen }
  | { kind: 'artista'; artista: ShowcaseArtista }
  | { kind: 'album'; album: ShowcaseAlbum }
  | { kind: 'letra'; letra: ShowcaseLetra }
  | { kind: 'encabezado'; titulo: string }
  | { kind: 'espaciador' }
  /**
   * Un mosaico dentro de una pieza: la pieza paga del Space de Airbuds.
   *
   * Acá solo vive el título. Las piezas de adentro son vitrinas comunes de la
   * misma tabla con `parent_id` apuntando a esta (ver la migración
   * `subspace`); se leen con `listShowcases(owner, id)` y se dibujan con el
   * mismo `Vitrinas` del perfil.
   */
  | { kind: 'subspace'; titulo: string }

type Base = { id: string; ancho: ShowcaseAncho; estilo: ShowcaseEstilo }

export type Showcase = Base & ShowcaseContenido

type Row = {
  id?: unknown
  kind?: unknown
  payload?: unknown
  ancho?: unknown
  estilo?: unknown
}

/** El estilo de una fila, o el vacío si no hay o no se entiende. */
function estiloDe(v: unknown): ShowcaseEstilo {
  const r = v as Record<string, unknown> | null
  if (!r || typeof r !== 'object') return SIN_ESTILO
  const fondo = r.fondo as Record<string, unknown> | null
  return {
    presentacion:
      r.presentacion === 'portada' || r.presentacion === 'reproductor'
        ? r.presentacion
        : 'completa',
    tema: temaDe(r.tema),
    fondo:
      fondo && typeof fondo === 'object' && typeof fondo.path === 'string' && fondo.path
        ? { path: fondo.path, encuadre: encuadreDe(fondo.encuadre) }
        : null,
    fuente: typeof r.fuente === 'string' && r.fuente ? r.fuente : null,
  }
}

/**
 * El contenido de una fila, o `null` si no se entiende.
 *
 * Se descarta en silencio en vez de romper la pantalla: el contenido es JSON
 * libre, y una vitrina guardada por una versión más nueva de la app —o a mano—
 * no puede dejar el perfil entero en blanco. Es el mismo criterio que ya usa la
 * cola guardada al restaurarse.
 */
function contenidoDe(kind: string, p: Record<string, unknown>): ShowcaseContenido | null {
  if (kind === 'texto') {
    return typeof p.texto === 'string' && p.texto.trim() ? { kind: 'texto', texto: p.texto } : null
  }

  if (kind === 'encabezado') {
    return typeof p.titulo === 'string' && p.titulo.trim()
      ? { kind: 'encabezado', titulo: p.titulo }
      : null
  }

  if (kind === 'espaciador') return { kind: 'espaciador' }

  if (kind === 'subspace') {
    return typeof p.titulo === 'string' && p.titulo.trim()
      ? { kind: 'subspace', titulo: p.titulo }
      : null
  }

  if (kind === 'lista') {
    return typeof p.playlistId === 'string' ? { kind: 'lista', playlistId: p.playlistId } : null
  }

  if (kind === 'artista') {
    if (typeof p.artistId !== 'string' || typeof p.nombre !== 'string') return null
    return {
      kind: 'artista',
      artista: {
        artistId: p.artistId,
        nombre: p.nombre,
        fotoUrl: typeof p.fotoUrl === 'string' ? p.fotoUrl : '',
      },
    }
  }

  if (kind === 'album') {
    if (typeof p.albumId !== 'string' || typeof p.titulo !== 'string') return null
    return {
      kind: 'album',
      album: {
        albumId: p.albumId,
        titulo: p.titulo,
        artista: typeof p.artista === 'string' ? p.artista : '',
        tapaUrl: typeof p.tapaUrl === 'string' ? p.tapaUrl : '',
      },
    }
  }

  if (kind === 'letra') {
    if (typeof p.texto !== 'string' || !p.texto.trim()) return null
    return {
      kind: 'letra',
      letra: {
        texto: p.texto,
        title: typeof p.title === 'string' ? p.title : '',
        artist: typeof p.artist === 'string' ? p.artist : '',
        artworkUrl: typeof p.artworkUrl === 'string' && p.artworkUrl ? p.artworkUrl : undefined,
      },
    }
  }

  /* `ilustracion` es el nombre viejo de lo mismo: quedó en el check de la base
     de cuando esto era «la pieza grande del centro» de Steam. Se lee igual para
     no perder ninguna que haya quedado guardada. */
  if (kind === 'imagen' || kind === 'ilustracion') {
    if (typeof p.path !== 'string' || !p.path) return null
    return { kind: 'imagen', imagen: { path: p.path, encuadre: encuadreDe(p.encuadre) } }
  }

  if (kind === 'cancion' || kind === 'fragmento') {
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
    return { kind, cancion }
  }

  return null
}

function showcaseFromRow(row: Row): Showcase | null {
  if (typeof row.id !== 'string' || typeof row.kind !== 'string') return null
  const contenido = contenidoDe(row.kind, (row.payload ?? {}) as Record<string, unknown>)
  if (!contenido) return null
  /* Ante cualquier cosa rara, entero: es como se dibujaba antes de que el
     ancho existiera, así que lo desconocido cae en lo de siempre. Y dentro de
     lo que su tipo admite: un encabezado guardado como grande baja a entero. */
  const pedido: ShowcaseAncho =
    row.ancho === 'mitad' ? 'mitad' : row.ancho === 'grande' ? 'grande' : 'entero'
  const ancho = anchosDe(contenido.kind).includes(pedido) ? pedido : 'entero'
  return { id: row.id, ancho, estilo: estiloDe(row.estilo), ...contenido }
}

/**
 * Del contenido al JSON que se guarda. Es la inversa de `contenidoDe`, y vive
 * al lado suyo para que las dos se lean juntas: lo que una escribe la otra lo
 * tiene que entender.
 */
export function payloadDe(contenido: ShowcaseContenido): Record<string, unknown> {
  switch (contenido.kind) {
    case 'cancion':
    case 'fragmento':
      return { ...contenido.cancion }
    case 'lista':
      return { playlistId: contenido.playlistId }
    case 'texto':
      return { texto: contenido.texto }
    case 'imagen':
      return { ...contenido.imagen }
    case 'artista':
      return { ...contenido.artista }
    case 'album':
      return { ...contenido.album }
    case 'letra':
      return { ...contenido.letra }
    case 'encabezado':
    case 'subspace':
      return { titulo: contenido.titulo }
    case 'espaciador':
      return {}
  }
}

/**
 * De dónde sacar la tapa de cada tipo: la carátula, la cara del artista, la
 * imagen fijada. `null` si no tiene —un texto, un espacio, un sub-space—.
 *
 * La usan dos cosas: el tema «de la tapa», que le lee el color, y la vista
 * previa de un sub-space, que muestra las tapas de sus primeras piezas. Vive
 * acá y no en la vitrina porque la segunda la necesita antes de dibujar nada.
 */
export function tapaDe(v: Showcase): string | null {
  switch (v.kind) {
    case 'cancion':
    case 'fragmento':
      return artworkSource(v.cancion.artworkPath ?? undefined, v.cancion.artworkUrl, 96)
    case 'artista':
      return v.artista.fotoUrl || null
    case 'album':
      return v.album.tapaUrl || null
    case 'letra':
      return v.letra.artworkUrl ?? null
    case 'imagen':
      return ilustracionUrl(v.imagen.path)
    default:
      return null
  }
}

/** El estilo al JSON de la base. Lo vacío viaja como `{}`, que es el default. */
function estiloParaLaBase(estilo: ShowcaseEstilo): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (estilo.presentacion) out.presentacion = estilo.presentacion
  if (estilo.tema) out.tema = estilo.tema
  if (estilo.fondo) out.fondo = estilo.fondo
  if (estilo.fuente) out.fuente = estilo.fuente
  return out
}

/**
 * Las vitrinas de un mosaico, en su orden. Se leen entre todos.
 *
 * Sin `parentId` es el mosaico principal del perfil; con el id de un
 * sub-space, las piezas que tiene adentro. Son dos consultas con la misma
 * forma porque son dos mosaicos con la misma forma: lo único que cambia es a
 * qué pieza pertenecen.
 */
export async function listShowcases(ownerId: string, parentId: string | null = null): Promise<Showcase[]> {
  let consulta = getSupabase()
    .from('profile_showcases')
    .select('id, kind, payload, ancho, estilo')
    .eq('owner_id', ownerId)
  /* `null` no se compara con `eq`: en SQL nada es igual a null. */
  consulta = parentId ? consulta.eq('parent_id', parentId) : consulta.is('parent_id', null)
  const { data, error } = await consulta.order('position', { ascending: true })
  if (error) throw error
  return (data ?? []).map(showcaseFromRow).filter((s): s is Showcase => s !== null)
}

/** Una vitrina sola, por id. `null` si no está o no se entiende. */
export async function fetchShowcase(id: string): Promise<Showcase | null> {
  const { data, error } = await getSupabase()
    .from('profile_showcases')
    .select('id, kind, payload, ancho, estilo')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? showcaseFromRow(data) : null
}

/** Cuántas piezas hay dentro de un mosaico, sin traerlas. */
export async function countShowcases(ownerId: string, parentId: string | null): Promise<number> {
  let consulta = getSupabase()
    .from('profile_showcases')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', ownerId)
  consulta = parentId ? consulta.eq('parent_id', parentId) : consulta.is('parent_id', null)
  const { count, error } = await consulta
  if (error) throw error
  return count ?? 0
}

/** Lo que muestra la tarjeta de un sub-space sobre lo que tiene adentro. */
export type Miniaturas = {
  /** Las tapas de sus primeras piezas, hasta cuatro: la grilla de 2×2. */
  tapas: string[]
  /** Cuántas piezas hay en total, con o sin tapa. */
  cuantas: number
}

/**
 * La vista previa de un sub-space: las primeras tapas y la cuenta.
 *
 * Se piden las piezas de adentro y se sacan las tapas de las que tienen —un
 * texto o un encabezado no aportan imagen y se saltean—. Va por `parent_id`
 * solo, sin dueño: la tarjeta que lo pide no sabe de quién es el mosaico, y
 * la RLS ya decide qué se ve.
 */
export async function listMiniaturas(parentId: string): Promise<Miniaturas> {
  const { data, error } = await getSupabase()
    .from('profile_showcases')
    .select('id, kind, payload, ancho, estilo')
    .eq('parent_id', parentId)
    .order('position', { ascending: true })
  if (error) throw error
  const hijas = (data ?? []).map(showcaseFromRow).filter((s): s is Showcase => s !== null)
  const tapas: string[] = []
  for (const h of hijas) {
    const tapa = tapaDe(h)
    if (tapa) tapas.push(tapa)
    if (tapas.length === 4) break
  }
  return { tapas, cuantas: hijas.length }
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
  estilo: ShowcaseEstilo = SIN_ESTILO,
  /* Dentro de qué sub-space; `null` es el mosaico principal. La posición se
     cuenta dentro del mismo padre: cada mosaico tiene su propio orden. */
  parentId: string | null = null,
): Promise<string> {
  const position = await countShowcases(ownerId, parentId)

  const { data, error } = await getSupabase()
    .from('profile_showcases')
    .insert({
      owner_id: ownerId,
      kind,
      position,
      payload,
      ancho,
      estilo: estiloParaLaBase(estilo),
      parent_id: parentId,
    })
    .select('id')
    .single()
  if (error) throw error
  /* El id vuelve para quien lo necesite enseguida: un sub-space recién
     creado se abre para armarlo adentro, sin volver a buscarlo. */
  return (data as { id: string }).id
}

/**
 * Cambia lo que muestra una vitrina, cómo se viste, o las dos cosas.
 *
 * Lo que no se manda queda como está. Es lo que usa el editor de la vitrina
 * al guardar: puede haber cambiado solo el tema, o solo la canción.
 */
export async function updateShowcase(
  id: string,
  cambios: { payload?: Record<string, unknown>; estilo?: ShowcaseEstilo; ancho?: ShowcaseAncho },
): Promise<void> {
  const patch: Record<string, unknown> = {}
  if (cambios.payload) patch.payload = cambios.payload
  if (cambios.estilo) patch.estilo = estiloParaLaBase(cambios.estilo)
  if (cambios.ancho) patch.ancho = cambios.ancho
  if (!Object.keys(patch).length) return
  const { error } = await getSupabase().from('profile_showcases').update(patch).eq('id', id)
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
 * Sube una imagen y devuelve su ruta. Va en la carpeta de su dueño.
 *
 * Se llama «ilustración» por el bucket, que es el mismo de siempre. Sirve para
 * el fondo del perfil, para una vitrina de imagen y para la imagen que va
 * detrás de cualquier vitrina: son tres usos del mismo archivo subido.
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
  validarIlustracion(file, mime)
  const path = rutaDeIlustracion(ownerId, fileName)
  const { error } = await getSupabase()
    .storage.from('showcases')
    .upload(path, file, { contentType: mime, upsert: true })
  if (error) throw error
  return path
}

/**
 * La misma subida, **avisando cuánto va**.
 *
 * storage-js sube con `fetch` y no cuenta bytes. Para ver una barra de verdad
 * —el fondo del perfil puede ser un clip de 25 MB— se pide una URL firmada
 * de subida y se manda el archivo con `XMLHttpRequest`, que sí avisa
 * (`upload.onprogress`). Es el mismo camino que usan los aportes de canciones
 * (URL firmada → PUT → confirmar), acá con el progreso en el medio.
 *
 * `onProgreso` recibe una fracción de 0 a 1, y 1 al terminar, siempre.
 */
export async function uploadIlustracionConProgreso(
  ownerId: string,
  file: Blob | ArrayBuffer,
  fileName: string,
  mime: string,
  onProgreso: (fraccion: number) => void,
): Promise<string> {
  validarIlustracion(file, mime)
  const path = rutaDeIlustracion(ownerId, fileName)
  const supabase = getSupabase()
  const { data, error } = await supabase.storage
    .from('showcases')
    .createSignedUploadUrl(path, { upsert: true })
  if (error || !data) throw error ?? new Error('No se pudo preparar la subida.')
  const { data: sesion } = await supabase.auth.getSession()
  const token = sesion.session?.access_token

  await new Promise<void>((resolver, rechazar) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', data.signedUrl)
    xhr.setRequestHeader('Content-Type', mime)
    xhr.setRequestHeader('x-upsert', 'true')
    if (SUPABASE_ANON_KEY) xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY)
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgreso(Math.min(0.99, e.loaded / e.total))
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolver()
        : rechazar(new Error(`No se pudo subir (${xhr.status}).`))
    xhr.onerror = () => rechazar(new Error('No se pudo subir. ¿Hay conexión?'))
    xhr.send(file)
  })
  onProgreso(1)
  return path
}

/** Espejo de lo que acepta el bucket: rechazar acá evita mandar veinte megas
 *  para que el servidor diga que no. */
function validarIlustracion(file: Blob | ArrayBuffer, mime: string) {
  if (!TIPOS_VITRINA.includes(mime)) {
    throw new Error('Tiene que ser una imagen (JPG, PNG, WebP, GIF) o un video MP4.')
  }
  const peso = file instanceof Blob ? file.size : file.byteLength
  if (peso > VITRINA_MAX_BYTES) {
    throw new Error('No puede pesar más de 25 MB.')
  }
}

/** La carpeta es el id de quien sube: la policy del bucket lo exige, y es lo
 *  que impide pisar la ilustración de otro. */
function rutaDeIlustracion(ownerId: string, fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  return `${ownerId}/${Date.now()}.${ext}`
}

/** La URL pública de una ilustración. El bucket es público, no hay que firmar. */
export function ilustracionUrl(path: string): string {
  return getSupabase().storage.from('showcases').getPublicUrl(path).data.publicUrl
}
