import { addShowcase } from '../services/showcases'
import type { PlaylistTrack } from '../services/playlists'
import { getSupabase } from './supabase'
import { avisar } from '../state/aviso'
import { mensajeError } from './mensajeError'

/**
 * Fija una canción **ya resuelta** como vitrina del perfil.
 *
 * Es la mitad fácil de `fijarEnPerfil` de la pantalla principal: allá la
 * canción es un resultado del buscador y hay que traer el audio antes; acá ya
 * está sonando —o guardada en una lista—, así que el camino del archivo viene
 * puesto y no hay nada que resolver. Una vitrina guarda ese camino para poder
 * sonar sola desde el perfil, sin depender de que la canción esté en una lista.
 */
export async function fijarPistaEnPerfil(track: PlaylistTrack): Promise<void> {
  const { data } = await getSupabase().auth.getUser()
  const me = data.user?.id
  if (!me) return
  try {
    await addShowcase(me, 'cancion', {
      videoId: track.videoId,
      title: track.title,
      artist: track.artist,
      artworkUrl: track.artworkUrl,
      artworkPath: track.artworkPath ?? null,
      audioPath: track.audioPath,
      durationMs: track.durationMs,
    })
    avisar('Fijado en tu perfil')
  } catch (e) {
    avisar(`No se pudo fijar: ${mensajeError(e)}`, true)
  }
}
