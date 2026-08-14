import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import type { SharedValue } from 'react-native-reanimated'
import type { Message } from '../models/message'
import { artworkSource } from '../lib/artwork'
import { formatMessageDate } from './MessageCard'
import { Onda, usePicos } from './Onda'
import { SeekBar, formatClock } from './SeekBar'
import { ICON_COLOR, IconMusic, IconPause, IconPlay } from './icons'

export function ChatBubble({
  message,
  mine,
  selected,
  playing,
  sonando,
  positionMs = 0,
  posicionSV,
  onPress,
  onPlay,
  onSeek,
}: {
  message: Message
  mine: boolean
  selected?: boolean
  playing?: boolean
  /** Es el mensaje cargado en el reproductor, suene o esté en pausa. */
  sonando?: boolean
  positionMs?: number
  /** La posición para dibujar, cuadro a cuadro. Ver `Onda`. */
  posicionSV?: SharedValue<number>
  onPress: () => void
  onPlay: () => void
  onSeek: (fraction: number) => void
}) {
  const song = message.song
  const delivery = message.readAt ? '✓✓' : message.openedAt ? '✓✓' : '✓'
  const picos = usePicos(
    song?.videoId,
    song ? { desdeMs: song.startMs, durMs: song.durationMs } : undefined,
  )
  const progress = song
    ? Math.max(0, Math.min(1, (positionMs - song.startMs) / Math.max(song.durationMs, 1)))
    : 0
  // Se pide en grande: la misma imagen sirve de miniatura y de tinte de fondo.
  const art = song ? artworkSource(song.artworkPath, song.artworkUrl, 240) : null

  return (
    <View className={`w-full ${mine ? 'items-end' : 'items-start'}`}>
      <View className="max-w-[78%] min-w-[140px]">
        <View
          className={`gap-2 rounded-2xl px-3.5 py-2.5 active:opacity-80 ${
            mine ? 'rounded-br-sm bg-muted' : 'rounded-bl-sm bg-card'
          }`}
        >
          {message.text ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={onPress}
              className="active:opacity-80"
            >
              <Text className="text-foreground text-[15px] leading-5">{message.text}</Text>
            </Pressable>
          ) : null}

          {song ? (
            /*
             * La tarjeta se tiñe **siempre** con su tapa.
             *
             * Antes el color aparecía solo mientras sonaba, para que codificara
             * estado y la conversación en reposo quedara monocroma. En la
             * práctica la tarjeta apagada se leía como un bloque gris más y no
             * como una canción; con el color puesto se reconoce de qué tema se
             * trata antes de leer el título.
             *
             * Lo que sonando sigue distinguiendo es la intensidad: el tinte
             * sube y el desenfoque afloja, así que la que está sonando sigue
             * siendo la más viva de la lista.
             */
            <View className="relative min-w-[240px] gap-2 overflow-hidden rounded-xl bg-background/70 p-2">
              {art ? (
                <Image
                  source={{ uri: art }}
                  style={[
                    StyleSheet.absoluteFill,
                    // La escala evita que el desenfoque deje los bordes claros.
                    { transform: [{ scale: 1.8 }], opacity: playing ? 0.34 : 0.2 },
                    Platform.OS === 'web'
                      ? ({
                          filter: playing
                            ? 'blur(26px) saturate(1.5)'
                            : 'blur(34px) saturate(1.2)',
                        } as object)
                      : null,
                  ]}
                  blurRadius={Platform.OS === 'web' ? 0 : playing ? 18 : 24}
                />
              ) : null}
              <View className="flex-row items-center gap-2.5">
                <Pressable
                  accessibilityRole="button"
                  onPress={onPress}
                  className="min-w-0 flex-1 flex-row items-center gap-2.5 active:opacity-80"
                >
                  {art ? (
                    <Image
                      source={{ uri: art }}
                      className="h-11 w-11 rounded-lg bg-card"
                    />
                  ) : (
                    <View className="h-11 w-11 items-center justify-center rounded-lg bg-card">
                      <IconMusic size={17} color={ICON_COLOR.muted} />
                    </View>
                  )}
                  <View className="min-w-0 flex-1 gap-0.5">
                    <Text className="text-foreground text-[13px] font-semibold" numberOfLines={1}>
                      {song.title}
                    </Text>
                    {/* Solo el artista: la duración pasó a estar al final de la
                        barra, y repetirla acá la decía dos veces en dos
                        formatos distintos ("15 s" y "0:15"). */}
                    <Text className="text-muted-foreground text-[11px]" numberOfLines={1}>
                      {song.artist}
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={playing ? 'Pausar' : 'Reproducir canción'}
                  onPress={onPlay}
                  className="h-9 w-9 items-center justify-center rounded-full bg-primary"
                >
                  {playing ? (
                    <IconPause size={14} color={ICON_COLOR.onPrimary} />
                  ) : (
                    <IconPlay size={14} color={ICON_COLOR.onPrimary} />
                  )}
                </Pressable>
              </View>
              {/*
                La onda del tema en vez de la barra lisa, con los tiempos a los
                costados como los tenía la barra. Si la onda todavía no llegó
                —o si es una canción propia, que no tiene— se dibuja la barra:
                el mensaje nunca se queda sin forma de moverse.
              */}
              {picos ? (
                <View className="flex-row items-center gap-2">
                  <Text className="text-muted-foreground w-8 text-[10px] tabular-nums">
                    {formatClock(progress * song.durationMs)}
                  </Text>
                  <View className="flex-1">
                    <Onda
                      picos={picos}
                      posicionMs={posicionSV}
                      desdeMs={song.startMs}
                      duracionMs={song.durationMs}
                      activa={!!sonando}
                      onSeek={onSeek}
                      height={30}
                      etiqueta={song.title}
                    />
                  </View>
                  <Text className="text-muted-foreground w-8 text-right text-[10px] tabular-nums">
                    {formatClock(song.durationMs)}
                  </Text>
                </View>
              ) : (
                <SeekBar
                  label={song.title}
                  progress={progress}
                  elapsedMs={progress * song.durationMs}
                  totalMs={song.durationMs}
                  onSeek={onSeek}
                />
              )}
            </View>
          ) : null}

          <View className="flex-row items-center justify-end gap-1.5">
            {message.createdAt ? (
              <Text className="text-muted-foreground text-[10px] tabular-nums">
                {formatMessageDate(message.createdAt)}
              </Text>
            ) : null}
            {mine ? <Text className="text-muted-foreground text-[10px]">{delivery}</Text> : null}
          </View>
        </View>
      </View>
    </View>
  )
}
