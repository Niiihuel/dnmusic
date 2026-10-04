import { useEffect, useMemo, useState } from 'react'
import { Platform, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Svg, { Path } from 'react-native-svg'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated'
import { picosDeCancion } from '../services/music'
import { ControlOnda } from './ControlOnda'

export const BARRA = 2
export const HUECO = 3
/** Ninguna barra desaparece: una parte muda sigue siendo parte de la canción. */
const MINIMA = 2

export const ONDA_PENDIENTE = 'rgba(255,255,255,0.18)'
export const ONDA_SONADA = 'rgba(255,255,255,0.90)'
/* El editor distingue el exterior del recorte, lo seleccionado y lo reproducido. */
export const ONDA_ADELANTE = 'rgba(255,255,255,0.52)'

/* La curva amplifica los RMS suaves para conservar detalle visual en mezclas parejas. */
const CURVA = 0.78

/* Reduce por promedios de tramo para evitar picos inestables al cambiar el zoom. */
export function remuestrear(picos: number[], objetivo: number): number[] {
  if (objetivo >= picos.length) return picos
  const salida: number[] = new Array(objetivo)
  const por = picos.length / objetivo
  for (let i = 0; i < objetivo; i++) {
    const desde = Math.floor(i * por)
    const hasta = Math.min(picos.length, Math.floor((i + 1) * por))
    let suma = 0
    for (let j = desde; j < hasta; j++) suma += picos[j]
    salida[i] = hasta > desde ? suma / (hasta - desde) : 0
  }
  return salida
}

/* Un Path reúne todas las barras y evita miles de nodos de layout. */
export function trazoDeBarras(
  barras: number[],
  paso: number,
  alto: number,
  grosor: number,
  escala = 0.92,
): string {
  let d = ''
  for (let i = 0; i < barras.length; i++) {
    const x = i * paso + paso / 2
    const v = Math.pow(Math.max(0, Math.min(1, barras[i])), CURVA)
    const total = Math.max(MINIMA, v * alto * escala)
    // La punta redonda sobresale medio grosor de cada lado: el segmento se
    // acorta esa cantidad para que el alto final sea el pedido.
    const interno = Math.max(0.01, total - grosor)
    const arriba = (alto - interno) / 2
    d += `M${x.toFixed(1)} ${arriba.toFixed(1)}v${interno.toFixed(1)}`
  }
  return d
}

/* Picos cacheados por videoId; devuelve null durante la carga o si no hay análisis. */
export function usePicos(
  videoId: string | undefined,
  /* Un fragmento solicita su tramo: la onda completa no conserva suficiente detalle. */
  tramo?: { desdeMs: number; durMs: number },
  barras = 140,
): number[] | null {
  const desdeMs = tramo?.desdeMs ?? 0
  const durMs = tramo?.durMs ?? 0

  const clave = `${videoId ?? ''}:${desdeMs}:${durMs}`

  /* Guardar la clave junto a los picos evita mostrar el análisis de otra canción. */
  const [listo, setListo] = useState<{ de: string; picos: number[] } | null>(null)

  useEffect(() => {
    let vive = true
    if (!videoId || videoId.startsWith('propia:')) return
    picosDeCancion(videoId, barras, durMs > 0 ? { desdeMs, durMs } : undefined)
      .then((p) => {
        if (vive) setListo({ de: clave, picos: p })
      })

      .catch(() => {})
    return () => {
      vive = false
    }
  }, [videoId, barras, desdeMs, durMs, clave])

  return listo && listo.de === clave ? listo.picos : null
}

type Props = {
  /** Amplitudes 0..1. Se remuestrean a las barras que entren a lo ancho. */
  picos: number[]
  /* El shared value mueve el relleno en UI sin renderizar React por cuadro. */
  posicionMs?: SharedValue<number>
  /** Principio del tramo dibujado dentro de la canción. */
  desdeMs?: number
  /** Largo del tramo dibujado. */
  duracionMs: number
  /* Sólo la onda activa sigue la posición compartida del reproductor. */
  activa?: boolean
  /** Mover la reproducción. Llega **al soltar**, no por cuadro. */
  onSeek?: (fraccion: number) => void
  height?: number
  /** Para el lector de pantalla: "Posición de …". */
  etiqueta: string
}

/* El recorte subpíxel permite que una barra se llene parcialmente y el progreso avance de forma continua. */
export function Onda({
  picos,
  posicionMs,
  desdeMs = 0,
  duracionMs,
  activa = true,
  onSeek,
  height = 34,
  etiqueta,
}: Props) {
  const [ancho, setAncho] = useState(0)

  const arrastrando = useSharedValue(false)
  const arrastreEn = useSharedValue(0)
  const suelto = useSharedValue(0)
  const posicion = posicionMs ?? suelto
  const altoSensible = Math.max(height, 44)
  const interactiva = !!onSeek && duracionMs > 0

  const trazo = useMemo(() => {
    const cuantas = ancho ? Math.max(8, Math.floor(ancho / (BARRA + HUECO))) : 0
    if (!cuantas || !picos.length) return ''
    /* El paso usa los picos disponibles: remuestrear no inventa barras si faltan muestras. */
    const barras = remuestrear(picos, cuantas)
    return trazoDeBarras(barras, ancho / barras.length, height, BARRA)
  }, [picos, ancho, height])

  const fraccionEn = (x: number) => {
    'worklet'
    return ancho > 0 ? Math.max(0, Math.min(1, x / ancho)) : 0
  }

  const avance = () => {
    'worklet'
    if (arrastrando.value) return arrastreEn.value
    if (!activa || duracionMs <= 0) return 0
    return Math.max(0, Math.min(1, (posicion.value - desdeMs) / duracionMs))
  }

  const mover = (f: number) => onSeek?.(f)

  const arrastre = Gesture.Pan()
    .enabled(interactiva && Platform.OS !== 'web')
    /* El gesto horizontal debe ceder al scroll vertical. */
    .activeOffsetX([-4, 4])
    .onStart((e) => {
      arrastrando.value = true
      arrastreEn.value = fraccionEn(e.x)
    })
    .onUpdate((e) => {
      arrastreEn.value = fraccionEn(e.x)
    })
    .onEnd((e) => {
      runOnJS(mover)(fraccionEn(e.x))
    })
    .onFinalize(() => {
      arrastrando.value = false
    })

  const toque = Gesture.Tap()
    .enabled(interactiva && Platform.OS !== 'web')
    .onEnd((e) => {
      runOnJS(mover)(fraccionEn(e.x))
    })

  /* Los desplazamientos opuestos alinean ambos trazos sin modificar layout ni redondear el progreso a píxeles. */
  const recorte = useAnimatedStyle(() => ({ transform: [{ translateX: -(1 - avance()) * ancho }] }))
  const relleno = useAnimatedStyle(() => ({ transform: [{ translateX: (1 - avance()) * ancho }] }))

  const barras = (color: string) => (
    <Svg width={ancho} height={height}>
      <Path d={trazo} stroke={color} strokeWidth={BARRA} strokeLinecap="round" fill="none" />
    </Svg>
  )

  return (
    <GestureDetector gesture={Gesture.Race(arrastre, toque)}>
      <View
        accessibilityRole={interactiva ? undefined : 'image'}
        accessibilityLabel={interactiva ? undefined : `Onda de ${etiqueta}`}
        onLayout={(e) => setAncho(e.nativeEvent.layout.width)}
        style={{ height: altoSensible, justifyContent: 'center', cursor: interactiva ? 'pointer' : 'auto' }}
      >
        {trazo ? (
          <>
            {barras(ONDA_PENDIENTE)}
            <Animated.View
              pointerEvents="none"
              style={[
                { position: 'absolute', left: 0, top: (altoSensible - height) / 2, width: ancho, height, overflow: 'hidden' },
                recorte,
              ]}
            >
              <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, relleno]}>
                {barras(ONDA_SONADA)}
              </Animated.View>
            </Animated.View>
          </>
        ) : null}
        {interactiva ? <ControlOnda etiqueta={etiqueta} posicionMs={posicion} desdeMs={desdeMs} duracionMs={duracionMs}
          activa={activa} onSeek={onSeek!} onPreview={fraccion => {
            arrastrando.set(fraccion !== null)
            if (fraccion !== null) arrastreEn.set(fraccion)
          }} /> : null}
      </View>
    </GestureDetector>
  )
}
