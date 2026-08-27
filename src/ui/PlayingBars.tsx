import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'

/*
 * Las barras salen de la misma familia que la onda del editor: mismo ancho,
 * misma separación y el blanco puro reservado para lo que está activo — que
 * acá es, justamente, lo que está sonando. Ver `Waveform.tsx` y
 * `docs/DESIGN.md`.
 */
const BAR_W = 3
const BAR_GAP = 2
const MIN_H = 0.25
/** Cada barra late a su propio ritmo; si fueran iguales se vería un bloque. */
const BEATS_MS = [520, 380, 620, 440]

/**
 * El indicador de "esto es lo que suena", en la fila de una lista.
 *
 * Es el ecualizador de Spotify: en una tabla donde todas las filas se parecen,
 * el movimiento distingue la que suena mucho más rápido que un cambio de color
 * — y en una interfaz sin colores, que es la nuestra, directamente es la única
 * forma que queda.
 *
 * En pausa las barras se quedan quietas y bajas: sigue marcando cuál es la
 * canción, sin mentir que está sonando.
 */
export function PlayingBars({ playing, size = 14 }: { playing: boolean; size?: number }) {
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={playing ? 'Sonando' : 'En pausa'}
      className="flex-row items-end"
      style={{ height: size, gap: BAR_GAP }}
    >
      {BEATS_MS.map((beat) => (
        <Bar key={beat} playing={playing} beatMs={beat} height={size} />
      ))}
    </View>
  )
}

function Bar({
  playing,
  beatMs,
  height,
}: {
  playing: boolean
  beatMs: number
  height: number
}) {
  /*
   * Se anima la **altura**, no `scaleY`.
   *
   * Escalar deformaba el `borderRadius`: una barra comprimida al 25% con
   * `scaleY` aplasta su radio de 1px en la misma proporción, así que las barras
   * cortas quedaban con la punta achatada —esquinas elípticas— y el ecualizador
   * se leía como líneas mal dibujadas. Con la altura directa, cada barra es un
   * rectángulo redondeado nítido midan lo que midan, y el `items-end` del
   * contenedor mantiene todas las bases en la misma línea sin depender de que el
   * `transformOrigin` sobreviva a Reanimated en web (no siempre lo hace).
   */
  const alto = useSharedValue(height * MIN_H)

  useEffect(() => {
    if (!playing) {
      cancelAnimation(alto)
      alto.value = withTiming(height * MIN_H, { duration: 180 })
      return
    }
    alto.value = withRepeat(
      withSequence(
        withTiming(height, { duration: beatMs }),
        withTiming(height * MIN_H, { duration: beatMs }),
      ),
      -1,
      false,
    )
    return () => cancelAnimation(alto)
  }, [playing, beatMs, height, alto])

  /*
   * NativeWind no procesa `className` en componentes de Reanimated: el color va
   * por `style` o la barra se dibuja invisible. Es la trampa documentada en
   * docs/DESIGN.md, y #FFFFFF es el token `foreground`.
   */
  const style = useAnimatedStyle(() => ({
    height: alto.value,
  }))

  return (
    <Animated.View
      style={[
        {
          width: BAR_W,
          backgroundColor: '#FFFFFF',
          borderRadius: 1,
        },
        style,
      ]}
    />
  )
}
