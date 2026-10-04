import { useEffect } from 'react'
import { Image } from 'react-native'
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { useMovimientoVisible } from './useMovimientoVisible'

const RESORTE_TAPA = { damping: 17, stiffness: 190, mass: 0.9 }

/* La sombra va fuera del recorte y los estilos animados usan style: NativeWind no procesa estas clases. */
export function PlayerArtwork({ uri, playing }: { uri: string; playing: boolean }) {
  const movimiento = useMovimientoVisible()
  const escala = useSharedValue(playing ? 1 : 0.82)
  useEffect(() => {
    const destino = playing ? 1 : 0.82
    cancelAnimation(escala)
    escala.value = movimiento && escala.value !== destino ? withSpring(destino, RESORTE_TAPA) : destino
    return () => cancelAnimation(escala)
  }, [playing, movimiento, escala])
  const respira = useAnimatedStyle(() => ({
    transform: [{ scale: escala.value }],
  }))
  return (
    <Animated.View
      style={[
        {
          width: '100%',
          borderRadius: 16,
          boxShadow: '0 22px 56px rgba(0,0,0,0.55)',
        },
        respira,
      ]}
    >
      <Image
        source={{ uri }}
        className="w-full rounded-2xl bg-card"
        style={{ aspectRatio: 1 }}
      />
    </Animated.View>
  )
}
