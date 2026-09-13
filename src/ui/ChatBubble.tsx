import { LinearGradient } from 'expo-linear-gradient'
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
import { TECLADO_FISICO } from '../lib/teclado'
import { chatDayLabel, chatTime, sameChatGroup } from './chatPresentation'
import { SeekBar } from './SeekBar'
import { ICON_COLOR, IconMusic, IconPause, IconPlay, IconCopiar, IconPencil, IconTrash, IconEye, IconChevronDown } from './icons'
import { estadoControlWeb } from './estadoControl'

export function ChatBubble({
  message,
  mine,
  selected,
  playing,
  sonando,
  positionMs = 0,
  previous,
  next,
  onDetails,
  onPress,
  onPlay,
  onSeek,
  userId,
  onEdit,
  onDelete,
}: {
  message: Message
  previous?: Message
  next?: Message
  onDetails?: () => void
  mine: boolean
  userId?: string
  onEdit?: () => void
  onDelete?: () => void
  selected?: boolean
  playing?: boolean
  /** Es el mensaje cargado en el reproductor, suene o esté en pausa. */
  sonando?: boolean
  positionMs?: number
  /** Compatible con el reloj compartido del reproductor. */
  posicionSV?: SharedValue<number>
  onPress: () => void
  onPlay: () => void
  onSeek: (fraction: number) => void
}) {
  const clic = useClicDerecho()
  const copy = messageCopyText(message)
  const options: MenuItem[] = message.deletedAt ? [] : [
    { label: 'Información del mensaje', sfSymbol: 'info.circle', icon: <IconEye size={18} />, onPress: onDetails ?? onPress },
    ...(message.song ? [{ label: playing ? 'Pausar fragmento' : 'Reproducir fragmento', sfSymbol: (playing ? 'pause.fill' : 'play.fill') as 'pause.fill' | 'play.fill', icon: playing ? <IconPause size={18} /> : <IconPlay size={18} />, onPress: onPlay }] : []),
    ...(copy ? [{ label: 'Copiar', copyText: copy, sfSymbol: 'doc.on.doc' as const, icon: <IconCopiar size={18} />, onPress: () => {
      void copiarAlPortapapeles(copy).then(ok => avisar(ok ? 'Mensaje copiado' : 'No se pudo copiar el mensaje.', !ok)).catch(() => avisar('No se pudo copiar el mensaje.', true))
    } }] : []),
    ...(onEdit && canEditMessage(message, userId ?? '') ? [{ label: 'Editar mensaje', sfSymbol: 'pencil' as const, icon: <IconPencil size={18} />, onPress: onEdit }] : []),
    ...(onDelete && canModifyMessage(message, userId ?? '') ? [{ label: 'Eliminar para todos', sfSymbol: 'trash' as const, icon: <IconTrash size={18} />, destructive: true, onPress: onDelete }] : []),
  ]
  const desktopMenu = TECLADO_FISICO && options.length > 0
  const bubbleColor = selected ? '#414145' : mine ? '#303033' : '#202022'
  const invitation = invitacionEnTexto(message.text)
  const song = message.song
  const delivery = message.readAt ? '✓✓' : message.openedAt ? '✓✓' : '✓'
  const progress = song && sonando
    ? Math.max(0, Math.min(1, (positionMs - song.startMs) / Math.max(song.durationMs, 1)))
    : 0
  // Se pide en grande: la misma imagen sirve de miniatura y de tinte de fondo.
  const art = song ? artworkSource(song.artworkPath, song.artworkUrl, 240) : null

  const joinedAbove = sameChatGroup(previous, message)
  const joinedBelow = sameChatGroup(message, next)
  const day = chatDayLabel(message.createdAt, previous?.createdAt)
  const accessibility = {
    accessibilityActions: options.map((item, index) => ({ name: `message-action-${index}`, label: item.label })),
    onAccessibilityAction: (event: { nativeEvent: { actionName: string } }) => {
      const index = options.findIndex((_, i) => `message-action-${i}` === event.nativeEvent.actionName)
      if (index >= 0) options[index].onPress?.()
    },
  }

  return (
    <View className="w-full">
      {day ? <View className="items-center py-4"><Text className="rounded-full bg-white/5 px-3 py-1 text-caption1 text-muted-foreground">{day}</Text></View> : null}
      <View className={mine ? 'items-end' : 'items-start'} style={{ paddingTop: joinedAbove ? 3 : 10 }}>
        <View {...({ dataSet: { chatBubble: 'true' } } as object)} style={{ maxWidth: TECLADO_FISICO ? '76%' : '88%', ...(song || message.sharedSong ? { width: 360 } : {}) }}>
          <MantenerApretado items={options} previewCornerRadius={20}>
            <View {...(options.length ? clic.gestos : {})}
              {...(TECLADO_FISICO && options.length ? { tabIndex: 0 } : {})}
              style={{
                maxWidth: 560, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 9, gap: 6,
                backgroundColor: bubbleColor,
                paddingTop: desktopMenu && (!message.text || invitation) ? 34 : 9,
                borderTopLeftRadius: !mine && joinedAbove ? 6 : 20,
                borderBottomLeftRadius: !mine && joinedBelow ? 6 : 20,
                borderTopRightRadius: mine && joinedAbove ? 6 : 20,
                borderBottomRightRadius: mine && joinedBelow ? 6 : 20,
              }}>
              {message.deletedAt ? <Text className="text-muted-foreground text-subheadline italic">Mensaje eliminado</Text> : invitation ? (
                <InvitacionJam texto={message.text} />
              ) : message.text ? (
                <Pressable {...estadoControlWeb('none')} {...accessibility}
                  accessibilityRole="button" accessibilityState={{ selected }}
                  accessibilityLabel={message.text}
                  accessibilityHint="Mantené pulsado para ver las opciones del mensaje"
                  onPress={onPress} onLongPress={Platform.OS === 'ios' ? () => {} : undefined}>
                  <Text selectable={TECLADO_FISICO} style={{ fontSize: 17, lineHeight: 23, color: '#F5F5F5', paddingRight: desktopMenu ? 44 : 0 }}>{message.text}</Text>
                </Pressable>
              ) : null}
              {message.sharedSong ? <CancionCompartida song={message.sharedSong} /> : null}
              {song ? <View className="relative min-w-0 gap-2 overflow-hidden rounded-xl bg-background/40 p-3">
                {art ? <Image source={{ uri: art }} blurRadius={Platform.OS === 'web' ? 0 : 24}
                  style={[StyleSheet.absoluteFill, { opacity: 0.18, transform: [{ scale: 1.5 }] }, Platform.OS === 'web' ? { filter: 'blur(32px)' } as object : null]} /> : null}
                <View className="flex-row items-center gap-2.5">
                  <Pressable {...estadoControlWeb('none')} {...accessibility} accessibilityRole="button"
                    accessibilityLabel={`Abrir fragmento: ${song.title}, ${song.artist}`}
                    onPress={onPress} onLongPress={Platform.OS === 'ios' ? () => {} : undefined}
                    className="min-w-0 flex-1 flex-row items-center gap-2.5">
                    {art ? <Image source={{ uri: art }} className="h-14 w-14 rounded-lg bg-card" /> :
                      <View className="h-14 w-14 items-center justify-center rounded-lg bg-card"><IconMusic size={22} color={ICON_COLOR.muted} /></View>}
                    <View className="min-w-0 flex-1 gap-0.5">
                      <Text className="text-foreground text-subheadline font-semibold">{song.title}</Text>
                      <Text className="text-muted-foreground text-footnote">{song.artist}</Text>
                    </View>
                  </Pressable>
                  <IconButton label={playing ? 'Pausar fragmento' : 'Reproducir fragmento'} symbol={playing ? 'pause.fill' : 'play.fill'} onPress={onPlay}
                    icon={playing ? <IconPause size={23} /> : <IconPlay size={23} />} />
                </View>
                <SeekBar label={song.title} progress={progress} elapsedMs={progress * song.durationMs} totalMs={song.durationMs} onSeek={onSeek} />
              </View> : null}
              <View accessible {...accessibility}
                accessibilityLabel={`${message.createdAt ? chatTime(message.createdAt) : ''}${mine && !message.deletedAt ? message.readAt ? ', leído' : message.openedAt ? ', abierto' : ', enviado' : ''}${message.editedAt && !message.deletedAt ? ', editado' : ''}`}
                className="flex-row items-center justify-end gap-1" style={{ marginTop: -2 }}>
                {message.editedAt && !message.deletedAt ? <Text className="text-muted-foreground text-caption2">Editado</Text> : null}
                {message.createdAt ? <Text className="text-muted-foreground text-caption2 tabular-nums">{chatTime(message.createdAt)}</Text> : null}
                {mine && !message.deletedAt ? <Text accessibilityLabel={message.readAt ? 'Leído' : message.openedAt ? 'Abierto' : 'Enviado'}
                  style={{ fontSize: 11, color: message.readAt ? '#F5F5F5' : '#99999F' }}>{delivery}</Text> : null}
              </View>
            </View>
          </MantenerApretado>
          {desktopMenu ? <View {...({ dataSet: { chatActions: 'true' } } as object)}
            style={{ position: 'absolute', top: 0, right: 0, width: 56, height: 40,
              alignItems: 'flex-end', paddingTop: 4, paddingRight: 4,
              overflow: 'hidden', borderTopRightRadius: mine && joinedAbove ? 6 : 20 }}>
            <LinearGradient pointerEvents="none" colors={[`${bubbleColor}00`, bubbleColor]}
              start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
            <Menu items={options} label="Opciones del mensaje" tooltip="Opciones del mensaje"
              trigger={<View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}><IconChevronDown size={18} color={ICON_COLOR.foreground} /></View>}
              abiertoEn={clic.punto} onCerrarPunto={clic.cerrar} />
          </View> : null}
        </View>
      </View>
    </View>
  )
}
