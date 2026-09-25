import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Platform, Text, View } from 'react-native'
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
import {
  CUE_FINE_STEP_MS,
  DRAG_CONTEXT_SHARE,
  cueFromFocusDrag,
  cueFromOverviewX,
  detailAmplitudeScale,
  mixWaveformZoom,
  sampleMixWaveform,
  stepMixCue,
  type MixWaveformDetail,
} from '../lib/mixWaveformZoom'
import { BotonVidrio } from './Glass'
import { mixSpectrumPaths, validMixSpectrum, type MixSpectrumBands,
  type MixSpectrumPaths } from '../lib/mixSpectrum'

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
const MIX_SPECTRUM_DIM = { low: '#8D502F', mid: '#9F7C50', high: '#2C4C8E' }
const MIX_SPECTRUM_LIT = { low: '#F18E46', mid: '#FFD391', high: '#3B78E7' }

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
  /** Energía PCM medida de graves, medios y agudos; opcional en cachés viejas. */
  bands?: MixSpectrumBands | null
  /** Duración total de la canción, en ms. */
  durationMs: number
  /** Marcas medidas por el análisis; se omiten si no hay una grilla fiable. */
  beatMs?: readonly number[] | null
  barMs?: readonly number[] | null
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
  /** Dibujo alineado exactamente con la ventana seleccionada, por encima de barras y grilla. */
  overlay?: ReactNode
  /** Editor de mixes: vista global para mover el cue y vista cercana para leer la transición. */
  zoomed?: boolean
  /** Vista móvil del editor: mantiene las dos ondas visibles y deja el ajuste fino en Controles avanzados. */
  compact?: boolean
  /** PCM medido de la ventana cercana, si ya está disponible. */
  detailPeaks?: (MixWaveformDetail & { bands?: MixSpectrumBands | null }) | null
  /** Impide mover cues cuando la persona no tiene permiso para editar este mix. */
  editable?: boolean
  /** Nombre de la canción para tecnología asistiva. */
  label?: string
}

export function Waveform(props: Props) {
  return props.zoomed ? <ZoomedWaveform {...props} /> : <LegacyWaveform {...props} />
}

/**
 * Onda con ventana de recorte, al modelo de Instagram.
 *
 * La ventana está fija en el centro y lo que se arrastra es la canción por
 * debajo. La escala se deriva de la ventana: se calcula cuántas barras entran a
 * lo ancho y se remuestrea la onda, para que el recorte ocupe siempre el mismo
 * espacio en pantalla sin importar cuán larga sea la canción.
 */
function LegacyWaveform({
  peaks,
  durationMs,
  beatMs,
  barMs,
  windowMs,
  startMs,
  onChangeStart,
  positionMs,
  onScrub,
  playing = false,
  height = 88,
  overlay,
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
  const grid = useMemo(() => {
    if (!pxPerMs || !durationMs) return null
    const path = (times: readonly number[] | null | undefined) => (times ?? [])
      .filter(ms => Number.isFinite(ms) && ms >= 0 && ms <= durationMs)
      .slice(0, 4_000)
      .map(ms => `M${(ms * pxPerMs).toFixed(1)} 0v${height}`)
      .join('')
    return { beats: path(beatMs), bars: path(barMs) }
  }, [pxPerMs, durationMs, beatMs, barMs, height])
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
    const next = Math.round(Math.max(0, Math.min(maxStartMs, ms)))
    if (next !== startMs) onChangeStart(next)
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
    .onEnd((event) => {
      if (scrubbing.value) runOnJS(scrub)(scrubMs.value)
      else if (Math.abs(event.translationX) >= 4) runOnJS(commit)(translate.value)
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
          {grid && (grid.beats || grid.bars) ? <Animated.View pointerEvents="none"
            style={[{ position: 'absolute', left: -windowLeft, top: 0 }, stripStyle]}>
            <Svg width={geom.stripW} height={height}>
              {grid.beats ? <Path d={grid.beats} stroke="rgba(255,255,255,0.22)" strokeWidth={0.7} /> : null}
              {grid.bars ? <Path d={grid.bars} stroke="rgba(255,255,255,0.5)" strokeWidth={1.4} /> : null}
            </Svg>
          </Animated.View> : null}
          {overlay}
        </View>

      </View>
    </GestureDetector>
  )
}

/**
 * El overview muestra la canción entera y permite saltar a cualquier cue.
 * Abajo se dibuja solamente el entorno del cruce: la selección conserva el
 * 76 % del ancho incluso si el tema dura varios minutos y el cruce 250 ms.
 */
function ZoomedWaveform({
  peaks,
  bands,
  detailPeaks,
  durationMs,
  beatMs,
  barMs,
  windowMs,
  startMs,
  onChangeStart,
  positionMs,
  onScrub,
  height = 88,
  overlay,
  editable = true,
  label = 'canción',
  compact = false,
}: Props) {
  const [width, setWidth] = useState(0)
  const geometry = useMemo(
    () => mixWaveformZoom(width, durationMs, windowMs, startMs),
    [width, durationMs, windowMs, startMs],
  )
  const overviewHeight = compact ? 28 : 36
  const overviewHitHeight = compact ? 38 : 44
  const gap = compact ? 6 : 8

  const overview = useMemo(() => {
    if (!width || !peaks.length) return null
    const count = Math.max(12, Math.floor(width / PITCH))
    const bars = remuestrear(peaks, count)
    const pitch = width / bars.length
    const spectrum = validMixSpectrum(bands, peaks.length)
      ? mixSpectrumPaths(bars, {
        low: remuestrear([...bands.low], count),
        mid: remuestrear([...bands.mid], count),
        high: remuestrear([...bands.high], count),
      }, pitch, overviewHeight, Math.max(1, pitch - HUECO)) : null
    return { path: trazoDeBarras(bars, pitch, overviewHeight, Math.max(1, pitch - HUECO)), spectrum,
      strokeWidth: Math.max(1, pitch - HUECO) }
  }, [width, peaks, bands, overviewHeight])

  const detail = useMemo(() => {
    if (!geometry || !peaks.length) return null
    const count = Math.max(12, Math.floor(geometry.renderWidth / PITCH))
    const detailScale = detailAmplitudeScale(peaks, durationMs, detailPeaks)
    const bars = sampleMixWaveform(peaks, durationMs, geometry.renderStartMs,
      geometry.pxPerMs, geometry.renderWidth, count, detailPeaks, detailScale)
    const pitch = geometry.renderWidth / bars.length
    const globalBands = validMixSpectrum(bands, peaks.length) ? bands : null
    const localBands = detailPeaks && validMixSpectrum(detailPeaks.bands, detailPeaks.peaks.length)
      ? detailPeaks.bands : null
    const sampleBand = (band: 'low' | 'mid' | 'high') => sampleMixWaveform(
      globalBands?.[band] ?? Array(peaks.length).fill(0), durationMs, geometry.renderStartMs,
      geometry.pxPerMs, geometry.renderWidth, count,
      localBands && detailPeaks ? { ...detailPeaks, peaks: localBands[band] } : null,
      detailScale,
    )
    const spectrum = globalBands || localBands
      ? mixSpectrumPaths(bars, { low: sampleBand('low'), mid: sampleBand('mid'), high: sampleBand('high') },
        pitch, height, Math.max(1, pitch - HUECO)) : null
    return {
      path: trazoDeBarras(bars, pitch, height, Math.max(1, pitch - HUECO)),
      spectrum,
      strokeWidth: Math.max(1, pitch - HUECO),
    }
  }, [geometry, peaks, bands, detailPeaks, durationMs, height])

  const grid = useMemo(() => {
    if (!geometry) return null
    const start = geometry.renderStartMs
    const end = start + geometry.renderWidth / geometry.pxPerMs
    const trace = (times: readonly number[] | null | undefined) => (times ?? [])
      .filter(ms => ms >= start && ms <= end)
      .slice(0, 300)
      .map(ms => `M${((ms - start) * geometry.pxPerMs).toFixed(1)} 0v${height}`)
      .join('')
    return { beats: trace(beatMs), bars: trace(barMs) }
  }, [geometry, beatMs, barMs, height])

  const overviewX = useSharedValue(0)
  const overviewFrom = useSharedValue(0)
  const detailDrag = useSharedValue(0)
  const dragging = useSharedValue(false)
  const fallbackPosition = useSharedValue(0)
  const position = positionMs ?? fallbackPosition
  useEffect(() => {
    overviewX.set(geometry?.overviewLeft ?? 0)
    detailDrag.set(0)
  }, [geometry?.overviewLeft, overviewX, detailDrag])

  const overviewStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: overviewX.value }],
    borderColor: dragging.value ? '#FFFFFF' : 'rgba(255,255,255,0.72)',
    backgroundColor: dragging.value ? 'rgba(255,255,255,0.27)' : 'rgba(255,255,255,0.14)',
  }))
  const detailStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: detailDrag.value }],
  }))
  const detailSelectionStyle = useAnimatedStyle(() => ({
    borderColor: dragging.value ? '#FFFFFF' : 'rgba(255,255,255,0.55)',
    backgroundColor: dragging.value ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.035)',
  }))
  const cursorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (position.value - startMs) * (geometry?.pxPerMs ?? 0) }],
    opacity: positionMs && position.value >= startMs && position.value <= startMs + windowMs ? 1 : 0,
  }))

  const commitOverview = (x: number, deltaX?: number) => {
    if (!geometry || (deltaX !== undefined && Math.abs(deltaX) < 4)) return
    const next = cueFromOverviewX(x, geometry, width)
    if (next !== startMs) onChangeStart(next)
  }
  const commitDetail = (deltaX: number) => {
    if (!geometry || Math.abs(deltaX) < 4) return
    const next = cueFromFocusDrag(startMs, deltaX, geometry)
    if (next !== startMs) onChangeStart(next)
  }
  const adjustCue = (deltaMs: number) => {
    if (!geometry || !editable) return
    const next = stepMixCue(startMs, deltaMs, geometry.maxStartMs)
    if (next !== startMs) onChangeStart(next)
  }
  const setCue = (next: number) => {
    if (!geometry || !editable) return
    const clamped = stepMixCue(next, 0, geometry.maxStartMs)
    if (clamped !== startMs) onChangeStart(clamped)
  }
  const formatCue = (ms: number) => {
    const tenths = Math.round(Math.max(0, ms) / 100)
    return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, '0')},${tenths % 10}`
  }
  const scrubDetail = (x: number) => {
    if (!geometry || !onScrub) return
    onScrub(Math.round(Math.max(startMs, Math.min(startMs + windowMs,
      startMs + (x - geometry.windowLeft) / geometry.pxPerMs))))
  }

  const maxOverviewX = width - (geometry?.overviewWidth ?? 0)
  const overviewPan = Gesture.Pan()
    .enabled(editable && !!geometry && geometry.maxStartMs > 0)
    .onStart(() => { overviewFrom.value = overviewX.value; dragging.value = true })
    .onUpdate(event => {
      overviewX.set(Math.max(0, Math.min(maxOverviewX, overviewFrom.value + event.translationX)))
    })
    .onEnd(event => { runOnJS(commitOverview)(overviewX.value, event.translationX) })
    .onFinalize((_event, success) => {
      dragging.value = false
      if (!success) overviewX.set(geometry?.overviewLeft ?? 0)
    })
    .activeOffsetX([-4, 4])
  const overviewTap = Gesture.Tap()
    .enabled(editable && !!geometry && geometry.maxStartMs > 0)
    .onEnd(event => {
      runOnJS(commitOverview)(Math.max(0, Math.min(maxOverviewX,
        event.x - (geometry?.overviewWidth ?? 0) / 2)))
    })
  const detailPan = Gesture.Pan()
    .enabled(editable && !!geometry && geometry.maxStartMs > 0)
    .onStart(() => { detailDrag.set(0); dragging.value = true })
    .onUpdate(event => {
      const maxVisualDrag = width * DRAG_CONTEXT_SHARE
      const offset = Math.max(-maxVisualDrag, Math.min(maxVisualDrag, event.translationX))
      detailDrag.set(offset)
      if (geometry && geometry.maxStartMs > 0) {
        const next = Math.max(0, Math.min(geometry.maxStartMs, startMs - offset / geometry.pxPerMs))
        overviewX.set(next / geometry.maxStartMs * maxOverviewX)
      }
    })
    .onEnd(() => { runOnJS(commitDetail)(detailDrag.value) })
    .onFinalize((_event, success) => {
      detailDrag.set(0)
      dragging.value = false
      if (!success) overviewX.set(geometry?.overviewLeft ?? 0)
    })
    .activeOffsetX([-4, 4])
  const detailTap = Gesture.Tap()
    .enabled(!!onScrub)
    .onEnd(event => { runOnJS(scrubDetail)(event.x) })

  if (!geometry || !overview || !detail) {
    return <View onLayout={event => setWidth(event.nativeEvent.layout.width)}
      style={{ height: overviewHitHeight + gap + height }} />
  }

  const painted = (spectrum: MixSpectrumPaths | null, path: string, strokeWidth: number,
    width: number, drawHeight: number, fallbackColor: string, active: boolean) =>
    <Svg width={width} height={drawHeight}>
      {spectrum ? <>
        <Path d={spectrum.low} fill="none" stroke={active ? MIX_SPECTRUM_LIT.low : MIX_SPECTRUM_DIM.low}
          strokeWidth={strokeWidth} />
        <Path d={spectrum.mid} fill="none" stroke={active ? MIX_SPECTRUM_LIT.mid : MIX_SPECTRUM_DIM.mid}
          strokeWidth={strokeWidth} />
        <Path d={spectrum.high} fill="none" stroke={active ? MIX_SPECTRUM_LIT.high : MIX_SPECTRUM_DIM.high}
          strokeWidth={strokeWidth} />
        <Path d={spectrum.fallback} fill="none" stroke={fallbackColor}
          strokeWidth={strokeWidth} strokeLinecap="round" />
      </> : <Path d={path} fill="none" stroke={fallbackColor}
        strokeWidth={strokeWidth} strokeLinecap="round" />}
    </Svg>
  const detailStrip = (active: boolean) => painted(detail.spectrum, detail.path, detail.strokeWidth,
    geometry.renderWidth, height, active ? BAR_PLAYED : BAR_OUTSIDE, active)

  const keyboard = Platform.OS === 'web' ? {
    tabIndex: editable ? 0 : -1,
    'aria-valuemin': 0,
    'aria-valuemax': Math.round(geometry.maxStartMs / CUE_FINE_STEP_MS),
    'aria-valuenow': Math.round(startMs / CUE_FINE_STEP_MS),
    'aria-valuetext': formatCue(startMs),
    onKeyDown: (event: { key: string; shiftKey?: boolean; preventDefault: () => void }) => {
      if (!editable) return
      const step = CUE_FINE_STEP_MS * (event.shiftKey ? 10 : 1)
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? geometry.maxStartMs
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? startMs - step
          : event.key === 'ArrowRight' || event.key === 'ArrowUp' ? startMs + step : null
      if (next === null) return
      event.preventDefault()
      setCue(next)
    },
  } as object : {}

  return <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ gap }}>
    <GestureDetector gesture={Gesture.Race(overviewPan, overviewTap)}>
      <View {...keyboard}
        accessibilityRole="adjustable"
        accessibilityLabel={`Punto de mezcla de ${label}`}
        accessibilityHint="Arrastrá la selección o usá las flechas para ajustar el punto de la canción"
        accessibilityValue={{ min: 0, max: Math.round(geometry.maxStartMs / CUE_FINE_STEP_MS),
          now: Math.round(startMs / CUE_FINE_STEP_MS), text: formatCue(startMs) }}
        accessibilityActions={editable ? [{ name: 'increment', label: 'Avanzar 0,1 segundos' },
          { name: 'decrement', label: 'Retroceder 0,1 segundos' }] : []}
        onAccessibilityAction={event => {
          if (event.nativeEvent.actionName === 'increment') adjustCue(CUE_FINE_STEP_MS)
          if (event.nativeEvent.actionName === 'decrement') adjustCue(-CUE_FINE_STEP_MS)
        }}
        style={{ height: overviewHitHeight, overflow: 'hidden', borderRadius: 8,
          backgroundColor: '#202020', justifyContent: 'center',
          cursor: editable ? 'grab' : 'default' } as never}>
        {painted(overview.spectrum, overview.path, overview.strokeWidth,
          width, overviewHeight, BAR_OUTSIDE, false)}
        <Animated.View pointerEvents="none" style={[{
          position: 'absolute', left: 0, top: (overviewHitHeight - overviewHeight) / 2,
          height: overviewHeight, width: geometry.overviewWidth, borderWidth: 1.5,
          borderRadius: 5, alignItems: 'center', justifyContent: 'center',
        }, overviewStyle]}>
          <View style={{ flexDirection: 'row', gap: 3 }}>
            <View style={{ width: 1.5, height: 12, borderRadius: 1, backgroundColor: '#FFFFFF' }} />
            <View style={{ width: 1.5, height: 12, borderRadius: 1, backgroundColor: '#FFFFFF' }} />
          </View>
        </Animated.View>
      </View>
    </GestureDetector>
    <GestureDetector gesture={Gesture.Race(detailPan, detailTap)}>
      <View style={{ height, overflow: 'hidden', borderRadius: 10, justifyContent: 'center',
        cursor: editable ? 'grab' : 'default' } as never}>
        <Animated.View style={[{ position: 'absolute', left: geometry.renderLeft }, detailStyle]}>
          {detailStrip(false)}
        </Animated.View>
        <Animated.View pointerEvents="none" style={[{
          position: 'absolute', left: geometry.windowLeft, width: geometry.windowWidth,
          height, borderRadius: 10, overflow: 'hidden', borderWidth: 1,
        }, detailSelectionStyle]}>
          <Animated.View style={[{
            position: 'absolute', left: geometry.renderLeft - geometry.windowLeft,
          }, detailStyle]}>
            {detailStrip(true)}
          </Animated.View>
          {grid && (grid.beats || grid.bars) ? <Animated.View style={[{
            position: 'absolute', left: geometry.renderLeft - geometry.windowLeft,
          }, detailStyle]}>
            <Svg width={geometry.renderWidth} height={height}>
              {grid.beats ? <Path d={grid.beats} stroke="rgba(255,255,255,0.22)" strokeWidth={0.7} /> : null}
              {grid.bars ? <Path d={grid.bars} stroke="rgba(255,255,255,0.5)" strokeWidth={1.4} /> : null}
            </Svg>
          </Animated.View> : null}
          {overlay}
          {positionMs ? <Animated.View pointerEvents="none" style={[{
            position: 'absolute', left: 0, top: 0, width: 4, height,
            backgroundColor: '#121212', alignItems: 'center',
          }, cursorStyle]}>
            <View style={{ width: 2, height, backgroundColor: '#FFFFFF' }} />
          </Animated.View> : null}
          <View style={{ position: 'absolute', left: 5, top: Math.max(0, (height - 24) / 2),
            width: 2, height: 24, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.6)' }} />
          <View style={{ position: 'absolute', right: 5, top: Math.max(0, (height - 24) / 2),
            width: 2, height: 24, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.6)' }} />
        </Animated.View>
      </View>
    </GestureDetector>
    {!compact ? <View style={{ minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text style={{ flex: 1, color: '#B3B3B3', fontSize: 12 }}>
        Punto {formatCue(startMs)} · arrastrá la onda
      </Text>
      <BotonVidrio label={`Retroceder punto de ${label} 0,1 segundos`}
        disabled={!editable || startMs <= 0} onPress={() => adjustCue(-CUE_FINE_STEP_MS)}
        style={{ minWidth: 68, height: 34 }}>
        <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600' }}>−0,1 s</Text>
      </BotonVidrio>
      <BotonVidrio label={`Avanzar punto de ${label} 0,1 segundos`}
        disabled={!editable || startMs >= geometry.maxStartMs} onPress={() => adjustCue(CUE_FINE_STEP_MS)}
        style={{ minWidth: 68, height: 34 }}>
        <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600' }}>+0,1 s</Text>
      </BotonVidrio>
    </View> : null}
  </View>
}
