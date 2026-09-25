import { getSupabase } from '../lib/supabase'
import { assertStorageBudget } from './storageBudget'

/**
 * Listas de reproducción propias.
 *
 * Una canción de lista es el **tema entero**, no un recorte: eso es lo que la
 * distingue del `SongSnippet` de un mensaje, que lleva inicio, duración y
 * letra del fragmento. Comparten el resto de los campos porque comparten
 * origen — el mismo buscador y el mismo audio en Storage.
 */

/**
 * Quién puede verla.
 *
 * `publica` es «cualquiera con una cuenta», no «cualquiera en Internet»: el
 * link abre la app y sin sesión pasa primero por entrar. Ver la migración
 * `listas_publicas`.
 */
export type Visibilidad = 'privada' | 'publica'

export type Playlist = {
  id: string
  name: string
  /** Cuántas canciones tiene. */
  tracks: number
  updatedAt: Date | null
  /** Rutas o URLs de las primeras carátulas, para el mosaico de la portada. */
  covers: string[]
  /** Portada propia dentro del bucket `covers`; gana sobre el mosaico. */
  coverPath: string | null
  /** Cuánto dura la lista entera. */
  totalMs: number
  visibilidad: Visibilidad
  /**
   * La escribe más gente que su dueño.
   *
   * Es **ortogonal a `visibilidad`**: colaborativa dice quién la edita, pública
   * dice quién la lee. Lo normal es una colaborativa privada — la escriben tres
   * personas y no la ve nadie más.
   */
  colaborativa: boolean
  /** Sos el dueño. En las colaborativas ajenas es false y cambia lo que se puede. */
  mia: boolean
  /** Cuánta gente colabora, sin contar al dueño. */
  colaboradores: number
}

/** Alguien que escribe una lista colaborativa. El dueño va primero y marcado. */
export type Colaborador = {
  id: string
  username: string
  displayName: string | null
  avatarPath: string | null
  esDueño: boolean
}

/** Una lista de otra persona: la lista, más de quién es. */
export type ListaAjena = {
  playlist: Playlist
  dueño: {
    id: string
    username: string
    displayName: string | null
    avatarPath: string | null
  }
  /** Es tuya: se llegó por el link a una propia. */
  mia: boolean
  /**
   * Podés escribirla: sos el dueño **o** ya colaborás.
   *
   * Va aparte de `mia` porque son dos preguntas distintas y la pantalla usa las
   * dos: `mia` decide si mostrar «guardar una copia», `puedoEditar` decide si
   * mostrar el buscador para sumar canciones.
   */
  puedoEditar: boolean
}

export type PlaylistTrack = {
  id: string
  videoId: string
  title: string
  artist: string
  /** Canal del artista; null en las canciones guardadas antes de que se guardara. */
  artistId: string | null
  artworkUrl: string
  artworkPath: string | null
  /** Ruta del audio en el bucket `songs`; se firma al reproducir. */
  audioPath: string
  durationMs: number
  truePeak: number | undefined
}

type PlaylistRow = {
  id?: unknown
  name?: unknown
  tracks?: unknown
  updated_at?: unknown
  covers?: unknown
  cover_path?: unknown
  total_ms?: unknown
  visibilidad?: unknown
  colaborativa?: unknown
  mia?: unknown
  colaboradores?: unknown
}

function playlistFromRow(row: PlaylistRow): Playlist[] {
  if (typeof row.id !== 'string' || typeof row.name !== 'string') return []
  const updated = typeof row.updated_at === 'string' ? new Date(row.updated_at) : null
  return [
    {
      id: row.id,
      name: row.name,
      tracks: typeof row.tracks === 'number' ? row.tracks : Number(row.tracks ?? 0),
      updatedAt: updated && !Number.isNaN(updated.getTime()) ? updated : null,
      covers: Array.isArray(row.covers)
        ? row.covers.filter((c): c is string => typeof c === 'string' && c.length > 0)
        : [],
      coverPath: typeof row.cover_path === 'string' ? row.cover_path : null,
      totalMs: Number(row.total_ms ?? 0),
      // Ante cualquier cosa rara, privada: el default seguro es no publicar.
      visibilidad: row.visibilidad === 'publica' ? 'publica' : 'privada',
      colaborativa: row.colaborativa === true,
      /*
       * `mia` solo viaja en la biblioteca propia y en la lista por link. Donde
       * no viene —las públicas de un perfil ajeno— la comparación estricta da
       * false, que es la respuesta correcta: sin el dato, no es tuya. Es el
       * mismo criterio conservador que `visibilidad`.
       */
      mia: row.mia === true,
      colaboradores: Number(row.colaboradores ?? 0),
    },
  ]
}

export async function listPlaylists(): Promise<Playlist[]> {
  const { data, error } = await getSupabase().rpc('list_my_playlists')
  if (error) throw error
  return (data ?? []).flatMap(playlistFromRow)
}

export async function createPlaylist(
  name: string,
  { colaborativa = false }: { colaborativa?: boolean } = {},
): Promise<Playlist> {
  const clean = name.trim()
  if (!clean) throw new Error('Poné un nombre para la lista.')

  const { data, error } = await getSupabase()
    .from('playlists')
    .insert({ name: clean, colaborativa })
    .select('id, name, updated_at')
    .single()
  if (error) throw error

  return {
    id: data.id as string,
    name: data.name as string,
    tracks: 0,
    updatedAt: null,
    covers: [],
    coverPath: null,
    totalMs: 0,
    // Nace privada aunque sea colaborativa: que la escriban tres personas no
    // quiere decir que la lea todo el mundo. Son dos permisos distintos.
    visibilidad: 'privada',
    colaborativa,
    mia: true,
    colaboradores: 0,
  }
}

/**
 * Publica una lista o la vuelve a guardar.
 *
 * No toca `updated_at`: publicar no es editar la lista, y moverla al principio
 * de la biblioteca por haberla compartido reordenaría lo que estás mirando sin
 * que hayas cambiado una canción.
 */
/** Los perfiles abiertos invalidan su lectura después de confirmar la escritura. */
const publicPlaylistListeners = new Set<(ownerId: string) => void>()
export function subscribePublicPlaylistChanges(listener: (ownerId: string) => void): () => void {
  publicPlaylistListeners.add(listener)
  return () => { publicPlaylistListeners.delete(listener) }
}

export async function setPlaylistVisibility(id: string, visibilidad: Visibilidad): Promise<void> {
  const { data, error } = await getSupabase().from('playlists')
    .update({ visibilidad }).eq('id', id).select('id, owner_id, visibilidad').single()
  if (error) throw error
  // PostgREST puede aceptar un UPDATE con cero filas por RLS. Eso no es una
  // publicación confirmada y no debe habilitar el link ni anunciar éxito.
  if (data?.id !== id || data.visibilidad !== visibilidad || typeof data.owner_id !== 'string') {
    throw new Error('No se pudo confirmar la visibilidad de la lista. Volvé a intentar.')
  }
  publicPlaylistListeners.forEach(listener => listener(data.owner_id))
}

/** Las listas que esta persona publicó. Vacío si no publicó ninguna. */
export async function listPublicPlaylists(ownerId: string): Promise<Playlist[]> {
  const { data, error } = await getSupabase().rpc('list_public_playlists', { p_owner: ownerId })
  if (error) throw error
  return (data ?? []).flatMap(playlistFromRow)
}

/**
 * Una lista por su id, para el link compartido.
 *
 * Devuelve `null` cuando no existe **y** cuando existe pero es privada: son la
 * misma respuesta a propósito, así nadie averigua qué ids existen probando.
 */
export async function fetchPublicPlaylist(id: string): Promise<ListaAjena | null> {
  const { data, error } = await getSupabase().rpc('get_public_playlist', { p_id: id })
  if (error) throw error
  const row = (data ?? [])[0] as
    | (PlaylistRow & {
        owner_id?: unknown
        username?: unknown
        display_name?: unknown
        avatar_path?: unknown
        mia?: unknown
        puedo_editar?: unknown
      })
    | undefined
  if (!row) return null
  const playlist = playlistFromRow(row)[0]
  if (!playlist || typeof row.owner_id !== 'string') return null

  return {
    playlist,
    dueño: {
      id: row.owner_id,
      username: typeof row.username === 'string' ? row.username : '',
      displayName: typeof row.display_name === 'string' ? row.display_name : null,
      avatarPath: typeof row.avatar_path === 'string' ? row.avatar_path : null,
    },
    mia: row.mia === true,
    puedoEditar: row.puedo_editar === true,
  }
}

/**
 * Se guarda la lista de otro como una lista tuya, y devuelve el id de la copia.
 *
 * Es una copia del contenido de este momento, no un seguimiento: desde acá son
 * dos listas distintas. Ver `copy_playlist` en la migración, que es donde vive
 * la regla de qué se puede copiar.
 */
export async function copyPlaylist(sourceId: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('copy_playlist', { p_source: sourceId })
  if (error) throw error
  if (typeof data !== 'string' || !data) throw new Error('No se pudo guardar la lista.')
  return data
}

export async function renamePlaylist(id: string, name: string): Promise<void> {
  const clean = name.trim()
  if (!clean) throw new Error('Poné un nombre para la lista.')
  const { error } = await getSupabase()
    .from('playlists')
    .update({ name: clean, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deletePlaylist(id: string): Promise<void> {
  const { error } = await getSupabase().from('playlists').delete().eq('id', id)
  if (error) throw error
}

export async function listTracks(playlistId: string): Promise<PlaylistTrack[]> {
  const { data, error } = await getSupabase()
    .from('playlist_tracks')
    .select(
      'id, video_id, title, artist, artist_id, artwork_url, artwork_path, audio_path, duration_ms, true_peak',
    )
    .eq('playlist_id', playlistId)
    .order('position', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw error

  return (data ?? []).map((r) => ({
    id: r.id as string,
    videoId: (r.video_id as string) ?? '',
    title: (r.title as string) ?? '',
    artist: (r.artist as string) ?? '',
    artistId: (r.artist_id as string | null) ?? null,
    artworkUrl: (r.artwork_url as string) ?? '',
    artworkPath: (r.artwork_path as string | null) ?? null,
    audioPath: (r.audio_path as string) ?? '',
    durationMs: (r.duration_ms as number) ?? 0,
    truePeak: typeof r.true_peak === 'number' ? r.true_peak : undefined,
  }))
}

/** Otro editor cambió el contenido o el orden desde que se abrió la vista previa. */
export class PlaylistOrderConflictError extends Error {
  constructor() {
    super('La lista cambió mientras preparabas el orden. Actualizala y volvé a intentar.')
    this.name = 'PlaylistOrderConflictError'
  }
}

/**
 * Confirma un orden propuesto solo si la playlist todavía tiene exactamente el
 * orden que vio el cliente. La RPC mueve posiciones de las mismas filas, por lo
 * que los IDs usados por las transiciones del Mix siguen siendo válidos.
 */
export async function reorderPlaylistTracks(
  playlistId: string,
  expectedOrder: readonly string[],
  newOrder: readonly string[],
): Promise<string[]> {
  if (!playlistId || !Array.isArray(expectedOrder) || !Array.isArray(newOrder)
    || expectedOrder.some(id => typeof id !== 'string' || !id)
    || newOrder.length !== expectedOrder.length
    || new Set(expectedOrder).size !== expectedOrder.length
    || new Set(newOrder).size !== expectedOrder.length
    || newOrder.some(id => !expectedOrder.includes(id))) {
    throw new Error('El orden propuesto debe contener exactamente las mismas canciones.')
  }
  const { data, error } = await getSupabase().rpc('reorder_playlist_tracks', {
    p_playlist: playlistId,
    p_expected_order: [...expectedOrder],
    p_new_order: [...newOrder],
  })
  if (error) {
    if (error.message.includes('playlist_order_conflict')) throw new PlaylistOrderConflictError()
    throw error
  }
  if (!Array.isArray(data) || data.length !== newOrder.length
    || data.some((id, index) => id !== newOrder[index])) {
    throw new Error('No se pudo confirmar el nuevo orden de la lista.')
  }
  return data as string[]
}

/**
 * Suma una canción al final de la lista.
 *
 * La posición la calcula la base — ver `add_playlist_track`. Devuelve false si
 * la canción ya estaba: no es un error, y quien llama puede decirlo con esas
 * palabras en vez de mostrar una falla.
 */
export async function addTrack(
  playlistId: string,
  track: Omit<PlaylistTrack, 'id'>,
): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('add_playlist_track', {
    p_playlist_id: playlistId,
    p_video_id: track.videoId,
    p_title: track.title,
    p_artist: track.artist,
    p_artist_id: track.artistId,
    p_artwork_url: track.artworkUrl,
    p_artwork_path: track.artworkPath,
    p_audio_path: track.audioPath,
    p_duration_ms: Math.round(track.durationMs),
    p_true_peak: track.truePeak ?? null,
  })
  if (error) throw error
  return typeof data === 'string' && data.length > 0
}

export async function removeTrack(trackId: string): Promise<void> {
  const { error } = await getSupabase().from('playlist_tracks').delete().eq('id', trackId)
  if (error) throw error
}

const COVER_BUCKET = 'covers'
const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const COVER_MAX_BYTES = 5 * 1024 * 1024

/**
 * Sube una portada y la deja puesta en la lista.
 *
 * La ruta arranca con el uuid de la cuenta porque las policies de Storage
 * miran la primera carpeta, y lleva una marca de tiempo para que cambiar la
 * foto genere una URL distinta: con la misma ruta el navegador seguiría
 * mostrando la vieja desde su caché. Mismo criterio que el avatar del perfil.
 */
export async function uploadCover(
  userId: string,
  playlistId: string,
  /* ArrayBuffer en el teléfono, File en la web. Ver `PickedImage.blob`: con un
     Blob, storage-js ignora el contentType y viajaba `text/plain`. */
  file: Blob | ArrayBuffer,
  fileName: string,
  /* El tipo según el selector, que es quien lo sabe de verdad en el teléfono. */
  mime?: string,
): Promise<string> {
  const ext = fileName.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  /*
   * El tipo: primero el que diga el selector, después el del File de la web, y
   * como respaldo la extensión. El Blob del teléfono mentía (`text/plain`) y
   * por eso el selector lo manda aparte.
   */
  const declarado = mime || (file instanceof Blob ? file.type : '')
  const contentType = COVER_TYPES.includes(declarado) ? declarado : typeFromExtension(ext)
  if (!contentType) {
    throw new Error('La portada tiene que ser JPG, PNG o WebP.')
  }
  const peso = file instanceof Blob ? file.size : file.byteLength
  if (peso > COVER_MAX_BYTES) {
    throw new Error('La portada no puede pesar más de 5 MB.')
  }

  const path = `${userId}/${playlistId}-${Date.now()}.${ext}`

  await assertStorageBudget(file)
  const { error } = await getSupabase()
    .storage.from(COVER_BUCKET)
    .upload(path, file, { contentType, upsert: true })
  if (error) throw error

  await setCover(playlistId, path)
  return path
}

function typeFromExtension(ext: string): string | null {
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  return null
}

/** Deja `null` para volver al mosaico de carátulas. */
export async function setCover(playlistId: string, path: string | null): Promise<void> {
  const { error } = await getSupabase()
    .from('playlists')
    .update({ cover_path: path, updated_at: new Date().toISOString() })
    .eq('id', playlistId)
  if (error) throw error
}

/**
 * URL pública de una portada.
 *
 * El bucket es público, así que no hace falta firmarla: la URL no vence y el
 * navegador puede cachearla como cualquier imagen.
 */
export function coverUrl(path: string | null | undefined): string | null {
  if (!path) return null
  return getSupabase().storage.from(COVER_BUCKET).getPublicUrl(path).data.publicUrl
}

/* ── Listas colaborativas ─────────────────────────────────────────────────── */

/** Conserva canciones y visibilidad. RLS permite este cambio solo al dueño. */
export async function makePlaylistCollaborative(id: string): Promise<void> {
  const { error } = await getSupabase()
    .from('playlists')
    .update({ colaborativa: true, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
    .single()
  if (error) throw error
}

/**
 * Entrar a una lista colaborativa por su link, y devolver su nombre.
 *
 * Solo camina sobre listas marcadas como colaborativas: el link de una lista
 * común no suma a nadie, y esa regla vive en la base (`join_playlist`) y no
 * acá, para que valga igual desde donde sea que se llame.
 *
 * Es idempotente. Abrir el link que ya usaste no duplica nada ni falla — solo
 * te devuelve a la lista, que es lo que esperás cuando volvés a tocarlo.
 */
export async function joinPlaylist(id: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('join_playlist', { p_playlist: id })
  if (error) throw error
  return typeof data === 'string' ? data : ''
}

/** La gente de una lista colaborativa: el dueño primero, después los demás. */
export async function listCollaborators(id: string): Promise<Colaborador[]> {
  const { data, error } = await getSupabase().rpc('list_playlist_collaborators', {
    p_playlist: id,
  })
  if (error) throw error
  return (data ?? []).flatMap((row: Record<string, unknown>) => {
    if (typeof row.user_id !== 'string') return []
    return [
      {
        id: row.user_id,
        username: typeof row.username === 'string' ? row.username : '',
        displayName: typeof row.display_name === 'string' ? row.display_name : null,
        avatarPath: typeof row.avatar_path === 'string' ? row.avatar_path : null,
        esDueño: row.es_dueño === true,
      },
    ]
  })
}

/** Sumar a alguien a mano. Solo el dueño; la base lo rechaza si no. */
export async function addCollaborator(playlistId: string, userId: string): Promise<void> {
  const { error } = await getSupabase().rpc('add_playlist_collaborator', {
    p_playlist: playlistId,
    p_user: userId,
  })
  if (error) throw error
}

/**
 * Sacar a alguien, o irse.
 *
 * Una sola función para las dos cosas porque borra la misma fila: el dueño saca
 * a cualquiera y cualquiera se saca a sí mismo. Ver `salirDeLista`, que es esto
 * mismo con el nombre que se usa desde la pantalla.
 */
export async function removeCollaborator(playlistId: string, userId: string): Promise<void> {
  const { error } = await getSupabase().rpc('remove_playlist_collaborator', {
    p_playlist: playlistId,
    p_user: userId,
  })
  if (error) throw error
}

/**
 * Irse de una lista donde colaborás.
 *
 * Lo que agregaste se queda: irse no es deshacer. Sacar tus canciones al salir
 * dejaría a la lista de los demás distinta de como la vieron la última vez, y
 * por una decisión que es solo tuya.
 */
export async function leavePlaylist(playlistId: string, myId: string): Promise<void> {
  await removeCollaborator(playlistId, myId)
}
