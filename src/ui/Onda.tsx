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
import { picosDeCancion } from '../services/music'

/**
 * Geometría de una barra: ancho del trazo y aire hasta la siguiente.
 *
 * Salen de mirar cómo dibujan la onda las apps de mensajes: barras finas y muy
 * juntas se leen como una forma continua, que es lo que uno quiere ver de una
 * canción; barras gruesas y separadas se leen como un ecualizador.
 */
export const BARRA = 2
export const HUECO = 3
/** Ninguna barra desaparece: una parte muda sigue siendo parte de la canción. */
const MINIMA = 2

/**
 * Los dos tonos de la onda: lo que ya sonó y lo que falta.
 *
 * Separados por luminancia y no por color, como pide docs/DESIGN.md. El blanco
 * puro queda para lo activo — acá, lo ya reproducido.
 */
export const ONDA_PENDIENTE = 'rgba(255,255,255,0.18)'
export const ONDA_SONADA = 'rgba(255,255,255,0.90)'
/**
 * Un tercer tono, solo para el editor de fragmento.
 *
 * Ahí conviven tres estados y no dos: la canción fuera del recorte, el recorte
 * todavía sin sonar, y lo ya reproducido. El de en medio tiene que verse
 * claramente más vivo que el de afuera sin llegar al blanco, que está reservado.
 */
export const ONDA_ADELANTE = 'rgba(255,255,255,0.52)'

/**
 * Cuánto se levantan las partes flojas antes de dibujarlas.
 *
 * Los picos vienen en RMS, que es energía media: en un tema con la mezcla
 * pareja —casi todos— eso da una hilera de barras casi iguales, un ladrillo. El
 * oído no percibe la energía de forma lineal, así que la onda se dibuja con una
 * curva: los pasajes flojos suben bastante, los fuertes casi nada, y la forma
 * vuelve a decir dónde entra la voz y dónde baja el tema.
 */
const CURVA = 0.78

/**
 * Reduce (o expande) la onda a `objetivo` barras promediando por tramo.
 *
 * Promediar y no tomar una muestra cada N: al submuestrear, un pico aislado se
 * pierde o se agranda según dónde caiga el índice, y la forma "parpadea" al
 * cambiar de zoom.
 */
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

/**
 * Toda la onda en UN solo trazo.
 *
 * Cada barra es un segmento vertical del mismo `Path`: el grosor lo da
 * `strokeWidth` y las puntas redondeadas `strokeLinecap`. Es la diferencia
 * entre cuatro nodos y varios miles.
 *
 * Es también la razón por la que acá no se usa ninguna de las librerías de onda
 * que andan dando vueltas: dibujan **una vista por barra** y las re-renderizan
 * todas en cada cuadro de reproducción. Con mil barras eso son dos mil nodos
 * recalculando layout sesenta veces por segundo, que en esta app se midió en
 * cuadros de 166 ms. Además son módulos nativos: en la web no existen.
 */
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

/**
 * La onda de una canción, cacheada mientras la app viva.
 *
 * Devuelve null mientras no esté —o si no se puede: una canción propia no tiene
 * onda porque el servicio la calcula por `videoId`, y ahí quien dibuja se queda
 * con lo que tenga de respaldo.
 */
export function usePicos(
  videoId: string | undefined,
  /**
   * El tramo dibujado. Un fragmento pide **sus** picos, no los de la canción:
   * quince segundos de un tema de seis minutos son dos barras de la onda
   * completa, y eso no es una forma, es una mancha.
   */
  tramo?: { desdeMs: number; durMs: number },
  barras = 140,
): number[] | null {
  const desdeMs = tramo?.desdeMs ?? 0
  const durMs = tramo?.durMs ?? 0
  /** Identifica **de qué** son los picos que hay guardados. Ver abajo. */
  const clave = `${videoId ?? ''}:${desdeMs}:${durMs}`

  /* Se guarda de qué son los picos, en vez de vaciarlos al cambiar de canción:
     poner el estado en null desde el efecto es justo lo que el linter de hooks
     no deja, y de paso evita el cuadro intermedio en blanco. */
  const [listo, setListo] = useState<{ de: string; picos: number[] } | null>(null)

  useEffect(() => {
    let vive = true
    if (!videoId || videoId.startsWith('propia:')) return
    picosDeCancion(videoId, barras, durMs > 0 ? { desdeMs, durMs } : undefined)
      .then((p) => {
        if (vive) setListo({ de: clave, picos: p })
      })
      /* Sin onda no pasa nada grave: quien dibuja tiene su respaldo. Un tema
         que todavía no se resolvió, por ejemplo, no la tiene todavía. */
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
  /**
   * Posición de reproducción, en ms de la canción completa.
   *
   * Va por shared value y no por prop numérica: con una prop, cada cuadro de
   * reproducción provoca un render de React, y una conversación entera
   * re-renderizándose sesenta veces por segundo se siente en las dos
   * plataformas. Así el relleno se mueve en el hilo de UI y el árbol no se toca.
   */
  posicionMs?: SharedValue<number>
  /** Principio del tramo dibujado dentro de la canción. */
  desdeMs?: number
  /** Largo del tramo dibujado. */
  duracionMs: number
  /**
   * Si esta onda es la que está sonando.
   *
   * En un perfil hay varias ondas y una sola posición: sin esto, todas se
   * llenarían a la vez.
   */
  activa?: boolean
  /** Mover la reproducción. Llega **al soltar**, no por cuadro. */
  onSeek?: (fraccion: number) => void
  height?: number
  /** Para el lector de pantalla: "Posición de …". */
  etiqueta: string
}

/**
 * Onda con posición: la barra de reproducción de un fragmento.
 *
 * Reemplaza a la barra lisa donde hay una canción de por medio. La forma dice
 * algo del tema —dónde entra la voz, dónde baja— y el relleno dice dónde va la
 * reproducción; la barra lisa solo decía lo segundo.
 *
 * No lleva perilla ni cursor dibujado: el límite entre lo blanco y lo gris es
 * igual de visible y no tapa las barras. Y como el relleno se recorta al píxel,
 * la barra que queda justo bajo la posición se llena **a medias**, que es lo que
 * hace que el avance se lea continuo y no a saltos de barra.
 */
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

  /** Arrastre en curso: mientras dura, manda el dedo y no el audio. */
  const arrastrando = useSharedValue(false)
  const arrastreEn = useSharedValue(0)
  const suelto = useSharedValue(0)
  const posicion = posicionMs ?? suelto

  const trazo = useMemo(() => {
    const cuantas = ancho ? Math.max(8, Math.floor(ancho / (BARRA + HUECO))) : 0
    if (!cuantas || !picos.length) return ''
    /* El paso sale de las barras que **quedaron**, no de las que entrarían: si
       la onda trae menos picos que barras caben, remuestrear no inventa
       ninguna, y con el paso teórico la onda terminaba antes del borde
       derecho — un hueco que se leía como que la canción se cortaba ahí. */
    const barras = remuestrear(picos, cuantas)
    return trazoDeBarras(barras, ancho / barras.length, height, BARRA)
  }, [picos, ancho, height])

  const fraccionEn = (x: number) => {
    'worklet'
    return ancho > 0 ? Math.max(0, Math.min(1, x / ancho)) : 0
  }

  /** Cuánto de la onda está lleno, entre 0 y 1. Manda el dedo si hay arrastre. */
  const avance = () => {
    'worklet'
    if (arrastrando.value) return arrastreEn.value
    if (!activa || duracionMs <= 0) return 0
    return Math.max(0, Math.min(1, (posicion.value - desdeMs) / duracionMs))
  }

  const mover = (f: number) => onSeek?.(f)

  const arrastre = Gesture.Pan()
    .enabled(!!onSeek)
    /* Solo se activa en horizontal: mover el dedo en vertical tiene que seguir
       desplazando el perfil o la conversación, no mover la canción. */
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
    .enabled(!!onSeek)
    .onEnd((e) => {
      runOnJS(mover)(fraccionEn(e.x))
    })

  /*
   * El relleno son dos desplazamientos opuestos y nada más.
   *
   * El recorte se corre hacia la izquierda hasta dejar a la vista solo lo ya
   * sonado, y la copia blanca de adentro se corre en sentido contrario la misma
   * cantidad para que sus barras sigan coincidiendo con las de abajo. Todo con
   * `transform`, que no toca el layout: mover `width` o `left` obliga al
   * navegador a redondear a píxeles enteros y en un fragmento largo el avance
   * por cuadro es menor a un píxel — la barra se veía saltar en vez de fluir.
   */
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
        accessibilityRole="adjustable"
        accessibilityLabel={`Posición de ${etiqueta}`}
        onLayout={(e) => setAncho(e.nativeEvent.layout.width)}
        style={{ height, justifyContent: 'center', cursor: onSeek ? 'pointer' : 'auto' }}
      >
        {trazo ? (
          <>
            {barras(ONDA_PENDIENTE)}
            <Animated.View
              pointerEvents="none"
              style={[
                { position: 'absolute', left: 0, top: 0, width: ancho, height, overflow: 'hidden' },
                recorte,
              ]}
            >
              <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, relleno]}>
                {barras(ONDA_SONADA)}
              </Animated.View>
            </Animated.View>
          </>
        ) : null}
      </View>
    </GestureDetector>
  )
}
