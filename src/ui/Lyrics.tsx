import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { activeLyricIndex, type LyricLine } from '../services/music'

export type LyricsSize = 'sm' | 'lg'

/**
 * Los dos tamaños. Es lo único que cambia entre la letra de fondo y la letra a
 * pantalla completa: el movimiento, el centrado y la atenuación son los mismos.
 */
const SIZE = {
  /** Acompaña a otra cosa (la onda, la tarjeta del mensaje). */
  sm: { idle: 15, active: 17, lineH: 34, gap: 0, wrap: false },
  /** Es el contenido de la pantalla. */
  lg: { idle: 20, active: 24, lineH: 44, gap: 9, wrap: true },
} satisfies Record<LyricsSize, { idle: number; active: number; lineH: number; gap: number; wrap: boolean }>

type Props = {
  lines: LyricLine[]
  /** Posición actual, en la misma escala que `lines[].atMs`. */
  atMs: number
  /**
   * Cuántas líneas se ven a la vez. Impar: una queda centrada.
   * Sin este valor, el alto lo pone el contenedor y la letra lo llena.
   */
  visible?: number
  size?: LyricsSize
  /** Si viene, cada línea es tocable. */
  onPickLine?: (atMs: number) => void
}

/**
 * Letra que sigue a la canción.
 *
 * Sin tarjeta ni fondo: el texto va directo sobre el lienzo, centrado, y la
 * columna se desplaza para dejar la línea que suena en el medio. Las demás se
 * apagan según la distancia.
 *
 * Es una sola pieza para los dos usos —la franja de fondo bajo la onda y la
 * pantalla completa de letra— porque son la misma cosa a distinto tamaño.
 * Manteniéndolas separadas terminaban divergiendo: una con scroll nativo y otra
 * animada, y al cambiar de vista la letra "saltaba" de estilo.
 *
 * El centrado se calcula con el alto real de cada línea, medido en el layout, y
 * no multiplicando por un alto fijo: en grande los versos se parten en dos o
 * tres renglones y con un alto constante la letra se va desalineando.
 */
export function Lyrics({ lines, atMs, visible, size = 'sm', onPickLine }: Props) {
  const s = SIZE[size]
  /** Alto de la ventana: fijo si se pidieron N líneas, si no lo da el padre. */
  const fixedH = visible ? visible * s.lineH : undefined

  const [boxH, setBoxH] = useState(fixedH ?? 0)
  const spots = useRef<{ y: number; h: number }[]>([])
  const offset = useSharedValue(0)
  /** El primer centrado es un salto, no una animación: nadie lo vio moverse. */
  const settled = useRef(false)

  // Antes de la primera línea el índice es -1; ahí se muestra la primera, en
  // espera, en vez de dejar la columna corrida y un hueco enorme arriba.
  const index = activeLyricIndex(lines, atMs)
  const target = Math.max(0, index)

  const center = useCallback(
    (i: number) => {
      const spot = spots.current[i]
      if (!spot || !boxH) return
      const to = boxH / 2 - (spot.y + spot.h / 2)
      if (settled.current) {
        offset.value = withTiming(to, { duration: 380, easing: Easing.out(Easing.cubic) })
      } else {
        offset.value = to
        settled.current = true
      }
    },
    [boxH, offset],
  )

  useEffect(() => {
    center(target)
  }, [target, center])

  const columnStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }))

  if (!lines.length) return null

  return (
    <View
      style={fixedH ? { height: fixedH } : undefined}
      className={`overflow-hidden ${fixedH ? '' : 'flex-1'}`}
      onLayout={(e) => setBoxH(e.nativeEvent.layout.height)}
      accessibilityLabel="Letra de la canción"
    >
      <Animated.View style={columnStyle}>
        {lines.map((line, i) => (
          <Line
            key={`${line.atMs}-${i}`}
            text={line.text}
            distance={i - index}
            size={s}
            onMeasure={(y, h) => {
              spots.current[i] = { y, h }
              // La medida llega después del primer render: si la que se acaba
              // de medir es la línea activa, recién ahí se puede centrar.
              if (i === target) center(target)
            }}
            onPress={onPickLine && (() => onPickLine(line.atMs))}
          />
        ))}
      </Animated.View>
    </View>
  )
}

function Line({
  text,
  distance,
  size,
  onMeasure,
  onPress,
}: {
  text: string
  distance: number
  size: (typeof SIZE)[LyricsSize]
  onMeasure: (y: number, h: number) => void
  onPress?: () => void
}) {
  const active = distance === 0
  /*
   * Las que ya pasaron se apagan más que las que vienen: lo que sigue importa
   * más que lo que ya sonó. Los pisos son altos a propósito — sobre negro puro,
   * por debajo de 0.4 el texto deja de leerse y la letra parece cortada en vez
   * de atenuada.
   *
   * El color va inline y no por className: NativeWind no procesa clases sobre
   * componentes animados, y una `Animated.Text className="text-foreground"`
   * termina cayendo al color por defecto — negro sobre negro.
   */
  const opacity = active
    ? 1
    : distance < 0
      ? Math.max(0.4, 0.62 + distance * 0.1)
      : Math.max(0.45, 0.75 - distance * 0.12)

  const layout = (e: LayoutChangeEvent) =>
    onMeasure(e.nativeEvent.layout.y, e.nativeEvent.layout.height)

  const box = size.wrap
    ? { paddingVertical: size.gap, justifyContent: 'center' as const, alignItems: 'center' as const }
    : { height: size.lineH, justifyContent: 'center' as const, alignItems: 'center' as const }

  const body = (
    <Text
      numberOfLines={size.wrap ? undefined : 1}
      ellipsizeMode="tail"
      style={{
        color: '#FFFFFF',
        opacity,
        fontSize: active ? size.active : size.idle,
        lineHeight: (active ? size.active : size.idle) * 1.35,
        fontWeight: active ? '600' : '400',
        textAlign: 'center',
      }}
    >
      {text}
    </Text>
  )

  if (!onPress) {
    return (
      <View style={box} onLayout={layout}>
        {body}
      </View>
    )
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Mueve el recorte a esta parte de la canción"
      style={box}
      onLayout={layout}
      onPress={onPress}
      className="active:opacity-60"
    >
      {body}
    </Pressable>
  )
}
