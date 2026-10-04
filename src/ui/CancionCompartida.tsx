import { useRouter } from 'expo-router'
import type { SharedSong } from '../models/sharedSong'
import { artworkSource } from '../lib/artwork'
import { playQueue, togglePlayback, usePlaybackCargada, usePlaybackTrack, useWantPlay } from '../state/playback'
import { TarjetaMusica } from './TarjetaMusica'
import { useDestinoEscucha } from './Dispositivos.shared'

/** La canción completa usa el reproductor global y continúa al salir del chat. */
export function CancionCompartida({ song }: { song: SharedSong }) {
  const router = useRouter()
  const actual = usePlaybackTrack()
  const wantPlay = useWantPlay()
  const cargada = usePlaybackCargada()
  const destino = useDestinoEscucha()
  const sounding = actual?.videoId === song.videoId
  const playing = sounding && wantPlay && !destino.remoto

  return <TarjetaMusica
    datos={{ titulo: song.title, artista: song.artist, imagen: artworkSource(song.artworkPath, song.artworkUrl, 240) }}
    reproduciendo={playing}
    cargando={playing && !cargada}
    etiquetaReproduccion={sounding && destino.remoto ? 'Traer música a este dispositivo' : undefined}
    onReproducir={() => {
      if (sounding) togglePlayback()
      else playQueue([{ ...song, id: song.videoId, truePeak: undefined }], 0, null)
    }}
    onAbrir={() => router.push(sounding ? '/playing' : `/cancion/${encodeURIComponent(song.videoId)}`)}
  />
}
