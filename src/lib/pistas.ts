import type { TrackResult } from '../services/music'
import type { PlaylistTrack } from '../services/playlists'

/**
 * Una canción guardada, en la forma que entiende el menú y el buscador.
 *
 * Vive acá y no adentro de la pantalla principal porque la necesitan también
 * las hojas apiladas —«Sonando», «Agregar a una lista»—, que ofrecen las mismas
 * acciones sobre la misma canción.
 *
 * El álbum queda vacío porque no se guarda en la lista: por eso «Ir al álbum»
 * aparece apagado en una canción tuya y encendido en una que venís de buscar.
 * Para encenderlo habría que guardar `albumId` al agregarla.
 */
export function resultadoDePista(track: PlaylistTrack): TrackResult {
  return {
    videoId: track.videoId,
    title: track.title,
    artist: track.artist,
    artistId: track.artistId,
    album: '',
    albumId: null,
    artworkUrl: track.artworkUrl,
    durationMs: track.durationMs,
    /* El audio que ya está resuelto viaja con el resultado: encolar o
       reproducir desde el menú no re-resuelve — y una canción propia
       (`propia:…`) ni podría, ese id no existe en YouTube. */
    audioPath: track.audioPath,
    artworkPath: track.artworkPath,
  }
}

/**
 * Lo contrario: un resultado ya resuelto, como fila de lista.
 *
 * `id` lleva el prefijo de quien la armó para que nunca choque con el uuid de
 * una fila guardada de verdad.
 */
export function pistaDeResultado(
  track: TrackResult,
  prefijo: string,
  resuelto?: { path: string; artworkPath: string | null; durationMs: number },
): PlaylistTrack {
  return {
    id: `${prefijo}:${track.videoId}`,
    videoId: track.videoId,
    title: track.title,
    artist: track.artist,
    artistId: track.artistId,
    artworkUrl: track.artworkUrl,
    artworkPath: resuelto?.artworkPath ?? track.artworkPath ?? null,
    audioPath: resuelto?.path ?? track.audioPath ?? '',
    durationMs: resuelto?.durationMs || track.durationMs,
    truePeak: undefined,
  }
}
