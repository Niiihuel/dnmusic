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
import { usePlaybackDurationMs, usePlaybackPositionMs, usePlaybackTrack } from '../state/playback'
import { usePicos } from './Onda'

/*
 * Las barras salen de la misma familia que la onda del editor: mismo ancho,
 * misma separación y el blanco puro reservado para lo que está activo — que
 * acá es, justamente, lo que está sonando. Ver `Waveform.tsx` y
 * `docs/DESIGN.md`.
 */
const BAR_W = 3
const BAR_GAP = 2
const MIN_H = 0.25
/** Cuántas barras. */
const BARRAS = 4
/** Cada barra late a su propio ritmo; si fueran iguales se vería un bloque. */
const BEATS_MS = [520, 380, 620, 440]
/**
 * En cuántos tramos se pide la onda para seguirla: con 480 sobre un tema de
 * cuatro minutos, cada tramo es medio segundo, que es lo que tarda el ojo en
 * leer un cambio de altura. Más fino sería pedir más de lo que se dibuja.
 */
const TRAMOS = 480
/** Lo que tarda una barra en llegar a su altura nueva: un latido, no un salto. */
const SUAVE_MS = 220

/**
 * El indicador de "esto es lo que suena", en la fila de una lista.
 *
 * Es el ecualizador de Spotify: en una tabla donde todas las filas se parecen,
 * el movimiento distingue la que suena mucho más rápido que un cambio de color
 * — y en una interfaz sin colores, que es la nuestra, directamente es la única
 * forma que queda.
 *
 * **Sigue el sonido de verdad.** Las cuatro barras son los últimos cuatro
 * tramos de la onda de la canción a la altura por la que va la reproducción:
 * en un silencio bajan, en un golpe suben. La onda es la misma que dibuja el
 * reproductor de fragmentos (`usePicos`, ya en caché) y la posición la que el
 * motor reporta al store — nada nuevo que calcular ni escuchar. Mientras la
 * onda no llegó, laten a ritmo propio, que es lo que hacían antes: mejor un
 * pulso genérico que un bloque quieto sobre algo que suena.
 *
 * En pausa las barras se quedan quietas y bajas: sigue marcando cuál es la
 * canción, sin mentir que está sonando.
 */
export function PlayingBars({
  playing,
  size = 14,
  videoId,
}: {
  playing: boolean
  size?: number
  /** De qué canción seguir la onda. Sin esto, la que está en el reproductor. */
  videoId?: string
}) {
  const actual = usePlaybackTrack()
  const id = videoId ?? actual?.videoId
  const picos = usePicos(id, undefined, TRAMOS)
  const posicionMs = usePlaybackPositionMs()
  const duracionMs = usePlaybackDurationMs()

  /* En qué tramo de la onda va la canción; -1 si no hay con qué. */
  const tramo =
    picos && duracionMs > 0
      ? Math.min(picos.length - 1, Math.max(0, Math.floor((posicionMs / duracionMs) * picos.length)))
      : -1

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={playing ? 'Sonando' : 'En pausa'}
      className="flex-row items-end"
      style={{ height: size, gap: BAR_GAP }}
    >
      {BEATS_MS.map((beat, i) => (
        <Bar
          key={beat}
          playing={playing}
          beatMs={beat}
          height={size}
          /* Las cuatro barras son los cuatro tramos que terminan en el
             actual: la de la derecha es «ahora», las otras el segundo previo. */
          pico={tramo >= 0 && picos ? (picos[tramo - (BARRAS - 1 - i)] ?? 0) : null}
        />
      ))}
    </View>
  )
}

function Bar({
  playing,
  beatMs,
  height,
  pico,
}: {
  playing: boolean
  beatMs: number
  height: number
  /** La altura que pide la onda, 0–1. `null` es «no hay onda»: late solo. */
  pico: number | null
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
    if (pico !== null) {
      /* Con onda: la barra va a la altura del tramo, suave. Nunca a cero — un
         silencio se ve como la barra en su mínimo, no como que desapareció. */
      cancelAnimation(alto)
      const objetivo = height * (MIN_H + (1 - MIN_H) * Math.min(1, Math.max(0, pico)))
      alto.value = withTiming(objetivo, { duration: SUAVE_MS })
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
  }, [playing, beatMs, height, alto, pico])

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
