import { useEffect } from 'react'
import { View, type DimensionValue } from 'react-native'
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'

/** Gris del sistema para los bloques (`--color-muted`). */
const BLOCK = '#1F1F1F'
const BLOCK_HI = '#2E2E2E'

type BlockProps = {
  width?: DimensionValue
  height: number
  radius?: number
}

/**
 * Bloque de carga.
 *
 * Late entre dos grises en vez de hacerlo por opacidad: sobre un panel oscuro,
 * bajar la opacidad lo funde con el fondo y el pulso apenas se percibe.
 *
 * El color se **interpola**. Antes se elegía uno u otro según el valor pasara
 * de la mitad, así que en vez de latir parpadeaba: el gris saltaba de golpe dos
 * veces por ciclo. Con `interpolateColor` la transición es continua y el pulso
 * se lee como respiración y no como un destello.
 *
 * Los colores van inline y no por className a propósito. NativeWind no procesa
 * clases sobre componentes animados, así que un `Animated.View className="bg-muted"`
 * se renderiza sin fondo — literalmente invisible.
 */
export function Skeleton({ width = '100%', height, radius = 999 }: BlockProps) {
  const t = useSharedValue(0)

  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    )
  }, [t])

  const animated = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(t.value, [0, 1], [BLOCK, BLOCK_HI]),
  }))

  return <Animated.View style={[{ width, height, borderRadius: radius }, animated]} />
}

/** Una fila de resultado: carátula, título y artista. */
export function SkeletonRow() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8 }}>
      <Skeleton width={44} height={44} radius={6} />
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton width="62%" height={12} />
        <Skeleton width="35%" height={10} />
      </View>
    </View>
  )
}

export function SkeletonList({ rows = 6 }: { rows?: number }) {
  return (
    <View accessibilityLabel="Buscando canciones">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </View>
  )
}
