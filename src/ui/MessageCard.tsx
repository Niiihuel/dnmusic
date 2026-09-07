import { InvitacionJam } from './InvitacionJam'
import { invitacionEnTexto } from '../lib/invitacionJam'
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
  const art = song ? artworkSource(song.artworkPath, song.artworkUrl, 96) : null
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
    <View className={`gap-3 rounded-2xl p-4 ${selected ? 'bg-muted' : 'bg-card'}`}>
      <Pressable accessibilityRole={onPress ? "button" : undefined} accessibilityState={{ selected }} onPress={onPress} className="gap-3 active:opacity-70">
        <View className="flex-row items-center gap-3">
          <View className={`h-11 w-11 items-center justify-center rounded-full ${selected ? 'bg-card' : 'bg-muted'}`}>
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
              <Text className="text-muted-foreground text-[13px]">{status}</Text>
            </View>
          </View>

          {message.createdAt ? (
            <Text className="text-muted-foreground text-[13px] tabular-nums">
              {formatDate(message.createdAt)}
            </Text>
          ) : null}
        </View>

        {message.text.length > 0 && !invitacionEnTexto(message.text) ? (
          <Text className="text-card-foreground text-[16px] leading-6">{message.text}</Text>
        ) : null}
      </Pressable>

      {invitacionEnTexto(message.text) ? <InvitacionJam texto={message.text} /> : null}
      {song ? (
        <View className={`flex-row items-center gap-3 rounded-lg p-2.5 ${selected ? 'bg-background' : 'bg-muted'}`}>
          <Pressable
            accessibilityRole={onPress ? "button" : undefined}
            accessibilityLabel={`Abrir fragmento: ${song.title}, ${song.artist}`}
            onPress={onPress}
            className="min-w-0 flex-1 flex-row items-center gap-3 active:opacity-70"
          >
            {art ? (
              <Image
                source={{ uri: art }}
                className="h-12 w-12 rounded bg-background"
              />
            ) : (
              <View className="h-12 w-12 items-center justify-center rounded bg-background">
                <IconMusic size={18} color={ICON_COLOR.muted} />
              </View>
            )}
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="text-foreground text-[15px] font-semibold" numberOfLines={2}>
                {song.title}
              </Text>
              <Text className="text-muted-foreground text-[13px]" numberOfLines={1}>
                {song.artist} · {Math.round(song.durationMs / 1000)} s
              </Text>
            </View>
          </Pressable>

          {onPlay ? <Pressable
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pausar' : 'Reproducir el fragmento'}
            onPress={onPlay}
            className="h-11 w-11 items-center justify-center rounded-full bg-primary active:opacity-80"
          >
            {playing ? (
              <IconPause size={15} color={ICON_COLOR.onPrimary} />
            ) : (
              <IconPlay size={15} color={ICON_COLOR.onPrimary} />
            )}
          </Pressable> : null}
        </View>
      ) : null}
    </View>
  )
}

export function contactInitial(username: string): string {
  return username.trim().charAt(0) || '?'
}

/*
 * Los tres formateadores, armados **una vez**.
 *
 * Construir un `Intl.DateTimeFormat` es de lo más caro que tiene Intl —hay que
 * resolver el locale y compilar el patrón— y esto se llama una vez por mensaje
 * en pantalla, en una lista que se redibuja al escribir. Formatear con uno ya
 * hecho, en cambio, es barato. Son constantes y no un `useMemo` porque no
 * dependen de nada del componente: el locale está fijo acá.
 */
const FECHA_LARGA = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
})
const SOLO_HORA = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' })
const DIA_Y_MES = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' })

export function formatMessageDate(date: Date, includeDate = false): string {
  if (includeDate) return FECHA_LARGA.format(date)

  const diffH = (Date.now() - date.getTime()) / 3_600_000
  if (diffH < 24) return SOLO_HORA.format(date)
  return DIA_Y_MES.format(date)
}

function formatDate(date: Date): string {
  return formatMessageDate(date)
}
