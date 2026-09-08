import { Image, Pressable, Text, View } from 'react-native'
import type { SharedValue } from 'react-native-reanimated'
import type { Message } from '../models/message'
import { artworkSource } from '../lib/artwork'
import { invitacionEnTexto } from '../lib/invitacionJam'
import { usePiso } from '../state/shell'
import { SeccionSocial } from './Social'
import { CabeceraLateral, BotonLateral } from './CabeceraLateral'
import { InvitacionJam } from './InvitacionJam'
import { formatMessageDate } from './MessageCard'
import { Lyrics } from './Lyrics'
import { Onda, usePicos } from './Onda'
import { SeekBar } from './SeekBar'
import { ScrollArea } from './ScrollArea'
import { Vacio } from './Vacio'
import { ICON_COLOR, IconCollapseRight, IconMessage, IconMusic, IconPause, IconPlay } from './icons'

export type MessageDetailBodyProps = {
  message: Message | null
  mine: boolean
  contactName: string
  playing: boolean
  sonando: boolean
  positionMs: number
  posicionSV: SharedValue<number>
  showCollapse?: boolean
  onCollapse: () => void
  onPlay: () => void
  onSeek: (fraction: number) => void
}

/** Inspector del chat: la invitación ya trae su propia superficie y sus acciones. */
export function MessageDetailBody({ message, mine, contactName, playing, sonando, positionMs, posicionSV, onCollapse, onPlay, onSeek }: MessageDetailBodyProps) {
  const piso = usePiso(24)
  const song = message?.song
  const picos = usePicos(song?.videoId, song ? { desdeMs: song.startMs, durMs: song.durationMs } : undefined)
  const art = song ? artworkSource(song.artworkPath, song.artworkUrl, 640) : null
  const elapsed = song && sonando ? Math.max(0, Math.min(song.durationMs, positionMs - song.startMs)) : 0
  const invitacion = message ? invitacionEnTexto(message.text) : null

  return <View className="min-h-0 flex-1">
    <CabeceraLateral titulo="Detalle">
      <BotonLateral label="Contraer detalle" onPress={onCollapse} icono={<IconCollapseRight size={15} color={ICON_COLOR.muted} />} />
    </CabeceraLateral>
    {!message ? <View className="flex-1 justify-center" style={{ paddingBottom: piso }}>
      <Vacio compacto icono={<IconMessage size={24} color={ICON_COLOR.muted} />}
        titulo="Elegí un mensaje" detalle="Acá podés leerlo, escuchar su fragmento o abrir una invitación." />
    </View> : <ScrollArea contentContainerClassName="gap-5 px-5 pt-2" contentContainerStyle={{ paddingBottom: piso }}>
      <View className="gap-1">
        <Text className="text-foreground text-[15px] font-semibold" numberOfLines={2}>{mine ? `Para @${contactName}` : `De @${contactName}`}</Text>
        {message.createdAt ? <Text className="text-muted-foreground text-[13px]">{formatMessageDate(message.createdAt, true)}</Text> : null}
      </View>

      {invitacion ? <InvitacionJam texto={message.text} /> : message.text ?
        <SeccionSocial><Text selectable className="text-foreground p-4 text-[16px] leading-6">{message.text}</Text></SeccionSocial> : null}

      {song ? <View className="gap-4">
        {art ? <Image source={{ uri: art }} accessibilityLabel={`Portada de ${song.title}`}
          className="aspect-square w-full max-w-[320px] self-center rounded-2xl bg-muted" /> : null}
        <View className="flex-row items-center gap-3">
          {!art ? <View className="h-12 w-12 items-center justify-center rounded-xl bg-muted"><IconMusic size={22} color={ICON_COLOR.muted} /></View> : null}
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-foreground text-[17px] font-semibold" numberOfLines={2}>{song.title}</Text>
            <Text className="text-muted-foreground text-[13px]" numberOfLines={2}>{song.artist} · {Math.round(song.durationMs / 1000)} s</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={playing ? 'Pausar fragmento' : 'Reproducir fragmento'} onPress={onPlay}
            className="h-12 w-12 items-center justify-center rounded-full bg-primary active:opacity-75">
            {playing ? <IconPause size={18} color={ICON_COLOR.onPrimary} /> : <IconPlay size={18} color={ICON_COLOR.onPrimary} />}
          </Pressable>
        </View>
        {picos ? <Onda picos={picos} posicionMs={posicionSV} desdeMs={song.startMs} duracionMs={song.durationMs}
          activa={sonando} onSeek={onSeek} height={36} etiqueta={song.title} /> :
          <SeekBar label={song.title} elapsedMs={elapsed} totalMs={song.durationMs}
            progress={elapsed / Math.max(1, song.durationMs)} onSeek={onSeek} />}
        {/* Cuatro renglones y no tres: desde que los versos largos se parten en dos
            en vez de cortarse con puntos suspensivos, con tres se veía un verso
            y medio. */}
        {song.lyrics?.length ? playing ? <Lyrics lines={song.lyrics} atMs={positionMs} visible={4} /> :
          <Text className="text-muted-foreground text-[13px] leading-5">Reproducí el fragmento para seguir la letra.</Text> : null}
      </View> : null}
    </ScrollArea>}
  </View>
}
