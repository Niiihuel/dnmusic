import { useEffect, type ReactNode } from 'react'
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { volver } from '../lib/volver'
import { ES_WEB } from './Glass'

/** Lo que tarda en subir y en volver a bajar. Los mismos de «Sonando». */
const SUBE_MS = 380
const BAJA_MS = 280
/** La franja de app que queda a la vista por encima de la hoja. */
const TOPE = 48

/**
 * Un drawer para la web, envolviendo la pantalla.
 *
 * En iOS estas rutas son `formSheet` y el sistema pone todo: la subida, el
 * grabber, el gesto de bajar y el oscurecido de lo de atrás. En web esa
 * presentación no existe y las mismas rutas caían como pantallas comunes que
 * aparecen de golpe — sin drawer, sin animación, sin fondo.
 *
 * Esto es la mitad web de ese contrato, con la misma receta que la pantalla
 * de «Sonando»: la ruta se declara transparente (ver `app/_layout.tsx`) y la
 * animación la hace la pantalla. La hoja sube desde el borde de abajo con la
 * app viva detrás, un velo la oscurece a medida que sube, y tocar la franja
 * de arriba la guarda por donde vino. Apiladas —invitar sobre el Jam— cada
 * una trae su propio velo, así que lo de atrás se oscurece un paso más por
 * nivel, como hace UIKit con sus sheets.
 *
 * En nativo no dibuja nada: devuelve la pantalla tal cual.
 */
export function Hoja({ children }: { children: ReactNode }) {
  if (!ES_WEB) return <>{children}</>
  return <Panel>{children}</Panel>
}

function Panel({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { height } = useWindowDimensions()
  const recorrido = Math.max(1, height - TOPE)
  const y = useSharedValue(recorrido)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- la entrada es
    // imperativa a propósito: es la API de un SharedValue (ver «Sonando»).
    y.value = withTiming(0, { duration: SUBE_MS, easing: Easing.out(Easing.cubic) })
  }, [y])

  const cerrar = () => {
    y.value = withTiming(
      recorrido,
      { duration: BAJA_MS, easing: Easing.in(Easing.cubic) },
      (fin) => {
        if (fin) runOnJS(volver)(router, '/')
      },
    )
  }

  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }))
  const velo = useAnimatedStyle(() => ({
    opacity: (1 - y.value / recorrido) * 0.45,
  }))

  return (
    <View style={{ flex: 1 }}>
      {/* El velo va aparte del panel: se queda quieto y solo cambia de
          intensidad — un velo que viaja con la hoja oscurecería de a saltos. */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, velo]}
      />
      {/* Toda la franja descubierta cierra, no solo la de arriba: es el
          comportamiento del sheet del sistema. El panel se dibuja después,
          así que los toques sobre la hoja no llegan acá. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cerrar"
        onPress={cerrar}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            top: TOPE,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            overflow: 'hidden',
            backgroundColor: '#121212',
            boxShadow: '0 -12px 40px rgba(0,0,0,0.5)',
          },
          panel,
        ]}
      >
        {children}
        {/* El grabber, encima del contenido: anuncia que esto es una hoja.
            El gesto real acá es el click en el fondo — con mouse no se
            arrastra — pero la pieza es parte del idioma del drawer. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 8,
            alignSelf: 'center',
            height: 5,
            width: 36,
            borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.25)',
          }}
        />
      </Animated.View>
    </View>
  )
}
