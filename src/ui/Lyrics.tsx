import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Platform, Pressable, Text, View, type LayoutChangeEvent, type TextStyle } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'

import { activeLyricIndex, enfoque, type LyricLine } from '../services/letra'

/* La fila es tocable y además se atenúa sola, así que el `Pressable` es el que
   lleva el estilo animado. Con él se fue `active:opacity-60`: NativeWind no
   procesa clases sobre un componente animado, y acá encima competiría con la
   opacidad que escribe el worklet. */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

export type LyricsSize = 'sm' | 'lg' | 'xl'

/**
 * Los tres tamaños. Es casi lo único que cambia entre la letra de fondo, la
 * letra de un mensaje y la letra de «Sonando»: el movimiento y la atenuación
 * son los mismos.
 *
 * `xl` es la letra de Apple Music: **a la izquierda, en negrita pareja, la
 * línea que suena en el primer tercio de la ventana y las que vienen
 * desenfocadas** como si estuvieran más lejos. Las otras dos se centran, porque
 * acompañan a otra cosa —la onda, la tarjeta del mensaje— y ahí el texto es un
 * adorno, no la pantalla.
 */
const SIZE = {
  /** Acompaña a otra cosa (la onda, la tarjeta del mensaje). */
  sm: { idle: 15, active: 17, lineH: 34, gap: 6, wrap: true, izquierda: false, ancla: 0.5 },
  /** Es el contenido de la pantalla, centrado. */
  lg: { idle: 20, active: 24, lineH: 44, gap: 9, wrap: true, izquierda: false, ancla: 0.5 },
  /** La pantalla entera, al modo de Apple Music. */
  xl: { idle: 30, active: 30, lineH: 0, gap: 10, wrap: true, izquierda: true, ancla: 0.22 },
} satisfies Record<
  LyricsSize,
  {
    idle: number
    active: number
    /** Alto de un renglón: es la unidad con la que `visible` mide la ventana. */
    lineH: number
    gap: number
    wrap: boolean
    /** Alineada a la izquierda; si no, centrada. */
    izquierda: boolean
    /**
     * A qué altura de la ventana (0 arriba, 1 abajo) se acomoda la línea que
     * suena. En `xl` va alta —al quinto del alto, medido de Apple Music— para
     * que abajo entre lo que **viene**: la letra se lee hacia adelante, y con
     * la línea al medio la mitad de la pantalla la ocupa lo que ya sonó.
     */
    ancla: number
  }
>

/**
 * La línea que está en foco pero todavía **no se canta**.
 *
 * Es la que la pantalla adelantó durante un instrumental largo: está puesta en
 * su lugar, esperando su turno. Se lee entera —no es una línea lejana— pero no
 * está encendida. Medido de Apple Music: 0.45 contra el 0.24 de la siguiente.
 */
const TENUE = 'rgba(255,255,255,0.45)'

/**
 * El salto de un verso al otro, medido cuadro a cuadro sobre la pantalla de
 * Apple Music.
 *
 * Un salto de 164 píxeles: arranca, en dos cuadros llega al pico (26 px por
 * cuadro) y de ahí **decae exponencial y aterriza larguísimo** — de los 620ms
 * que dura, los últimos 200 los gasta en recorrer dos píxeles. Ese final que se
 * arrastra es lo que hace ver la columna como algo con peso, y es lo que la
 * curva de antes no tenía: `Easing.out(cubic)` llega y frena en seco.
 *
 * **No rebota.** Se midió: la posición baja de 252 a 88 y nunca se pasa de
 * largo, ni un píxel. Por eso el `dampingRatio` va casi en uno — un resorte
 * críticamente amortiguado es exactamente esta forma: arranque corto, pico
 * temprano, cola exponencial. Bajarlo le mete un rebote que el original no
 * tiene; es un número y se cambia, pero deja de ser el video.
 *
 * `duration` es la duración **perceptual**: Reanimated corre el resorte una vez
 * y media más largo, así que 420 son los ~630ms medidos.
 */
const RESORTE = { duration: 420, dampingRatio: 0.9 } as const

/**
 * Lo que tarda una línea en apagarse cuando le toca a la siguiente.
 *
 * Va **aparte del movimiento y mucho más corto**, y eso también está medido: en
 * Apple Music la línea que sale pasa de blanca a gris en unos cuatro cuadros
 * —130ms— mientras la columna sigue viajando otro medio segundo. Atado al mismo
 * resorte, el cruce se arrastraba y las dos líneas quedaban a media luz un rato
 * largo, que no es lo que hace el original.
 *
 * Lo importante es que **sea un cruce y no un corte**: con la opacidad pegada
 * al índice entero, el cambio pasaba entero en un cuadro, antes de que la letra
 * se hubiera movido un píxel, y el resto del movimiento no acompañaba a nada.
 */
const CRUCE = { duration: 150, easing: Easing.out(Easing.quad) } as const

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
  /**
   * Mantener apretada una línea, con su texto.
   *
   * Es la puerta de «fijar este verso en el perfil»: el toque corto ya está
   * tomado —mueve el recorte, o no hace nada— y un botón por línea ensuciaría
   * una pantalla cuyo punto es ser solo texto. Sostener es el gesto de la app
   * para «hacer algo con esto» (ver `Mantener`).
   */
  onHoldLine?: (texto: string, atMs: number) => void
  /**
   * Un toque en cualquier parte de la letra que no sea elegir una línea.
   *
   * Es lo que usa «Sonando» para mostrar y esconder los controles: la letra
   * ocupa la pantalla entera y tocarla es la única forma de pedirlos.
   */
  onTap?: () => void
}

/**
 * Letra que sigue a la canción.
 *
 * Sin tarjeta ni fondo: el texto va directo sobre el lienzo, y la columna se
 * desplaza para dejar la línea que suena en su lugar —en el medio, o en el
 * primer tercio en la pantalla entera—. Las demás se apagan según la distancia.
 *
 * Es una sola pieza para todos los usos —la franja de fondo bajo la onda, la
 * pantalla de un mensaje y la pantalla completa de letra— porque son la misma
 * cosa a distinto tamaño. Manteniéndolas separadas terminaban divergiendo: una
 * con scroll nativo y otra animada, y al cambiar de vista la letra "saltaba"
 * de estilo.
 *
 * El centrado se calcula con el alto real de cada línea, medido en el layout, y
 * no multiplicando por un alto fijo: en grande los versos se parten en dos o
 * tres renglones y con un alto constante la letra se va desalineando.
 */
export function Lyrics({
  lines,
  atMs,
  visible,
  size = 'sm',
  onPickLine,
  onHoldLine,
  onTap,
}: Props) {
  const s = SIZE[size]
  const xl = size === 'xl'
  /** Alto de la ventana: fijo si se pidieron N líneas, si no lo da el padre. */
  const fixedH = visible ? visible * s.lineH : undefined

  const [boxH, setBoxH] = useState(fixedH ?? 0)
  const spots = useRef<{ y: number; h: number }[]>([])
  const offset = useSharedValue(0)
  /** En qué línea está el foco, **con decimales**: de ahí sale cada opacidad. */
  const focoSV = useSharedValue(0)
  /** El primer centrado es un salto, no una animación: nadie lo vio moverse. */
  const settled = useRef(false)

  // Antes de la primera línea el índice es -1; ahí se muestra la primera, en
  // espera, en vez de dejar la columna corrida y un hueco enorme arriba.
  const sonando = activeLyricIndex(lines, atMs)
  /*
   * La línea que la pantalla mira no siempre es la que suena: en un
   * instrumental largo se adelanta a la próxima (ver `enfoque`). Solo en `xl`,
   * que es donde la línea adelantada se distingue de la que suena porque va
   * apagada; en los otros tamaños, adelantarse sería marcar como actual una
   * línea que todavía no cantó nadie.
   */
  const foco = xl ? enfoque(lines, sonando, atMs) : sonando
  const target = Math.max(0, foco)

  const center = useCallback(
    (i: number) => {
      const spot = spots.current[i]
      if (!spot || !boxH) return
      const to = boxH * s.ancla - (spot.y + spot.h / 2)
      /* Escribir `.value` es la API de un SharedValue de Reanimated; la regla
         de inmutabilidad no lo sabe. Mismo silencio que en `Hoja` y `playing`. */
      /* Más rápido en chico: la ventana mide tres renglones y con la cadencia
         larga el movimiento no termina nunca. Ver `RESORTE`. */
      const resorte = xl ? RESORTE : { ...RESORTE, duration: 300 }
      if (settled.current) {
        // eslint-disable-next-line react-hooks/immutability
        offset.value = withSpring(to, resorte)
        // eslint-disable-next-line react-hooks/immutability
        focoSV.value = withTiming(i, CRUCE)
      } else {
        offset.value = to
        focoSV.value = i
        settled.current = true
      }
    },
    [boxH, offset, focoSV, s.ancla, xl],
  )

  useEffect(() => {
    center(target)
  }, [target, center])

  /*
   * Los manejadores que recibe cada línea son **estables**, y de eso depende
   * que la letra se mueva.
   *
   * `Lyrics` se redibuja diez veces por segundo —el reloj de la canción—, y con
   * un `onPress` o un `onLayout` creados en cada pasada el `memo` de `Line` no
   * servía de nada: se volvían a montar las cuarenta líneas, con sus medidas y
   * sus filtros, diez veces por segundo. Medido en el navegador, eso trababa el
   * hilo unos cien milisegundos cada vez, y el salto de verso salía a quince
   * cuadros por segundo: se veía como un corte, no como un movimiento.
   *
   * Lo que cambia va por `ref` y lo que se pasa es una función que no cambia
   * nunca.
   */
  const vivo = useRef({ target, center, onPickLine, onHoldLine, onTap })
  useEffect(() => {
    vivo.current = { target, center, onPickLine, onHoldLine, onTap }
  })

  const alMedir = useCallback((i: number, y: number, h: number) => {
    spots.current[i] = { y, h }
    // La medida llega después del primer render: si la que se acaba de medir
    // es la línea activa, recién ahí se puede centrar.
    if (i === vivo.current.target) vivo.current.center(i)
  }, [])
  const alTocar = useCallback((atMsLinea: number) => {
    const { onPickLine: elegir, onTap: tocar } = vivo.current
    if (elegir) elegir(atMsLinea)
    else tocar?.()
  }, [])
  const alSostener = useCallback((texto: string, atMsLinea: number) => {
    vivo.current.onHoldLine?.(texto, atMsLinea)
  }, [])

  const columnStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }))

  if (!lines.length) return null

  const columna = (
    <Animated.View style={columnStyle}>
      {lines.map((line, i) => (
        <Line
          key={`${line.atMs}-${i}`}
          indice={i}
          foco={focoSV}
          atMsLinea={line.atMs}
          text={line.text}
          distance={i - foco}
          size={s}
          xl={xl}
          /* Enfocada pero todavía en silencio: la letra ya subió, la voz no
             llegó. Se ve entera, a media luz. */
          esperando={xl && i === target && i !== sonando}
          tocable={Boolean(onPickLine || onTap)}
          sostenible={Boolean(onHoldLine) && Boolean(line.text.trim())}
          onMeasure={alMedir}
          onPress={alTocar}
          onLongPress={alSostener}
        />
      ))}
    </Animated.View>
  )

  const caja = {
    style: fixedH ? { height: fixedH } : undefined,
    className: `overflow-hidden ${fixedH ? '' : 'flex-1'}`,
    onLayout: (e: LayoutChangeEvent) => setBoxH(e.nativeEvent.layout.height),
    accessibilityLabel: 'Letra de la canción',
  }

  /*
   * Con `onTap`, el fondo entre líneas también responde: la letra deja huecos
   * grandes entre versos y tocar ahí tiene que valer igual. El fondo va como
   * **hermano** de la columna y no envolviéndola: las líneas ya son botones
   * (mantener para fijar el verso), y en web un botón adentro de otro es un
   * `<button>` dentro de un `<button>`, que el navegador rechaza.
   */
  return (
    <View {...caja}>
      {onTap && !onPickLine ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mostrar u ocultar los controles"
          onPress={onTap}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        />
      ) : null}
      {columna}
    </View>
  )
}

/**
 * Cuánto se desenfoca una línea según lo lejos que esté de la que suena.
 *
 * Es la profundidad de campo de Apple Music: lo que viene está «más lejos» y se
 * ve borroso, más cuanto más lejos. La que sigue va nítida —es la que uno lee
 * para prepararse— y desde la segunda empieza a desenfocarse. Las que ya
 * pasaron también, un poco menos: ya se leyeron, no hace falta verlas.
 *
 * Tope de seis píxeles: más allá la letra es una mancha igual y cada píxel de
 * radio cuesta en el teléfono.
 *
 * Pasado el tope **se queda en el tope**, no vuelve a cero. Antes se cortaba a
 * las ocho líneas —«están fuera de la ventana igual»—, y en el teléfono era
 * cierto; en el panel de la compu entran quince y la novena reaparecía
 * **nítida** abajo de todo, como si volviera del fondo. Es un filtro por línea
 * para toda la letra, y lo vale: una línea enfocada donde no corresponde se ve
 * al instante.
 */
function desenfoque(distance: number): number {
  const d = Math.abs(distance)
  if (d === 0) return 0
  return Math.min(6, distance > 0 ? (d - 1) * 1.6 : d * 1.1)
}

/**
 * El estilo del desenfoque, en el idioma de cada lado: en la web el `filter`
 * de CSS va como texto; en el teléfono va la forma de objeto de React Native,
 * que iOS y Android saben dibujar desde la arquitectura nueva.
 */
function estiloDesenfoque(px: number): TextStyle | null {
  if (px <= 0) return null
  if (Platform.OS === 'web') return { filter: `blur(${px.toFixed(1)}px)` } as unknown as TextStyle
  return { filter: [{ blur: px }] } as unknown as TextStyle
}

/**
 * Cuánto se ve una línea según la distancia.
 *
 * Las que ya pasaron se apagan más que las que vienen: lo que sigue importa
 * más que lo que ya sonó. Los pisos son altos a propósito en los tamaños
 * chicos — sobre negro puro, por debajo de 0.4 el texto deja de leerse y la
 * letra parece cortada en vez de atenuada.
 *
 * En `xl` los valores son los de Apple Music, medidos de la pantalla: la
 * siguiente línea está en 0.24 y de ahí para abajo. Son **mucho** más bajos de
 * lo que uno pondría a ojo, y esa es la clave del efecto: la línea que suena no
 * se destaca porque sea más brillante, sino porque todo lo demás se corrió al
 * fondo de la pantalla. Con las vecinas en 0.6 —lo que había— la letra se leía
 * como un bloque de texto con una línea marcada.
 */
function opacidad(distance: number, xl: boolean): number {
  'worklet'
  if (Math.abs(distance) < 0.001) return 1
  if (xl) {
    return distance < 0
      ? Math.max(0.12, 0.18 + (distance + 1) * 0.03)
      : Math.max(0.13, 0.24 - (distance - 1) * 0.035)
  }
  return distance < 0 ? Math.max(0.4, 0.62 + distance * 0.1) : Math.max(0.45, 0.75 - distance * 0.12)
}

const Line = memo(function Line({
  indice,
  foco,
  atMsLinea,
  text,
  distance,
  size,
  xl,
  esperando,
  tocable,
  sostenible,
  onMeasure,
  onPress,
  onLongPress,
}: {
  indice: number
  /** El foco con decimales: contra el índice da la distancia, cuadro a cuadro. */
  foco: SharedValue<number>
  atMsLinea: number
  text: string
  distance: number
  size: (typeof SIZE)[LyricsSize]
  xl: boolean
  /** En foco pero todavía sin cantar: la pantalla se adelantó. */
  esperando: boolean
  tocable: boolean
  sostenible: boolean
  onMeasure: (i: number, y: number, h: number) => void
  onPress: (atMsLinea: number) => void
  onLongPress: (texto: string, atMsLinea: number) => void
}) {
  const active = distance === 0

  const layout = (e: LayoutChangeEvent) =>
    onMeasure(indice, e.nativeEvent.layout.y, e.nativeEvent.layout.height)

  const box = size.wrap
    ? {
        paddingVertical: size.gap,
        justifyContent: 'center' as const,
        alignItems: size.izquierda ? ('flex-start' as const) : ('center' as const),
      }
    : { height: size.lineH, justifyContent: 'center' as const, alignItems: 'center' as const }

  /*
   * El color va inline y no por className: NativeWind no procesa clases sobre
   * componentes animados, y una `Animated.Text className="text-foreground"`
   * termina cayendo al color por defecto — negro sobre negro.
   */
  const fontSize = active ? size.active : size.idle
  /* La opacidad es lo único animado: es lo que tiene que cruzar mientras la
     columna viaja. El desenfoque salta con la distancia entera —a esa distancia
     la línea ya está apagada y el escalón no se ve—, y animarlo sería redibujar
     un filtro por línea en cada cuadro. */
  const atenuacion = useAnimatedStyle(() => ({ opacity: opacidad(indice - foco.value, xl) }))

  const texto: TextStyle = {
    color: esperando ? TENUE : '#FFFFFF',
    fontSize,
    /* En `xl` todas las líneas pesan igual y van apretadas: la jerarquía la
       hacen la opacidad y el foco, no el tamaño — es lo que hace que la letra
       se lea como un texto y no como una lista de títulos. */
    lineHeight: fontSize * (xl ? 1.28 : 1.35),
    fontWeight: xl ? '700' : active ? '600' : '400',
    letterSpacing: xl ? -0.4 : undefined,
    textAlign: size.izquierda ? 'left' : 'center',
    ...(xl ? estiloDesenfoque(desenfoque(distance)) : null),
  }

  const body = (
    <Text numberOfLines={size.wrap ? undefined : 1} ellipsizeMode="tail" style={texto}>
      {text}
    </Text>
  )

  if (!tocable && !sostenible) {
    return (
      <Animated.View style={[box, atenuacion]} onLayout={layout}>
        {body}
      </Animated.View>
    )
  }

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityHint={
        sostenible ? 'Mantené para fijar este verso' : 'Mueve el recorte a esta parte de la canción'
      }
      style={[box, atenuacion]}
      onLayout={layout}
      onPress={tocable ? () => onPress(atMsLinea) : undefined}
      onLongPress={sostenible ? () => onLongPress(text, atMsLinea) : undefined}
    >
      {body}
    </AnimatedPressable>
  )
})
