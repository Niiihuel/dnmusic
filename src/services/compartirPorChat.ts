import { sharedSongFrom } from '../models/sharedSong'
import type { PlaylistTrack } from './playlists'
import { sendMessage } from './messages'

/** Usa los mismos permisos de conversación que un mensaje normal. */
export async function compartirPorChat(pairId: string, senderUid: string, track: PlaylistTrack) {
  const sharedSong = sharedSongFrom({ ...track, kind: 'track' })
  if (!sharedSong) throw new Error('La canción no tiene los datos necesarios para compartirla.')
  return sendMessage(pairId, senderUid, {
    // También da contexto a la bandeja, las notificaciones y clientes anteriores.
    text: `🎵 ${sharedSong.title} — ${sharedSong.artist}`.slice(0, 2000),
    sharedSong,
  })
}
