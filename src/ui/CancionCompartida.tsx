import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import type { SharedSong } from '../models/sharedSong'
import { artworkSource } from '../lib/artwork'
import { playQueue, togglePlayback, usePlaybackCargada, usePlaybackTrack, useWantPlay } from '../state/playback'
import { IconButton } from './IconButton'
import { formatClock } from './SeekBar'
import { ICON_COLOR, IconMusic, IconPause, IconPlay } from './icons'
import { estadoControlWeb } from './estadoControl'

/** La canción completa usa el reproductor global y continúa al salir del chat. */
export function CancionCompartida({ song }: { song: SharedSong }) {
  const router = useRouter()
  const actual = usePlaybackTrack()
  const wantPlay = useWantPlay()
  const cargada = usePlaybackCargada()
  const sounding = actual?.videoId === song.videoId
  const playing = sounding && wantPlay
  const art = artworkSource(song.artworkPath, song.artworkUrl, 240)
  const reproducir = () => {
    if (sounding) togglePlayback()
    else playQueue([{ ...song, id: song.videoId, truePeak: undefined }], 0, null)
  }

  return <View className="relative w-full min-w-0 gap-1 overflow-hidden rounded-2xl bg-background/70 p-3">
    {/* Mismo tinte que los fragmentos, sin onda ni suscripción a la posición. */}
    {art ? <View pointerEvents="none" style={StyleSheet.absoluteFill}><Image source={{ uri: art }} accessible={false}
      style={[
        StyleSheet.absoluteFill,
        { transform: [{ scale: 1.8 }], opacity: playing ? 0.34 : 0.2 },
        Platform.OS === 'web' ? ({ filter: playing ? 'blur(26px) saturate(1.5)' : 'blur(34px) saturate(1.2)' } as object) : null,
      ]}
      blurRadius={Platform.OS === 'web' ? 0 : playing ? 18 : 24} /></View> : null}
    <View className="flex-row items-center gap-2.5">
      <Pressable {...estadoControlWeb('none')} accessibilityRole="button"
        accessibilityLabel={`${playing ? 'Pausar' : 'Reproducir'} ${song.title}, ${song.artist}`}
        onPress={reproducir} className="min-w-0 flex-1 flex-row items-center gap-2.5 active:opacity-80">
        {art ? <Image source={{ uri: art }} className="h-11 w-11 rounded-lg bg-card" /> :
          <View className="h-11 w-11 items-center justify-center rounded-lg bg-card">
            <IconMusic size={17} color={ICON_COLOR.muted} />
          </View>}
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-foreground text-subheadline font-semibold" numberOfLines={2}>{song.title}</Text>
          <Text className="text-muted-foreground text-footnote" numberOfLines={1}>{song.artist}</Text>
        </View>
      </Pressable>
      <IconButton label={`${playing ? 'Pausar' : 'Reproducir'} ${song.title}`}
        symbol={playing ? 'pause.fill' : 'play.fill'} variant="primary" onPress={reproducir}
        busy={playing && !cargada}
        icon={playing ? <IconPause size={18} color={ICON_COLOR.onPrimary} /> : <IconPlay size={18} color={ICON_COLOR.onPrimary} />} />
    </View>
    <View className="min-h-11 flex-row items-center justify-between gap-2">
      {sounding ? <Pressable {...estadoControlWeb('none')} accessibilityRole="button" onPress={() => router.push('/playing')}
        className="min-h-11 min-w-0 flex-1 justify-center active:opacity-70">
        <Text className="text-foreground text-caption1" numberOfLines={1}>Abrir reproductor</Text>
      </Pressable> : <Text className="min-w-0 flex-1 text-muted-foreground text-caption1">Canción completa</Text>}
      {song.durationMs > 0 ? <Text className="text-muted-foreground text-caption1 tabular-nums">{formatClock(song.durationMs)}</Text> : null}
    </View>
  </View>
}
