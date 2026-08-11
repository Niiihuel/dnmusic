import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated'

/** Cuántas barras tiene la cava. */
const BARRAS = 28
/** Alto mínimo de una barra, en fracción del total. Ninguna llega a cero. */
const PISO = 0.16

/**
 * La cava: las barras de una canción.
 *
 * **No es la onda del audio.** La onda de verdad —la que dibuja `Waveform` en
 * el editor de fragmento— necesita picos medidos, y medirlos obliga a
 * decodificar el tema entero: demasiado caro para dibujar un perfil, y el dato
 * no está guardado en ningún lado.
 *
 * Esto es otra cosa y no pretende disimularlo: una **firma** de la canción. Las
 * alturas salen de su identificador, así que cada tema tiene siempre la misma
 * silueta y dos temas distintos nunca se ven igual. Es constante, es
 * reconocible, y no miente sobre lo que suena porque nadie puede leer una forma
 * de onda como si fuera una partitura.
 *
 * Quieta cuando no suena y latiendo cuando sí, que es la parte que sí dice algo
 * cierto.
 */
export function Cava({
  seed,
  playing = false,
  height = 44,
  color = 'rgba(255,255,255,0.55)',
}: {
  /** De acá salen las alturas. El videoId de la canción. */
  seed: string
  playing?: boolean
  height?: number
  color?: string
}) {
  const alturas = siluetaDe(seed)

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={playing ? 'Sonando' : 'En pausa'}
      className="flex-row items-center"
      style={{ height, gap: 3 }}
    >
      {alturas.map((alto, i) => (
        <Barra key={i} alto={alto} indice={i} playing={playing} height={height} color={color} />
      ))}
    </View>
  )
}

function Barra({
  alto,
  indice,
  playing,
  height,
  color,
}: {
  alto: number
  indice: number
  playing: boolean
  height: number
  color: string
}) {
  const escala = useSharedValue(1)

  useEffect(() => {
    if (!playing) {
      cancelAnimation(escala)
      escala.value = withTiming(1, { duration: 220 })
      return
    }
    /*
     * Cada barra late a su propio ritmo.
     *
     * Con todas al mismo compás la cava sube y baja en bloque, que parece un
     * ecualizador roto. El desfasaje sale del índice —no del azar— para que dos
     * dibujados de la misma canción se muevan igual.
     */
    const ms = 420 + ((indice * 137) % 260)
    escala.value = withRepeat(
      withTiming(0.45, { duration: ms, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    )
    return () => cancelAnimation(escala)
  }, [playing, indice, escala])

  /* El estilo va por `style` y nunca por `className`: NativeWind no procesa
     clases en componentes animados. Ver `docs/DESIGN.md`. */
  const animado = useAnimatedStyle(() => ({ transform: [{ scaleY: escala.value }] }))

  return (
    <Animated.View
      style={[
        {
          flex: 1,
          height: Math.max(2, alto * height),
          borderRadius: 999,
          backgroundColor: color,
        },
        animado,
      ]}
    />
  )
}

/**
 * La silueta de una canción: siempre la misma para el mismo id.
 *
 * Un hash barato de tipo FNV sobre el texto, del que se van sacando las alturas.
 * No hace falta que sea bueno como hash —no protege nada— sino que **reparta**:
 * que ids parecidos den siluetas distintas, y que ninguna quede plana.
 */
function siluetaDe(seed: string): number[] {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }

  const alturas: number[] = []
  for (let i = 0; i < BARRAS; i++) {
    h ^= h << 13
    h ^= h >>> 17
    h ^= h << 5
    const v = Math.abs(h % 1000) / 1000
    /*
     * Las de los bordes se acortan y las del medio se estiran: sin esto la cava
     * es un rectángulo ruidoso. La campana la da un seno sobre la posición.
     */
    const campana = Math.sin((Math.PI * (i + 0.5)) / BARRAS)
    alturas.push(PISO + v * (1 - PISO) * (0.45 + 0.55 * campana))
  }
  return alturas
}
