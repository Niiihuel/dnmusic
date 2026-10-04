import type { TrackResult } from '../services/music'
import type { PlaylistTrack } from '../services/playlists'

/** Captura los resultados elegidos; cambiar el texto de búsqueda no cambia la cola. */
export function colaBusqueda(elegida: TrackResult, resultados: TrackResult[] = [elegida]) {
  const unicos = new Map<string, TrackResult>()
  for (const track of resultados) if (track.videoId && !unicos.has(track.videoId)) unicos.set(track.videoId, track)
  // La selección puede venir de una tarjeta fuera de los resultados actuales.
  if (!unicos.has(elegida.videoId)) unicos.clear()
  unicos.set(elegida.videoId, elegida)
  const tracks: PlaylistTrack[] = [...unicos.values()].map(track => ({
    id: `busqueda:${track.videoId}`, videoId: track.videoId, title: track.title,
    artist: track.artist, artistId: track.artistId, artworkUrl: track.artworkUrl,
    artworkPath: track.artworkPath ?? null, audioPath: track.audioPath ?? '',
    durationMs: track.durationMs, truePeak: undefined,
  }))
  return { tracks, index: tracks.findIndex(track => track.videoId === elegida.videoId) }
}
