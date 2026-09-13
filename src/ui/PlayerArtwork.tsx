import { Image } from 'react-native'
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated'

/** El resorte de la tapa: crece decidida al sonar, se recoge suave al pausar. */
const RESORTE_TAPA = { damping: 17, stiffness: 190, mass: 0.9 }

/**
 * La carátula grande, que **respira con la reproducción**.
 *
 * Es la terminación de Apple Music: sonando, la tapa está a tamaño pleno y
 * despegada del fondo por una sombra profunda; en pausa se recoge y la sombra
 * se acerca. La pantalla dice el estado sin que haya que mirar el botón — la
 * música «se achica» cuando se calla.
 *
 * La sombra vive en el contenedor animado y el redondeo en los dos: recortar
 * y proyectar en la misma capa se pelean (el mismo motivo documentado en el
 * drawer de `_layout`). Todo por `style`: NativeWind no procesa `className`
 * sobre componentes animados.
 */
export function PlayerArtwork({ uri, playing }: { uri: string; playing: boolean }) {
  const respira = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(playing ? 1 : 0.82, RESORTE_TAPA) }],
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
