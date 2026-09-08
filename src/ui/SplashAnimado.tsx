import { useEffect } from 'react'
import { StyleSheet } from 'react-native'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated'

const LOGO = require('../../assets/branding/splash-dnmusic.png')

/**
 * El arranque de la app, dibujado por nosotros.
 *
 * El splash nativo (expo-splash-screen) pone el primer cuadro —el logo sobre el
 * negro de la app, sin parpadeo— y esta capa lo continúa en movimiento: el logo
 * entra con un resorte suave y, tras un respiro, el fondo entero se desvanece y
 * deja ver la app que ya cargó detrás. Así el paso de «abriendo» a «adentro» es
 * un solo gesto y no un corte.
 *
 * Todo en escala de grises sobre `#121212`, como pide `docs/DESIGN.md`: en el
 * arranque, más que nunca, no hay carátula que aporte color.
 */
export function SplashAnimado({ onDone }: { onDone: () => void }) {
  const escala = useSharedValue(0.86)
  const logoOpacidad = useSharedValue(0)
  const fondoOpacidad = useSharedValue(1)

  useEffect(() => {
    logoOpacidad.value = withTiming(1, { duration: 440, easing: Easing.out(Easing.cubic) })
    escala.value = withSpring(1, { damping: 15, stiffness: 130, mass: 0.9 })
    fondoOpacidad.value = withDelay(
      1000,
      withTiming(0, { duration: 480, easing: Easing.inOut(Easing.cubic) }, (fin) => {
        if (fin) runOnJS(onDone)()
      }),
    )
    // Solo al montar: la animación es un disparo único.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fondo = useAnimatedStyle(() => ({ opacity: fondoOpacidad.value }))
  const logo = useAnimatedStyle(() => ({
    opacity: logoOpacidad.value,
    transform: [{ scale: escala.value }],
  }))

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, estilos.fondo, fondo]}>
      <Animated.Image source={LOGO} style={[estilos.logo, logo]} resizeMode="contain" />
    </Animated.View>
  )
}

const estilos = StyleSheet.create({
  // #121212 es `background` de DESIGN.md, el negro de la app.
  fondo: {
    backgroundColor: '#121212',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  logo: { width: 128, height: 128 },
})
