import { useState, type ReactNode } from 'react'
import { View } from 'react-native'
import Animated, { useAnimatedStyle } from 'react-native-reanimated'
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg'
import { alfa, Movimiento, TONO, useCiclo } from './marcoBase'

/**
 * Los efectos del perfil, dibujados: lo que pasa **encima del fondo**, en la
 * banda de arriba, como los «profile effects» de Discord.
 *
 * Son partículas —copos, papelitos, luciérnagas, gotas— que nacen, cruzan la
 * banda y se apagan, en bucle. Cada efecto pertenece a una colección y usa
 * su paleta (ver `ui/colecciones`): la nevada es blanca y plata, el confeti
 * rosa, menta y oro, los píxeles menta y lila. Se mueven con las mismas
 * tres formas que los marcos (`marcoBase`), en el hilo de UI, y tienen a lo
 * sumo veinte nodos animados: es una banda entera, no una foto.
 *
 * Lo «aleatorio» sale de la razón áurea: la partícula `i` cae en
 * `frac(i·φ)` del ancho, con su demora y su tamaño derivados del mismo
 * número, así la lluvia no forma columnas y dos aperturas dan la misma
 * lluvia.
 */
export const EFECTOS = [
  { id: 'nevada', nombre: 'Nevada', familia: 'naturaleza' },
  { id: 'lluvia-de-confeti', nombre: 'Lluvia de confeti', familia: 'fiesta' },
  { id: 'luciernagas-de-noche', nombre: 'Luciérnagas', familia: 'naturaleza' },
  { id: 'estrellas-fugaces', nombre: 'Estrellas fugaces', familia: 'cielo' },
  { id: 'lluvia', nombre: 'Lluvia', familia: 'energia' },
  { id: 'lluvia-de-pixeles', nombre: 'Lluvia de píxeles', familia: 'arcade' },
  { id: 'bandada', nombre: 'Bandada', familia: 'gotico' },
] as const

export type EfectoId = (typeof EFECTOS)[number]['id']

export function esEfectoDibujado(id: string | null | undefined): id is EfectoId {
  return !!id && EFECTOS.some((e) => e.id === id)
}

export function nombreDeEfecto(id: string | null | undefined): string | null {
  return EFECTOS.find((e) => e.id === id)?.nombre ?? null
}

/** Lo que una partícula necesita saber: dónde nace y a qué ritmo va. */
type Particula = {
  i: number
  /** Fracción del ancho donde nace. */
  x: number
  /** Otra fracción, para variar tamaños y desvíos. */
  v: number
  duracion: number
  demora: number
}

const PHI = 0.6180339887

/** El número plástico: otra secuencia que no se repite, independiente de φ. */
const RHO = 0.7548776662

/**
 * `n` partículas repartidas por la razón áurea.
 *
 * La posición sale de φ y la fase de ρ, dos irracionales sin relación: con
 * la fase derivada también de φ, las partículas vecinas salían en fila y
 * la nevada era una diagonal de puntos, no una nevada.
 */
function repartir(n: number, base: number, variacion: number): Particula[] {
  return Array.from({ length: n }, (_, i) => {
    const x = (i * PHI) % 1
    const v = (i * PHI * PHI + 0.37) % 1
    const fase = (i * RHO + 0.11) % 1
    return { i, x, v, duracion: Math.round(base + variacion * v), demora: Math.round(fase * base) }
  })
}

/**
 * El efecto por id, sobre una banda de `ancho`×`alto`. Se mide solo:
 * las partículas se ubican en fracciones del ancho y no pueden hasta saber
 * cuánto mide.
 */
export function EfectoDibujado({
  id,
  alto,
  animado = true,
}: {
  id: EfectoId
  alto: number
  animado?: boolean
}) {
  const [ancho, setAncho] = useState(0)
  const Pieza = PIEZAS[id]
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, right: 0, top: 0, height: alto, overflow: 'hidden' }}
      onLayout={(e) => setAncho(e.nativeEvent.layout.width)}
    >
      {ancho > 0 ? (
        <Movimiento.Provider value={animado}>
          <Pieza ancho={ancho} alto={alto} />
        </Movimiento.Provider>
      ) : null}
    </View>
  )
}

type Lienzo = { ancho: number; alto: number }

/* ------------------------------------------------------------------------ */

/** Copos que caen meciéndose, más lentos los grandes; blanco y plata. */
function Nevada({ ancho, alto }: Lienzo) {
  return (
    <>
      {repartir(18, 6000, 4000).map((p) => (
        <Copo key={p.i} p={p} ancho={ancho} alto={alto} />
      ))}
    </>
  )
}

function Copo({ p, ancho, alto }: { p: Particula; ancho: number; alto: number }) {
  const t = useCiclo(p.duracion, p.demora)
  const tam = 2 + 4 * p.v
  const estilo = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.sin(Math.PI * t.value) * 1.6) * (0.5 + 0.5 * p.v),
    transform: [
      { translateY: -tam + (alto + 2 * tam) * t.value },
      { translateX: 12 * Math.sin(t.value * Math.PI * 4 + p.i) },
    ],
  }))
  return (
    <Animated.View style={[{ position: 'absolute', left: p.x * ancho, top: 0, width: tam * 2, height: tam * 2 }, estilo]}>
      <Svg width={tam * 2} height={tam * 2}>
        <Circle cx={tam} cy={tam} r={tam / 2 + 0.5} fill={p.i % 3 === 0 ? TONO.plata : TONO.blanco} />
      </Svg>
    </Animated.View>
  )
}

/** Papelitos que caen girando: rosa, menta y oro. */
function LluviaDeConfeti({ ancho, alto }: Lienzo) {
  return (
    <>
      {repartir(20, 3600, 2200).map((p) => (
        <Papelito key={p.i} p={p} ancho={ancho} alto={alto} />
      ))}
    </>
  )
}

function Papelito({ p, ancho, alto }: { p: Particula; ancho: number; alto: number }) {
  const t = useCiclo(p.duracion, p.demora)
  const colores = [TONO.rosa, TONO.menta, TONO.oro]
  const w = 6 + 4 * p.v
  const h = 3 + 2 * p.v
  const estilo = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.sin(Math.PI * t.value) * 1.8),
    transform: [
      { translateY: -12 + (alto + 24) * t.value },
      { translateX: 18 * Math.sin(t.value * Math.PI * 3 + p.i) },
      { rotate: `${p.i * 40 + 540 * t.value}deg` },
      { rotateX: `${360 * t.value}deg` },
    ],
  }))
  return (
    <Animated.View style={[{ position: 'absolute', left: p.x * ancho, top: 0, width: w, height: h }, estilo]}>
      <Svg width={w} height={h}>
        <Rect x={0} y={0} width={w} height={h} rx={1} fill={colores[p.i % 3]} />
      </Svg>
    </Animated.View>
  )
}

/** Luces doradas que vagan en ochos y se encienden cuando quieren. */
function LuciernagasDeNoche({ ancho, alto }: Lienzo) {
  return (
    <>
      {repartir(12, 5000, 3000).map((p) => (
        <Luz key={p.i} p={p} ancho={ancho} alto={alto} />
      ))}
    </>
  )
}

function Luz({ p, ancho, alto }: { p: Particula; ancho: number; alto: number }) {
  const t = useCiclo(p.duracion, p.demora)
  const tam = 10
  const estilo = useAnimatedStyle(() => {
    const x = t.value
    const luz = Math.max(0, Math.sin(x * Math.PI * 3))
    return {
      opacity: 0.1 + 0.9 * luz * luz,
      transform: [
        { translateX: 26 * Math.sin(x * Math.PI * 2) },
        { translateY: 18 * Math.sin(x * Math.PI * 4 + p.i) },
      ],
    }
  })
  return (
    <Animated.View
      style={[{ position: 'absolute', left: p.x * ancho, top: (0.15 + 0.7 * p.v) * alto, width: tam * 2, height: tam * 2 }, estilo]}
    >
      <Svg width={tam * 2} height={tam * 2}>
        <Circle cx={tam} cy={tam} r={tam * 0.8} fill={alfa(TONO.oro, 0.2)} />
        <Circle cx={tam} cy={tam} r={tam * 0.4} fill={alfa(TONO.oro, 0.6)} />
        <Circle cx={tam} cy={tam} r={tam * 0.2} fill={TONO.blanco} />
      </Svg>
    </Animated.View>
  )
}

/** Estrellas quietas titilando y, de a una, una fugaz que cruza en diagonal. */
function EstrellasFugaces({ ancho, alto }: Lienzo) {
  return (
    <>
      {repartir(14, 2200, 1800).map((p) => (
        <Titilar key={p.i} p={p} ancho={ancho} alto={alto} />
      ))}
      {repartir(3, 5200, 1400).map((p) => (
        <Fugaz key={p.i} p={p} ancho={ancho} alto={alto} />
      ))}
    </>
  )
}

function Titilar({ p, ancho, alto }: { p: Particula; ancho: number; alto: number }) {
  const t = useCiclo(p.duracion, p.demora)
  const tam = 1.2 + 1.6 * p.v
  const estilo = useAnimatedStyle(() => ({ opacity: 0.25 + 0.75 * Math.abs(Math.sin(t.value * Math.PI)) }))
  return (
    <Animated.View style={[{ position: 'absolute', left: p.x * ancho, top: p.v * alto * 0.8, width: tam * 2, height: tam * 2 }, estilo]}>
      <Svg width={tam * 2} height={tam * 2}>
        <Circle cx={tam} cy={tam} r={tam} fill={p.i % 4 === 0 ? TONO.lila : TONO.blanco} />
      </Svg>
    </Animated.View>
  )
}

function Fugaz({ p, ancho, alto }: { p: Particula; ancho: number; alto: number }) {
  const t = useCiclo(p.duracion, p.demora)
  const largo = 70
  const estilo = useAnimatedStyle(() => {
    const x = t.value
    /* Cruza en el primer cuarto del ciclo y el resto descansa. */
    const f = Math.min(1, x * 4)
    return {
      opacity: x < 0.25 ? Math.sin(Math.PI * f) : 0,
      transform: [{ translateX: -ancho * 0.35 * f }, { translateY: alto * 0.45 * f }],
    }
  })
  return (
    <Animated.View
      style={[{ position: 'absolute', left: (0.4 + 0.55 * p.x) * ancho, top: p.v * alto * 0.3, width: largo, height: 4 }, estilo]}
    >
      <Svg width={largo} height={4}>
        <Line x1={0} y1={2} x2={largo} y2={2} stroke={TONO.blanco} strokeWidth={1.4} strokeLinecap="round" transform={`rotate(-38 ${largo} 2)`} opacity={0.9} />
        <Circle cx={largo} cy={2} r={2} fill={TONO.blanco} />
      </Svg>
    </Animated.View>
  )
}

/** Gotas finas cayendo rápido, en diagonal apenas: cielo y blanco. */
function Lluvia({ ancho, alto }: Lienzo) {
  return (
    <>
      {repartir(20, 900, 500).map((p) => (
        <Gota key={p.i} p={p} ancho={ancho} alto={alto} />
      ))}
    </>
  )
}

function Gota({ p, ancho, alto }: { p: Particula; ancho: number; alto: number }) {
  const t = useCiclo(p.duracion, p.demora)
  const largo = 14 + 10 * p.v
  const estilo = useAnimatedStyle(() => ({
    opacity: 0.25 + 0.5 * Math.sin(Math.PI * t.value),
    transform: [{ translateY: -largo + (alto + largo) * t.value }, { translateX: -alto * 0.08 * t.value }],
  }))
  return (
    <Animated.View style={[{ position: 'absolute', left: p.x * ancho, top: 0, width: 2, height: largo }, estilo]}>
      <Svg width={2} height={largo}>
        <Line x1={1} y1={0} x2={1} y2={largo} stroke={p.i % 5 === 0 ? TONO.blanco : TONO.cielo} strokeWidth={1.2} strokeLinecap="round" />
      </Svg>
    </Animated.View>
  )
}

/** Cuadrados menta y lila que caen a saltos, como la lluvia de un juego. */
function LluviaDePixeles({ ancho, alto }: Lienzo) {
  return (
    <>
      {repartir(16, 3200, 2000).map((p) => (
        <Pixel key={p.i} p={p} ancho={ancho} alto={alto} />
      ))}
    </>
  )
}

function Pixel({ p, ancho, alto }: { p: Particula; ancho: number; alto: number }) {
  const t = useCiclo(p.duracion, p.demora)
  const tam = 5 + 4 * Math.round(p.v)
  const pasos = 14
  const estilo = useAnimatedStyle(() => ({
    opacity: t.value < 0.9 ? 1 : 0,
    transform: [{ translateY: -tam + Math.floor(t.value * pasos) * ((alto + tam) / pasos) }],
  }))
  return (
    <Animated.View style={[{ position: 'absolute', left: Math.round((p.x * ancho) / tam) * tam, top: 0, width: tam, height: tam }, estilo]}>
      <Svg width={tam} height={tam}>
        <Rect x={0} y={0} width={tam} height={tam} fill={p.i % 2 === 0 ? TONO.menta : TONO.lila} />
      </Svg>
    </Animated.View>
  )
}

/** La silueta de un murciélago con las alas abiertas, centrada, de envergadura 2s. */
function murcielago(s: number): string {
  const k = s / 14
  return `M0,${2 * k} C${-3 * k},${-3 * k} ${-9 * k},${-4 * k} ${-14 * k},${-1 * k} C${-11 * k},${0} ${-10 * k},${2 * k} ${-9 * k},${4 * k} C${-7 * k},${2 * k} ${-4 * k},${2 * k} ${-2 * k},${4 * k} L0,${2.5 * k} L${2 * k},${4 * k} C${4 * k},${2 * k} ${7 * k},${2 * k} ${9 * k},${4 * k} C${10 * k},${2 * k} ${11 * k},${0} ${14 * k},${-1 * k} C${9 * k},${-4 * k} ${3 * k},${-3 * k} 0,${2 * k} Z`
}

/** Murciélagos plata cruzando la banda de un lado al otro, batiendo. */
function Bandada({ ancho, alto }: Lienzo) {
  return (
    <>
      {repartir(6, 7000, 3000).map((p) => (
        <Volador key={p.i} p={p} ancho={ancho} alto={alto} />
      ))}
    </>
  )
}

function Volador({ p, ancho, alto }: { p: Particula; ancho: number; alto: number }) {
  const t = useCiclo(p.duracion, p.demora)
  const tam = 8 + 8 * p.v
  const caja = tam * 2.2
  const estilo = useAnimatedStyle(() => {
    const x = t.value
    return {
      opacity: Math.min(1, Math.sin(Math.PI * x) * 2) * 0.9,
      transform: [
        { translateX: -caja + (ancho + 2 * caja) * x },
        { translateY: 14 * Math.sin(x * Math.PI * 6 + p.i) },
        { scaleY: Math.cos(x * Math.PI * 40) },
      ],
    }
  })
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: (0.1 + 0.6 * p.v) * alto, width: caja, height: caja }, estilo]}>
      <Svg width={caja} height={caja}>
        <Path d={murcielago(tam)} fill={alfa(TONO.plata, 0.9)} transform={`translate(${caja / 2} ${caja / 2})`} />
      </Svg>
    </Animated.View>
  )
}

const PIEZAS: Record<EfectoId, (props: Lienzo) => ReactNode> = {
  nevada: Nevada,
  'lluvia-de-confeti': LluviaDeConfeti,
  'luciernagas-de-noche': LuciernagasDeNoche,
  'estrellas-fugaces': EstrellasFugaces,
  lluvia: Lluvia,
  'lluvia-de-pixeles': LluviaDePixeles,
  bandada: Bandada,
}
