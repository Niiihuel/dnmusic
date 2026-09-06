import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { View, type ViewStyle } from 'react-native'
import Animated, {
  cancelAnimation,
  useReducedMotion,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type EasingFunction,
} from 'react-native-reanimated'
import Svg, { Circle, G, Path } from 'react-native-svg'

/**
 * Lo que comparten todos los marcos: la geometría del lienzo, los tonos, las
 * primitivas de dibujo y las tres formas de moverse.
 *
 * Vive aparte de `Marco.tsx` para que las piezas puedan repartirse en más de
 * un archivo —los clásicos allá, los animados al estilo Discord en
 * `MarcosAnimados.tsx`— sin importarse en círculo. La explicación larga del
 * sistema (por qué se dibujan y no se suben, el color, la geometría, el
 * rendimiento) está en la cabecera de `Marco.tsx`.
 */

/** Cuánto desborda el lienzo del marco a la foto. */
export const DESBORDE = 1.35

/** El anillo clásico vive en el 1,2× de las referencias, no en el borde del lienzo. */
export const ANILLO = 1.2

/**
 * Cuánto sobresale el marco de la foto, por lado. Quien apila el marco puede
 * usarlo para reservar aire (la banda del perfil en escritorio lo hace) sin
 * conocer la regla del desborde.
 */
export function aireDelMarco(size: number): number {
  return Math.round((size * (DESBORDE - 1)) / 2)
}

/**
 * Los tonos con los que se pintan los marcos, de la misma escala que
 * `lib/tema`: 200/300 de Tailwind v4 para lo claro, 800/900 para lo oscuro.
 * Nombrados por lo que evocan y no por su matiz, porque acá se eligen por
 * pieza y no por rueda.
 */
export const TONO = {
  blanco: '#FFFFFF',
  plata: '#D6D3D1' /* stone-300 */,
  humo: '#292524' /* stone-800 */,
  carbon: '#1C1917' /* stone-900 */,
  oro: '#FEE685' /* amber-200 */,
  ambar: '#FFD230' /* amber-300 */,
  cobre: '#973C00' /* amber-800 */,
  naranja: '#FFB86A' /* orange-300 */,
  brasa: '#9F0712' /* red-800 */,
  rubi: '#FFA2A2' /* red-300 */,
  rosa: '#FDA5D5' /* pink-300 */,
  vino: '#A3004C' /* rose-800 */,
  menta: '#5EE9B5' /* emerald-300 */,
  bosque: '#006045' /* emerald-800 */,
  agua: '#46ECD5' /* teal-300 */,
  cielo: '#74D4FF' /* sky-300 */,
  lila: '#C4B4FF' /* violet-300 */,
} as const

/** `#rrggbb` con alfa, para los brillos y las sombras de cada tono. */
export function alfa(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

/**
 * La geometría que comparten todas las piezas. Todo se mide en `u`, la
 * unidad que vale 1px con la foto de 72px de la vidriera: así un trazo que se
 * ve bien en la tarjeta se ve igual de bien, y no más fino, en el perfil.
 */
export type Geo = {
  /** El lado del lienzo. */
  lado: number
  /** El centro, en las dos coordenadas. */
  c: number
  /** El radio de la foto. */
  rf: number
  /** El radio del anillo clásico (1,2×). */
  ra: number
  /** La unidad de medida. */
  u: number
}

export function geometria(size: number): Geo {
  const lado = size + 2 * aireDelMarco(size)
  return { lado, c: lado / 2, rf: size / 2, ra: (size / 2) * ANILLO, u: size / 72 }
}

/** Un punto sobre el lienzo, con el ángulo en grados desde arriba y en sentido horario. */
export function punto(geo: Geo, r: number, angulo: number) {
  const rad = (angulo * Math.PI) / 180
  return { x: geo.c + r * Math.sin(rad), y: geo.c - r * Math.cos(rad) }
}

/** Una estrella de cuatro puntas centrada en el origen, de radio `s`. */
export function estrella(s: number): string {
  const k = s * 0.28
  return `M0,${-s} L${k},${-k} L${s},0 L${k},${k} L0,${s} L${-k},${k} L${-s},0 L${-k},${-k} Z`
}

/**
 * Un arco de círculo como trazo discontinuo: el pedazo entre dos ángulos
 * (desde arriba, en sentido horario) de un `Circle` de radio `r`.
 *
 * El trazo de un círculo SVG arranca a las tres y corre en sentido horario,
 * y `strokeDashoffset` corre el patrón hacia atrás **módulo el período del
 * patrón**, no la circunferencia: un hueco cualquiera hace que aparezca un
 * segundo pedazo donde nadie lo pidió. Por eso el hueco es exactamente lo que
 * falta para una vuelta — así hay un solo arco y la fase es la que se pide.
 */
export function arco(r: number, desde: number, hasta: number) {
  const vuelta = 2 * Math.PI * r
  const largo = (vuelta * (hasta - desde)) / 360
  return {
    strokeDasharray: `${largo} ${vuelta - largo}`,
    strokeDashoffset: -(vuelta * (desde - 90)) / 360,
  }
}

/** Un lienzo del tamaño del marco, apilado en el mismo lugar que los demás. */
export function capa(lado: number): ViewStyle {
  return { position: 'absolute', width: lado, height: lado }
}

/** Un SVG del tamaño entero del lienzo, para lo que queda quieto. */
export function Lienzo({ geo, children }: { geo: Geo; children: ReactNode }) {
  return (
    <Svg width={geo.lado} height={geo.lado} style={{ position: 'absolute' }}>
      {children}
    </Svg>
  )
}

/**
 * Algo apoyado sobre el anillo, apuntando hacia afuera.
 *
 * Una vista del tamaño del lienzo girada `angulo` grados —la rotación es
 * alrededor del centro, que es lo que queremos— con la pieza pegada al borde
 * de arriba. La pieza se dibuja «hacia arriba» en sus coordenadas y queda
 * radial por la rotación: es lo que hacen las barras del ecualizador y las
 * llamas, y ahorra trigonometría en cada una. La vista de afuera es estática;
 * lo que se anima va adentro.
 */
export function Radial({
  geo,
  angulo,
  r,
  ancho,
  alto,
  children,
}: {
  geo: Geo
  angulo: number
  /** El radio donde apoya la base de la pieza. */
  r: number
  ancho: number
  alto: number
  children: ReactNode
}) {
  return (
    <View style={[capa(geo.lado), { transform: [{ rotate: `${angulo}deg` }] }]}>
      <View style={{ position: 'absolute', left: geo.c - ancho / 2, top: geo.c - r - alto, width: ancho, height: alto }}>
        {children}
      </View>
    </View>
  )
}

/* ------------------------------------------------------------------------ */
/* Las animaciones: tres formas de moverse, y nada más.                       */
/* ------------------------------------------------------------------------ */

export const Movimiento = createContext(true)

export const SUAVE: EasingFunction = Easing.inOut(Easing.sin)
export const LINEAL: EasingFunction = Easing.linear

/** Un valor que va y vuelve entre 0 y 1, suave, para siempre. */
export function useVaiven(duracion: number, demora = 0, easing: EasingFunction = SUAVE) {
  const animado = useContext(Movimiento)
  const reducir = useReducedMotion()
  /* Quieto, posa a mitad de camino: lo que se ve es el marco en su momento,
     no su arranque. Ver `useCiclo`. */
  const t = useSharedValue(animado && !reducir ? 0 : 0.6)
  useEffect(() => {
    if (!animado || reducir) return
    t.value = withDelay(demora, withRepeat(withTiming(1, { duration: duracion, easing }), -1, true))
    return () => cancelAnimation(t)
  }, [animado, reducir, t, duracion, demora, easing])
  return t
}

/**
 * Un valor que sube de 0 a 1 y arranca de nuevo: para lo que nace, viaja y se apaga.
 *
 * **Quieto, posa.** Lo que nace y se apaga vale cero al arrancar el ciclo:
 * en la vidriera —donde la grilla no se anima, como en la tienda de Discord—
 * un confeti o unos corazones en `t = 0` son un anillo vacío. Por eso sin
 * movimiento (o con «reducir movimiento») el valor arranca en un punto del
 * medio del ciclo, distinto por pieza según su demora, y la pieza se ve en
 * su mejor momento. `reposo` lo fija a mano cuando el mejor momento no es
 * el medio (el rayo brilla al principio).
 */
export function useCiclo(duracion: number, demora = 0, reposo?: number) {
  const animado = useContext(Movimiento)
  const reducir = useReducedMotion()
  const t = useSharedValue(
    animado && !reducir ? 0 : (reposo ?? 0.3 + ((demora / duracion) % 0.4)),
  )
  useEffect(() => {
    if (!animado || reducir) return
    t.value = withDelay(
      demora,
      withRepeat(withTiming(1, { duration: duracion, easing: LINEAL }), -1),
    )
    return () => cancelAnimation(t)
  }, [animado, reducir, t, duracion, demora])
  return t
}

/** Una vuelta entera, constante. `sentido` -1 gira al revés. */
export function useGiro(duracion: number, sentido: 1 | -1 = 1) {
  const animado = useContext(Movimiento)
  const reducir = useReducedMotion()
  const g = useSharedValue(0)
  useEffect(() => {
    if (!animado || reducir) return
    g.value = withRepeat(withTiming(360 * sentido, { duration: duracion, easing: LINEAL }), -1)
    return () => cancelAnimation(g)
  }, [animado, reducir, g, duracion, sentido])
  return g
}

/** Una capa entera que gira alrededor del centro del lienzo. */
export function Giro({
  geo,
  duracion,
  sentido = 1,
  desde = 0,
  children,
}: {
  geo: Geo
  duracion: number
  sentido?: 1 | -1
  /** El ángulo inicial, para que dos giros iguales no arranquen del mismo lugar. */
  desde?: number
  children: ReactNode
}) {
  const g = useGiro(duracion, sentido)
  const estilo = useAnimatedStyle(() => ({ transform: [{ rotate: `${desde + g.value}deg` }] }))
  return <Animated.View style={[capa(geo.lado), estilo]}>{children}</Animated.View>
}

/** Una estrella de cuatro puntas que titila: crece y se enciende, se encoge y se apaga. */
export function Chispa({
  geo,
  angulo,
  r,
  tam,
  color,
  demora,
  duracion,
}: {
  geo: Geo
  angulo: number
  r: number
  tam: number
  color: string
  demora: number
  duracion: number
}) {
  const t = useVaiven(duracion, demora)
  const estilo = useAnimatedStyle(() => ({
    opacity: 0.3 + 0.7 * t.value,
    transform: [{ scale: 0.6 + 0.5 * t.value }],
  }))
  const p = punto(geo, r, angulo)
  const caja = tam * 2.4
  return (
    <Animated.View style={[{ position: 'absolute', left: p.x - caja / 2, top: p.y - caja / 2, width: caja, height: caja }, estilo]}>
      <Svg width={caja} height={caja}>
        <G x={caja / 2} y={caja / 2}>
          <Circle r={tam * 0.9} fill={alfa(color, 0.2)} />
          <Path d={estrella(tam)} fill={color} />
        </G>
      </Svg>
    </Animated.View>
  )
}

