import { Menu, MantenerApretado, type MenuItem } from './Menu'
import { useClicDerecho } from './useClicDerecho'
import { canEditMessage, canModifyMessage, messageCopyText } from './messageActions'
import { copiarAlPortapapeles } from '../lib/portapapeles'
import { avisar } from '../state/aviso'
import { IconButton } from './IconButton'
import { CancionCompartida } from './CancionCompartida'
import { InvitacionJam } from './InvitacionJam'
import { invitacionEnTexto } from '../lib/invitacionJam'
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import type { SharedValue } from 'react-native-reanimated'
import type { Message } from '../models/message'
import { artworkSource } from '../lib/artwork'
import { formatMessageDate } from './MessageCard'
import { Onda, usePicos } from './Onda'
import { SeekBar, formatClock } from './SeekBar'
import { ICON_COLOR, IconMusic, IconPause, IconPlay, IconCopiar, IconPencil, IconTrash, IconEye } from './icons'
import { estadoControlWeb } from './estadoControl'

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
  userId,
  onEdit,
  onDelete,
}: {
  message: Message
  mine: boolean
  userId?: string
  onEdit?: () => void
  onDelete?: () => void
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
  const clic = useClicDerecho()
  const copy = messageCopyText(message)
  const options: MenuItem[] = message.deletedAt ? [] : [
    { label: 'Ver mensaje', sfSymbol: 'eye', icon: <IconEye size={18} />, onPress },
    ...(message.song ? [{ label: playing ? 'Pausar fragmento' : 'Reproducir fragmento', sfSymbol: (playing ? 'pause.fill' : 'play.fill') as 'pause.fill' | 'play.fill', icon: playing ? <IconPause size={18} /> : <IconPlay size={18} />, onPress: onPlay }] : []),
    ...(copy ? [{ label: 'Copiar', sfSymbol: 'doc.on.doc' as const, icon: <IconCopiar size={18} />, onPress: () => {
      void copiarAlPortapapeles(copy).then(ok => avisar(ok ? 'Mensaje copiado' : 'No se pudo copiar el mensaje.', !ok)).catch(() => avisar('No se pudo copiar el mensaje.', true))
    } }] : []),
    ...(onEdit && canEditMessage(message, userId ?? '') ? [{ label: 'Editar mensaje', sfSymbol: 'pencil' as const, icon: <IconPencil size={18} />, onPress: onEdit }] : []),
    ...(onDelete && canModifyMessage(message, userId ?? '') ? [{ label: 'Eliminar para todos', sfSymbol: 'trash' as const, icon: <IconTrash size={18} />, destructive: true, onPress: onDelete }] : []),
  ]
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
      <View style={{ maxWidth: '92%', minWidth: 140, ...(song || message.sharedSong ? { width: 360 } : {}) }}>
        <MantenerApretado items={options}>
        <View
          {...(options.length ? clic.gestos : {})}
          style={selected ? { backgroundColor: '#2A2A2C', borderColor: 'rgba(255,255,255,0.18)' } : undefined}
          className={`gap-2 rounded-[20px] border px-3.5 py-2.5 ${
            mine ? 'border-transparent bg-muted' : 'border-white/5 bg-card'
          }`}
        >
          {message.deletedAt ? <Text className="text-muted-foreground text-subheadline italic">Mensaje eliminado</Text> : invitacionEnTexto(message.text) ? (
            <InvitacionJam texto={message.text} />
          ) : message.text ? (
            <Pressable
              {...estadoControlWeb('none')}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Abrir mensaje: ${message.text}`}
              onPress={onPress}
              onLongPress={Platform.OS === 'ios' ? () => {} : undefined}
              className="min-h-11 justify-center active:opacity-80"
            >
              <Text className="text-foreground text-subheadline">{message.text}</Text>
            </Pressable>
          ) : null}

          {message.sharedSong ? <CancionCompartida song={message.sharedSong} /> : null}

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
            <View className="relative min-w-0 gap-2 overflow-hidden rounded-2xl bg-background/70 p-3">
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
                  {...estadoControlWeb('none')}
                  accessibilityRole="button"
                  accessibilityLabel={`Abrir fragmento: ${song.title}, ${song.artist}`}
                  onPress={onPress}
                  onLongPress={Platform.OS === 'ios' ? () => {} : undefined}
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
                    <Text className="text-foreground text-subheadline font-semibold" numberOfLines={2}>
                      {song.title}
                    </Text>
                    {/* Solo el artista: la duración pasó a estar al final de la
                        barra, y repetirla acá la decía dos veces en dos
                        formatos distintos ("15 s" y "0:15"). */}
                    <Text className="text-muted-foreground text-footnote" numberOfLines={1}>
                      {song.artist}
                    </Text>
                  </View>
                </Pressable>
                <IconButton label={playing ? 'Pausar' : 'Reproducir canción'} symbol={playing ? 'pause.fill' : 'play.fill'} onPress={onPlay} variant="primary" icon={playing ? <IconPause size={18} color={ICON_COLOR.onPrimary} /> : <IconPlay size={18} color={ICON_COLOR.onPrimary} />} />
              </View>
              {/*
                La onda del tema en vez de la barra lisa, con los tiempos a los
                costados como los tenía la barra. Si la onda todavía no llegó
                —o si es una canción propia, que no tiene— se dibuja la barra:
                el mensaje nunca se queda sin forma de moverse.
              */}
              {picos ? (
                <View className="flex-row items-center gap-2">
                  <Text className="text-muted-foreground w-8 text-caption1 tabular-nums">
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
                      height={36}
                      etiqueta={song.title}
                    />
                  </View>
                  <Text className="text-muted-foreground w-8 text-right text-caption1 tabular-nums">
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
            {message.editedAt && !message.deletedAt ? <Text className="text-muted-foreground text-caption1">Editado</Text> : null}
            {message.createdAt ? (
              <Text className="text-muted-foreground text-caption1 tabular-nums">
                {formatMessageDate(message.createdAt)}
              </Text>
            ) : null}
            {mine && !message.deletedAt ? <Text accessibilityLabel={message.readAt ? 'Leído' : message.openedAt ? 'Abierto' : 'Enviado'} className="text-muted-foreground text-caption1">{delivery}</Text> : null}
            {options.length ? <Menu items={options} label="Opciones del mensaje" tooltip="Opciones del mensaje" size={16}
              abiertoEn={clic.punto} onCerrarPunto={clic.cerrar} /> : null}
          </View>
        </View>
        </MantenerApretado>
      </View>
    </View>
  )
}
