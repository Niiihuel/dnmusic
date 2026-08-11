import { Image, Pressable, Text, View } from 'react-native'
import type { Message } from '../models/message'
import { artworkSource } from '../lib/artwork'
import { ICON_COLOR, IconMusic, IconPause, IconPlay } from './icons'

type Props = {
  message: Message
  mine: boolean
  contactName: string
  selected?: boolean
  playing?: boolean
  onPlay?: () => void
  onPress?: () => void
}

/**
 * Mensaje de la bandeja. El contenido y el reproductor son controles hermanos
 * para evitar un button anidado dentro de otro button en web.
 */
export function MessageCard({
  message,
  mine,
  contactName,
  selected,
  playing,
  onPlay,
  onPress,
}: Props) {
  const song = message.song
  const unread = !mine && message.readAt === null
  const status = mine
    ? message.readAt
      ? 'Leído'
      : message.openedAt
        ? 'Abierto'
        : 'Enviado'
    : unread
      ? 'Nuevo'
      : 'Visto'

  return (
    <View className={`gap-3 rounded-xl p-4 ${selected ? 'bg-muted' : 'bg-card'}`}>
      <Pressable accessibilityRole="button" onPress={onPress} className="gap-3 active:opacity-70">
        <View className="flex-row items-center gap-3">
          <View className={`h-10 w-10 items-center justify-center rounded-full ${selected ? 'bg-card' : 'bg-muted'}`}>
            <Text className="text-foreground text-sm font-semibold uppercase">
              {contactInitial(contactName)}
            </Text>
          </View>

          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
              {mine ? `Para @${contactName}` : `De @${contactName}`}
            </Text>
            <View className="flex-row items-center gap-1.5">
              {unread ? <View className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
              <Text className="text-muted-foreground text-[11px]">{status}</Text>
            </View>
          </View>

          {message.createdAt ? (
            <Text className="text-muted-foreground text-[11px] tabular-nums">
              {formatDate(message.createdAt)}
            </Text>
          ) : null}
        </View>

        {message.text.length > 0 ? (
          <Text className="text-card-foreground text-[16px] leading-6">{message.text}</Text>
        ) : null}
      </Pressable>

      {song ? (
        <View className={`flex-row items-center gap-3 rounded-lg p-2.5 ${selected ? 'bg-background' : 'bg-muted'}`}>
          <Pressable
            accessibilityRole="button"
            onPress={onPress}
            className="min-w-0 flex-1 flex-row items-center gap-3 active:opacity-70"
          >
            {song.artworkUrl ? (
              <Image
                source={{ uri: artworkSource(song.artworkPath, song.artworkUrl, 96) ?? '' }}
                className="h-12 w-12 rounded bg-background"
              />
            ) : (
              <View className="h-12 w-12 items-center justify-center rounded bg-background">
                <IconMusic size={18} color={ICON_COLOR.muted} />
              </View>
            )}
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="text-foreground text-[14px] font-semibold" numberOfLines={1}>
                {song.title}
              </Text>
              <Text className="text-muted-foreground text-[12px]" numberOfLines={1}>
                {song.artist} · {Math.round(song.durationMs / 1000)} s
              </Text>
            </View>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pausar' : 'Reproducir el fragmento'}
            onPress={onPlay}
            className="h-10 w-10 items-center justify-center rounded-full bg-primary active:opacity-80"
          >
            {playing ? (
              <IconPause size={15} color={ICON_COLOR.onPrimary} />
            ) : (
              <IconPlay size={15} color={ICON_COLOR.onPrimary} />
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}

export function contactInitial(username: string): string {
  return username.trim().charAt(0) || '?'
}

export function formatMessageDate(date: Date, includeDate = false): string {
  if (includeDate) {
    return new Intl.DateTimeFormat('es-AR', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  }

  const diffH = (Date.now() - date.getTime()) / 3_600_000
  if (diffH < 24) {
    return new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(date)
  }
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' }).format(date)
}

function formatDate(date: Date): string {
  return formatMessageDate(date)
}
