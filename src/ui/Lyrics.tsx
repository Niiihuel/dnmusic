import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Platform, Pressable, Text, View, type LayoutChangeEvent, type TextStyle } from 'react-native'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { activeLyricIndex, type LyricLine } from '../services/music'

export type LyricsSize = 'sm' | 'lg' | 'xl'

/**
 * Los tres tamaños. Es casi lo único que cambia entre la letra de fondo, la
 * letra de un mensaje y la letra de «Sonando»: el movimiento y la atenuación
 * son los mismos.
 *
 * `xl` es la letra de Apple Music: **a la izquierda, en negrita pareja, la
 * línea que suena en el medio de la ventana y las que vienen desenfocadas**
 * como si estuvieran más lejos. Las otras dos se centran, porque acompañan a otra cosa
 * —la onda, la tarjeta del mensaje— y ahí el texto es un adorno, no la
 * pantalla.
 */
const SIZE = {
  /** Acompaña a otra cosa (la onda, la tarjeta del mensaje). */
  sm: { idle: 15, active: 17, lineH: 34, gap: 0, wrap: false, izquierda: false, ancla: 0.5 },
  /** Es el contenido de la pantalla, centrado. */
  lg: { idle: 20, active: 24, lineH: 44, gap: 9, wrap: true, izquierda: false, ancla: 0.5 },
  /** La pantalla entera, al modo de Apple Music. */
  xl: { idle: 30, active: 30, lineH: 0, gap: 13, wrap: true, izquierda: true, ancla: 0.5 },
} satisfies Record<
  LyricsSize,
  {
    idle: number
    active: number
    lineH: number
    gap: number
    wrap: boolean
    /** Alineada a la izquierda; si no, centrada. */
    izquierda: boolean
    /** A qué altura de la ventana (0 arriba, 1 abajo) se acomoda la línea que suena. */
    ancla: number
  }
>

type Props = {
  lines: LyricLine[]
  /** Posición actual, en la misma escala que `lines[].atMs`. */
  atMs: number
  /**
   * La misma posición, pero **fina y en el hilo de la interfaz**.
   *
   * Es lo que enciende palabra por palabra la línea que suena: `atMs` llega a
   * saltos de un cuarto de segundo y alcanza para saber qué línea es, pero
   * para que las palabras se prendan a tiempo hace falta el valor que el motor
   * escribe cuadro a cuadro. Sin esto, las palabras se prenden igual, solo que
   * al paso de `atMs`. Solo lo mira el tamaño `xl`.
   */
  posicion?: SharedValue<number>
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
 * desplaza para dejar la línea que suena en su lugar —en el medio, o arriba
 * del medio en la pantalla entera—. Las demás se apagan según la distancia.
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
  posicion,
  visible,
  size = 'sm',
  onPickLine,
  onHoldLine,
  onTap,
}: Props) {
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
      const to = boxH * s.ancla - (spot.y + spot.h / 2)
      /* Escribir `.value` es la API de un SharedValue de Reanimated; la regla
         de inmutabilidad no lo sabe. Mismo silencio que en `Hoja` y `playing`. */
      if (settled.current) {
        /* Más lenta en grande: la columna recorre más píxeles por línea y a
           380ms se leía como un salto. Es la cadencia con la que Apple Music
           acomoda su letra. */
        // eslint-disable-next-line react-hooks/immutability
        offset.value = withTiming(to, {
          duration: size === 'xl' ? 520 : 380,
          easing: Easing.out(Easing.cubic),
        })
      } else {
        offset.value = to
        settled.current = true
      }
    },
    [boxH, offset, s.ancla, size],
  )

  useEffect(() => {
    center(target)
  }, [target, center])

  const columnStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }))

  if (!lines.length) return null

  const columna = (
    <Animated.View style={columnStyle}>
      {lines.map((line, i) => (
        <Line
          key={`${line.atMs}-${i}`}
          text={line.text}
          distance={i - index}
          size={s}
          xl={size === 'xl'}
          /* Solo la que suena mira el tiempo fino: cuarenta líneas
             suscriptas a la posición serían cuarenta reacciones por cuadro. */
          desdeMs={i === index ? line.atMs : undefined}
          hastaMs={i === index ? (lines[i + 1]?.atMs ?? line.atMs + 6000) : undefined}
          atMs={i === index ? atMs : undefined}
          posicion={i === index ? posicion : undefined}
          onMeasure={(y, h) => {
            spots.current[i] = { y, h }
            // La medida llega después del primer render: si la que se acaba
            // de medir es la línea activa, recién ahí se puede centrar.
            if (i === target) center(target)
          }}
          onPress={onPickLine ? () => onPickLine(line.atMs) : onTap}
          onLongPress={
            onHoldLine && line.text.trim() ? () => onHoldLine(line.text, line.atMs) : undefined
          }
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
 * radio cuesta en el teléfono. Y a más de ocho líneas ya no se desenfoca nada:
 * están fuera de la ventana casi siempre, y un filtro por línea para cuarenta
 * líneas es pagar un efecto que nadie ve.
 */
function desenfoque(distance: number): number {
  const d = Math.abs(distance)
  if (d === 0 || d > 8) return 0
  const px = distance > 0 ? (d - 1) * 1.6 : d * 1.1
  return Math.min(6, Math.max(0, px))
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
 * letra parece cortada en vez de atenuada. En `xl` el piso baja: ahí la
 * distancia se dice también con el desenfoque, y las líneas lejanas **tienen**
 * que retroceder para que la que suena quede sola.
 */
function opacidad(distance: number, xl: boolean): number {
  if (distance === 0) return 1
  if (xl) {
    return distance < 0
      ? Math.max(0.22, 0.42 + (distance + 1) * 0.06)
      : Math.max(0.24, 0.6 - (distance - 1) * 0.1)
  }
  return distance < 0 ? Math.max(0.4, 0.62 + distance * 0.1) : Math.max(0.45, 0.75 - distance * 0.12)
}

const Line = memo(function Line({
  text,
  distance,
  size,
  xl,
  desdeMs,
  hastaMs,
  atMs,
  posicion,
  onMeasure,
  onPress,
  onLongPress,
}: {
  text: string
  distance: number
  size: (typeof SIZE)[LyricsSize]
  xl: boolean
  /** Solo en la línea que suena: cuándo empieza y cuándo termina. */
  desdeMs?: number
  hastaMs?: number
  atMs?: number
  posicion?: SharedValue<number>
  onMeasure: (y: number, h: number) => void
  onPress?: () => void
  onLongPress?: () => void
}) {
  const active = distance === 0

  const layout = (e: LayoutChangeEvent) =>
    onMeasure(e.nativeEvent.layout.y, e.nativeEvent.layout.height)

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
  const texto: TextStyle = {
    color: '#FFFFFF',
    opacity: opacidad(distance, xl),
    fontSize,
    /* En `xl` todas las líneas pesan igual y van apretadas: la jerarquía la
       hacen la opacidad y el foco, no el tamaño — es lo que hace que la letra
       se lea como un texto y no como una lista de títulos. */
    lineHeight: fontSize * (xl ? 1.18 : 1.35),
    fontWeight: xl ? '700' : active ? '600' : '400',
    letterSpacing: xl ? -0.4 : undefined,
    textAlign: size.izquierda ? 'left' : 'center',
    ...(xl ? estiloDesenfoque(desenfoque(distance)) : null),
  }

  const body =
    xl && active && desdeMs !== undefined && hastaMs !== undefined ? (
      <Karaoke text={text} desdeMs={desdeMs} hastaMs={hastaMs} atMs={atMs ?? desdeMs} posicion={posicion} style={texto} />
    ) : (
      <Text numberOfLines={size.wrap ? undefined : 1} ellipsizeMode="tail" style={texto}>
        {text}
      </Text>
    )

  if (!onPress && !onLongPress) {
    return (
      <View style={box} onLayout={layout}>
        {body}
      </View>
    )
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={
        onLongPress ? 'Mantené para fijar este verso' : 'Mueve el recorte a esta parte de la canción'
      }
      style={box}
      onLayout={layout}
      onPress={onPress}
      onLongPress={onLongPress}
      className="active:opacity-60"
    >
      {body}
    </Pressable>
  )
})

/** Lo que pesa cada palabra en el tiempo de su línea: sus letras más el espacio. */
function pesos(palabras: string[]): number[] {
  const total = palabras.reduce((suma, p) => suma + p.length + 1, 0)
  let acumulado = 0
  return palabras.map((p) => {
    acumulado += p.length + 1
    return acumulado / total
  })
}

/**
 * La línea que suena, **palabra por palabra**.
 *
 * Es el karaoke de Apple Music: las palabras se van encendiendo a medida que se
 * cantan y las que faltan quedan a media luz. La letra de LRCLIB trae el tiempo
 * de cada línea pero no el de cada palabra, así que el reparto se **estima**:
 * la línea dura hasta que empieza la siguiente, y cada palabra se lleva una
 * porción proporcional a sus letras. No es exacto —una palabra larga cantada
 * rápido se prende tarde— pero sigue la canción lo suficiente para que se lea
 * como que la letra te acompaña y no como que te espera.
 *
 * El tiempo se lee de la posición fina en el hilo de la interfaz y solo se
 * cruza a React cuando cambia **la cantidad de palabras prendidas**: unas pocas
 * veces por línea, no sesenta por segundo. Sin la posición fina, se calcula de
 * `atMs`, que llega más a saltos pero llega igual.
 */
function Karaoke({
  text,
  desdeMs,
  hastaMs,
  atMs,
  posicion,
  style,
}: {
  text: string
  desdeMs: number
  hastaMs: number
  atMs: number
  posicion?: SharedValue<number>
  style: TextStyle
}) {
  const palabras = text.split(/\s+/).filter(Boolean)
  const cortes = pesos(palabras)
  const dura = Math.max(400, hastaMs - desdeMs)

  const cuantas = (ms: number) => {
    const p = Math.min(1, Math.max(0, (ms - desdeMs) / dura))
    let n = 0
    /* Una palabra se prende cuando la canción pasó **su mitad**: prenderla al
       arrancar se adelanta a la voz, prenderla al terminar se atrasa. */
    for (let i = 0; i < cortes.length; i++) {
      const inicio = i === 0 ? 0 : cortes[i - 1]
      if (p >= (inicio + cortes[i]) / 2) n = i + 1
    }
    return n
  }

  /* Lo que dice la posición fina, cuando la hay. Sin ella, se **deriva** de
     `atMs` en cada dibujado: es un número que sale de las props, no un estado
     que haya que sincronizar. */
  const [finas, setFinas] = useState(() => cuantas(atMs))
  const prendidas = posicion ? finas : cuantas(atMs)

  /* Los cortes viajan al worklet como números, no la función: un worklet no
     puede llamar una closure del hilo de JS. */
  useAnimatedReaction(
    () => {
      if (!posicion) return -1
      const p = Math.min(1, Math.max(0, (posicion.value - desdeMs) / dura))
      let n = 0
      for (let i = 0; i < cortes.length; i++) {
        const inicio = i === 0 ? 0 : cortes[i - 1]
        if (p >= (inicio + cortes[i]) / 2) n = i + 1
      }
      return n
    },
    (n, antes) => {
      if (n >= 0 && n !== antes) runOnJS(setFinas)(n)
    },
    [posicion, desdeMs, dura, cortes.join(',')],
  )

  return (
    <Text style={style}>
      {palabras.map((palabra, i) => (
        <Text
          key={`${i}-${palabra}`}
          /* La opacidad de la palabra apagada va por color y no por `opacity`:
             un texto anidado es un tramo del mismo párrafo, no una vista, y en
             el teléfono no tiene opacidad propia. */
          style={{ color: i < prendidas ? '#FFFFFF' : 'rgba(255,255,255,0.4)' }}
        >
          {palabra}
          {i < palabras.length - 1 ? ' ' : ''}
        </Text>
      ))}
    </Text>
  )
}
