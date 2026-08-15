import { getSupabase } from '../lib/supabase'
import type { PlaylistTrack } from './playlists'

/**
 * Los me gusta: el gusto **explícito**, dicho con un corazón.
 *
 * Conviven con `plays`, que es el gusto implícito —cuánto dejaste sonar a
 * cada uno—. Los dos alimentan las recomendaciones, pero dicen cosas
 * distintas: el reloj sabe qué escuchás, el corazón sabe qué querés volver a
 * escuchar. Por eso esto no reemplaza al historial, lo refuerza.
 *
 * Se guarda la canción entera, con su audio ya resuelto: lo que se marca
 * estaba sonando, así que todos los datos están a mano y la vista «Tus me
 * gusta» puede sonar sin volver a preguntarle nada a YouTube.
 */

/** Una fila de la tabla, con lo justo para dibujarla y hacerla sonar. */
type Fila = {
  video_id: string
  title: string
  artist: string
  artist_id: string | null
  artwork_url: string
  artwork_path: string | null
  audio_path: string
  duration_ms: number
  true_peak: number | null
}

function filaACancion(r: Fila): PlaylistTrack {
  return {
    /* El id lleva su procedencia, como `radio:` y `busqueda:`: no es una fila
       de ninguna lista y nadie puede confundirlo con una. */
    id: `gusta:${r.video_id}`,
    videoId: r.video_id,
    title: r.title,
    artist: r.artist,
    artistId: r.artist_id,
    artworkUrl: r.artwork_url,
    artworkPath: r.artwork_path,
    audioPath: r.audio_path,
    durationMs: r.duration_ms,
    truePeak: r.true_peak ?? undefined,
  }
}

/** Todos los tuyos, del más nuevo al más viejo — el orden de la vista. */
export async function listarMeGusta(): Promise<PlaylistTrack[]> {
  const { data, error } = await getSupabase()
    .from('me_gusta')
    .select('video_id, title, artist, artist_id, artwork_url, artwork_path, audio_path, duration_ms, true_peak')
    .order('at', { ascending: false })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Fila[]).map(filaACancion)
}

/**
 * Marca una canción. Idempotente: volver a marcarla no duplica ni falla —
 * `ignoreDuplicates` termina en `on conflict do nothing`, que es lo único que
 * la tabla permite (no hay policy de update, a propósito).
 */
export async function marcarMeGusta(track: PlaylistTrack): Promise<void> {
  const { data } = await getSupabase().auth.getUser()
  const me = data.user?.id
  if (!me) throw new Error('Sesión requerida')
  const { error } = await getSupabase().from('me_gusta').upsert(
    {
      owner_id: me,
      video_id: track.videoId,
      title: track.title,
      artist: track.artist,
      artist_id: track.artistId ?? null,
      artwork_url: track.artworkUrl,
      artwork_path: track.artworkPath ?? null,
      audio_path: track.audioPath,
      duration_ms: Math.round(track.durationMs),
      true_peak: track.truePeak ?? null,
    },
    { onConflict: 'owner_id,video_id', ignoreDuplicates: true },
  )
  if (error) throw new Error(error.message)
}

export async function quitarMeGusta(videoId: string): Promise<void> {
  const { error } = await getSupabase().from('me_gusta').delete().eq('video_id', videoId)
  if (error) throw new Error(error.message)
}
