import { useEffect, useMemo, useState } from 'react'
import { View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Svg, { Path } from 'react-native-svg'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated'
import {
  BARRA,
  HUECO,
  ONDA_ADELANTE,
  ONDA_PENDIENTE,
  ONDA_SONADA,
  remuestrear,
  trazoDeBarras,
} from './Onda'

/** Ancho ideal de una barra más su separación. La misma geometría que `Onda`. */
const PITCH = BARRA + HUECO
/** Tope de barras dibujadas: más que esto no se distinguen a simple vista. */
const MAX_BARS = 800

/*
 * Los tres tonos de la onda, de más apagado a más brillante: fuera del recorte,
 * dentro pero todavía sin sonar, y ya reproducido. Son los mismos que usa la
 * onda de las tarjetas — separados por luminancia, nunca por color.
 */
const BAR_OUTSIDE = ONDA_PENDIENTE
const BAR_AHEAD = ONDA_ADELANTE
const BAR_PLAYED = ONDA_SONADA

/**
 * Qué tan cerca del borde de la pintura hay que agarrar para mover la
 * reproducción en vez de correr la canción bajo el recorte.
 *
 * Antes ese borde lo marcaba un cursor dibujado; ahora es el límite entre lo
 * blanco y lo gris, que es igual de visible y no tapa las barras.
 */
const GRAB_PX = 24

type Props = {
  /** Amplitudes 0..1 de la canción completa. */
  peaks: number[]
  /** Duración total de la canción, en ms. */
  durationMs: number
  /** Largo de la ventana de selección, en ms. */
  windowMs: number
  startMs: number
  onChangeStart: (startMs: number) => void
  /**
   * Posición de reproducción, como shared value.
   *
   * Va por shared value y no por prop numérica a propósito: con una prop, cada
   * cuadro de reproducción provocaba un render de React que rehacía la onda
   * entera, y el cursor avanzaba a saltos. Así el cursor se mueve en el hilo de
   * UI y el árbol de React no se toca.
   */
  positionMs?: SharedValue<number>
  /**
   * Mover la reproducción: tocando la onda, o arrastrando el cursor.
   *
   * Llega **una sola vez**, al soltar, y no en cada cuadro del arrastre: durante
   * el arrastre el cursor se mueve solo en el hilo de UI. Pedirle un salto al
   * audio por cuadro es lo que lo hacía sonar a estática.
   */
  onScrub?: (ms: number) => void
  playing?: boolean
  height?: number
}

/**
 * Onda con ventana de recorte, al modelo de Instagram.
 *
 * La ventana está fija en el centro y lo que se arrastra es la canción por
 * debajo. La escala se deriva de la ventana: se calcula cuántas barras entran a
 * lo ancho y se remuestrea la onda, para que el recorte ocupe siempre el mismo
 * espacio en pantalla sin importar cuán larga sea la canción.
 */
export function Waveform({
  peaks,
  durationMs,
  windowMs,
  startMs,
  onChangeStart,
  positionMs,
  onScrub,
  playing = false,
  height = 88,
}: Props) {
  const [width, setWidth] = useState(0)

  const geom = useMemo(() => {
    if (!width || !durationMs || !windowMs || !peaks.length) return null
    const visibleBars = Math.max(12, Math.floor(width / PITCH))
    const totalBars = Math.min(
      MAX_BARS,
      Math.max(visibleBars, Math.round(visibleBars * (durationMs / windowMs))),
    )
    const pitch = width / visibleBars
    const bars = remuestrear(peaks, totalBars)
    const barW = Math.max(1, pitch - HUECO)

    // El dibujo es el mismo que el de las tarjetas: un solo trazo para toda la
    // onda, y la misma curva para que la forma de un tema se vea igual en el
    // editor que después en el perfil o en el chat. Ver `trazoDeBarras`.
    const d = trazoDeBarras(bars, pitch, height, barW)

    return { bars, pitch, barW, path: d, stripW: totalBars * pitch, pxPerMs: (totalBars * pitch) / durationMs }
  }, [peaks, width, durationMs, windowMs, height])

  const pxPerMs = geom?.pxPerMs ?? 0
  const windowW = windowMs * pxPerMs
  const windowLeft = Math.max(0, (width - windowW) / 2)
  const maxStartMs = Math.max(0, durationMs - windowMs)

  const translate = useSharedValue(0)
  const dragFrom = useSharedValue(0)
  const fallback = useSharedValue(0)
  const position = positionMs ?? fallback
  /** Arrastre del cursor: si está en curso, y adónde va. */
  const scrubbing = useSharedValue(false)
  const scrubMs = useSharedValue(0)

  useEffect(() => {
    if (!pxPerMs) return
    translate.set(windowLeft - startMs * pxPerMs)
  }, [startMs, pxPerMs, windowLeft, translate])

  const commit = (tx: number) => {
    if (!pxPerMs) return
    const ms = (windowLeft - tx) / pxPerMs
    onChangeStart(Math.round(Math.max(0, Math.min(maxStartMs, ms))))
  }

  const scrub = (ms: number) => onScrub?.(ms)
  /** Milisegundo bajo un punto x de la vista, acotado a la ventana. */
  const timeAt = (x: number) => {
    'worklet'
    const ms = startMs + (x - windowLeft) / pxPerMs
    return Math.max(startMs, Math.min(startMs + windowMs, ms))
  }

  const minTranslate = windowLeft - maxStartMs * pxPerMs
  /*
   * Un solo gesto para las dos cosas, decidido al apoyar el dedo.
   *
   * Arrastrar cerca del cursor mueve la reproducción; arrastrar en cualquier
   * otro lado corre la canción bajo la ventana de recorte. Y si el recorte ya
   * es la canción entera no hay nada que correr, así que ahí cualquier arrastre
   * mueve la reproducción — que era justo el caso donde antes no se podía hacer
   * nada con la onda.
   */
  const pan = Gesture.Pan()
    .enabled(maxStartMs > 0 || !!onScrub)
    .onBegin((e) => {
      dragFrom.value = translate.value
      const cursorX = windowLeft + (position.value - startMs) * pxPerMs
      scrubbing.value = !!onScrub && (maxStartMs === 0 || Math.abs(e.x - cursorX) <= GRAB_PX)
      scrubMs.value = position.value
    })
    .onUpdate((e) => {
      if (scrubbing.value) {
        scrubMs.value = timeAt(e.x)
        return
      }
      translate.set(Math.max(minTranslate, Math.min(windowLeft, dragFrom.value + e.translationX)))
    })
    .onEnd(() => {
      if (scrubbing.value) runOnJS(scrub)(scrubMs.value)
      else runOnJS(commit)(translate.value)
    })
    .onFinalize(() => {
      scrubbing.value = false
    })
    .activeOffsetX([-4, 4])

  /** Tocar la onda lleva la reproducción a ese punto. */
  const tap = Gesture.Tap()
    .enabled(!!onScrub)
    .onEnd((e) => {
      runOnJS(scrub)(timeAt(e.x))
    })

  const gesture = Gesture.Race(pan, tap)

  const stripStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translate.value }] }))

  /*
   * El progreso se dibuja iluminando lo ya sonado, no oscureciendo lo que
   * falta — el modelo de Instagram.
   *
   * Antes era un velo translúcido encima de la parte pendiente: se leía como
   * "esto está apagado" en vez de "esto se está llenando", y además ensuciaba
   * el color de las barras al superponerse. Ahora las barras del recorte están
   * en blanco (el acento, que docs/DESIGN.md reserva para el estado activo) y
   * encima se recorta una copia en gris que arranca en la posición actual: lo
   * queda a la derecha se ve gris, y a medida que avanza la reproducción el
   * blanco va ganando terreno.
   *
   * Son dos desplazamientos opuestos y nada más: el recorte se corre hasta la
   * posición y la copia gris de adentro se corre en sentido contrario la misma
   * cantidad, para que sus barras sigan coincidiendo con las de abajo. Todo en
   * el hilo de UI, sin tocar el layout.
   */
  const aheadClipStyle = useAnimatedStyle(() => {
    const at = scrubbing.value ? scrubMs.value : position.value
    /*
     * La pintura queda a la vista mientras haya progreso, no solo mientras
     * suena. Ya no hay cursor que marque la posición, así que si al pausar se
     * borrara el relleno no quedaría forma de saber dónde quedó.
     *
     * Sin progreso —recorte recién elegido o movido— el recorte se ve entero
     * blanco: así se lee como "esto es lo que seleccionaste" y no como algo a
     * medio reproducir.
     */
    const started = at > startMs + 1
    return {
      transform: [{ translateX: (at - startMs) * pxPerMs }],
      opacity: playing || scrubbing.value || started ? 1 : 0,
    }
  })

  const aheadStripStyle = useAnimatedStyle(() => {
    const at = scrubbing.value ? scrubMs.value : position.value
    return { transform: [{ translateX: translate.value - (at - startMs) * pxPerMs }] }
  })

  if (!geom) {
    return <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }} />
  }

  const strip = (color: string) => (
    <Svg width={geom.stripW} height={height}>
      <Path
        d={geom.path}
        stroke={color}
        strokeWidth={geom.barW}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  )

  return (
    <GestureDetector gesture={gesture}>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{ height, overflow: 'hidden', justifyContent: 'center' }}
      >
        <Animated.View style={[{ position: 'absolute' }, stripStyle]}>
          {strip(BAR_OUTSIDE)}
        </Animated.View>

        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: windowLeft,
            width: windowW,
            height,
            borderRadius: 10,
            overflow: 'hidden',
            backgroundColor: 'rgba(255,255,255,0.045)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.32)',
            justifyContent: 'center',
          }}
        >
          <Animated.View style={[{ position: 'absolute', left: -windowLeft }, stripStyle]}>
            {strip(BAR_PLAYED)}
          </Animated.View>

          {/* Lo que todavía no sonó: las mismas barras en gris, recortadas
              desde la posición de reproducción hacia la derecha. */}
          <Animated.View
            pointerEvents="none"
            style={[
              { position: 'absolute', left: 0, top: 0, bottom: 0, width: windowW, overflow: 'hidden' },
              aheadClipStyle,
            ]}
          >
            <Animated.View
              style={[
                { position: 'absolute', left: -windowLeft, top: 0, bottom: 0, justifyContent: 'center' },
                aheadStripStyle,
              ]}
            >
              {strip(BAR_AHEAD)}
            </Animated.View>
          </Animated.View>
        </View>

      </View>
    </GestureDetector>
  )
}
