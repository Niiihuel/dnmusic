import { isSentBy, type Message } from '../models/message'
import { invitacionEnTexto } from '../lib/invitacionJam'

export type MessageActionTarget = { kind: 'edit' | 'delete'; message: Message; pairId: string; userId: string }

export function canModifyMessage(message: Message, userId: string): boolean {
  return !!userId && isSentBy(message, userId) && !message.deletedAt
}

export function canEditMessage(message: Message, userId: string): boolean {
  // Jam invitations contain protocol data, not an editable caption.
  return canModifyMessage(message, userId) && !invitacionEnTexto(message.text)
}

export function validMessageText(message: Message, text: string): boolean {
  const clean = text.trim()
  return clean.length <= 2000 && (!!clean || !!message.song || !!message.sharedSong)
}

export function messageCopyText(message: Message): string {
  if (message.deletedAt) return ''
  const song = message.song ?? message.sharedSong
  return [message.text.trim(), song ? `${song.title} — ${song.artist}` : ''].filter(Boolean).join('\n')
}
