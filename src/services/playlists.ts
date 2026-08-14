import { getSupabase } from '../lib/supabase'

/**
 * Listas de reproducción propias.
 *
 * Una canción de lista es el **tema entero**, no un recorte: eso es lo que la
 * distingue del `SongSnippet` de un mensaje, que lleva inicio, duración y
 * letra del fragmento. Comparten el resto de los campos porque comparten
 * origen — el mismo buscador y el mismo audio en Storage.
 */

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
    },
  ]
}

export async function listPlaylists(): Promise<Playlist[]> {
  const { data, error } = await getSupabase().rpc('list_my_playlists')
  if (error) throw error
  return (data ?? []).flatMap(playlistFromRow)
}

export async function createPlaylist(name: string): Promise<Playlist> {
  const clean = name.trim()
  if (!clean) throw new Error('Poné un nombre para la lista.')

  const { data, error } = await getSupabase()
    .from('playlists')
    .insert({ name: clean })
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
  }
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
