import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { usePlaybackTrack } from '../state/playback'
import { useEspectro } from '../state/espectro'

/** Cuatro bandas del PCM del reproductor. Sin señal, no inventamos movimiento. */
export function PlayingBars({
  playing,
  size = 14,
  videoId,
}: {
  playing: boolean
  size?: number
  videoId?: string
}) {
  const actual = usePlaybackTrack()
  const espectro = useEspectro()
  const id = videoId ?? actual?.videoId
  const bandas = playing && espectro.videoId === id ? espectro.bandas : null
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={playing ? 'Sonando' : 'En pausa'}
      className="flex-row items-end"
      style={{ height: size, gap: 2 }}
    >
      {[0, 1, 2, 3].map((i) => (
        <Bar key={i} height={size} nivel={bandas?.[i] ?? 0} />
      ))}
    </View>
  )
}
function Bar({ height, nivel }: { height: number; nivel: number }) {
  const alto = useSharedValue(2)
  useEffect(() => {
    const destino = 2 + (height - 2) * nivel
    alto.value = withTiming(destino, {
      duration: destino > alto.value ? 25 : 85,
      easing: Easing.linear,
    })
  }, [alto, height, nivel])
  const style = useAnimatedStyle(() => ({ height: alto.value }))
  return (
    <Animated.View style={[{ width: 3, backgroundColor: '#FFFFFF', borderRadius: 1 }, style]} />
  )
}
