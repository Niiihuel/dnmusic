import type { ReactNode } from 'react'
import { View } from 'react-native'
import Animated, { useAnimatedStyle } from 'react-native-reanimated'
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg'
import {
  alfa,
  capa,
  Lienzo,
  punto,
  Radial,
  TONO,
  useCiclo,
  useVaiven,
  type Geo,
} from './marcoBase'

/**
 * Las colecciones temáticas: marcos que van **en tanda**, con un estilo que
 * se reconoce de lejos, como las colecciones de la tienda de Discord
 * («Arcade», «Fantasía oscura»…). Cada tanda tiene su paleta de dos o tres
 * tonos y su manera de moverse, y por eso se sienten de la misma familia y
 * no de un catálogo suelto.
 *
 * **Arcade**: píxeles y dos tonos —menta y lila—, todo se mueve a saltos,
 * como un sprite de ocho bits, nunca suave.
 *
 * **Gótico**: plata sobre humo, murciélagos, telarañas y velas; lo único
 * que tiene color es la llama.
 *
 * Mismas reglas que el resto (`Marco.tsx`): SVG, animación en el hilo de
 * UI, a lo sumo una docena de nodos animados. Quieto, cada pieza posa.
 */
export const MARCOS_TEMATICOS = [
  { id: 'pixeles', nombre: 'Píxeles', familia: 'arcade' },
  { id: 'corazones8bit', nombre: 'Corazones de 8 bits', familia: 'arcade' },
  { id: 'invasor', nombre: 'Invasor', familia: 'arcade' },
  { id: 'murcielagos', nombre: 'Murciélagos', familia: 'gotico' },
  { id: 'telarana', nombre: 'Telaraña', familia: 'gotico' },
  { id: 'velas', nombre: 'Velas', familia: 'gotico' },
] as const

type MarcoTematicoId = (typeof MARCOS_TEMATICOS)[number]['id']

/** Los rectángulos de un dibujo de píxeles: `X` pinta, `.` no. */
function pixeles(mapa: string[], p: number, color: string, key: string) {
  const rects: ReactNode[] = []
  mapa.forEach((fila, y) => {
    for (let x = 0; x < fila.length; x++) {
      if (fila[x] === 'X') rects.push(<Rect key={`${key}${x},${y}`} x={x * p} y={y * p} width={p} height={p} fill={color} />)
    }
  })
  return rects
}

/* ------------------------------------------------------------------------ */
/* Arcade                                                                     */
/* ------------------------------------------------------------------------ */

/**
 * Un anillo de píxeles que gira **a saltos**: veinticuatro cuadrados menta y
 * lila alternados que avanzan un lugar por tic, como el aro de un juego de
 * fichas. Adentro, un segundo anillo de puntos más lento y al revés. Lo
 * que lo hace arcade es que nunca interpola.
 */
function Pixeles({ geo }: { geo: Geo }) {
  const { u } = geo
  const t = useCiclo(4800)
  const afuera = useAnimatedStyle(() => ({
    transform: [{ rotate: `${Math.floor(t.value * 24) * 15}deg` }],
  }))
  const adentro = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-Math.floor(t.value * 16) * 22.5}deg` }],
  }))
  const p = 3.2 * u
  return (
    <>
      <Animated.View style={[capa(geo.lado), afuera]}>
        <Lienzo geo={geo}>
          {Array.from({ length: 24 }, (_, i) => i * 15).map((a, i) => {
            const c = punto(geo, geo.ra, a)
            return (
              <Rect
                key={a}
                x={c.x - p / 2}
                y={c.y - p / 2}
                width={p}
                height={p}
                fill={i % 2 === 0 ? TONO.menta : TONO.lila}
              />
            )
          })}
        </Lienzo>
      </Animated.View>
      <Animated.View style={[capa(geo.lado), adentro]}>
        <Lienzo geo={geo}>
          {Array.from({ length: 16 }, (_, i) => i * 22.5).map((a) => {
            const c = punto(geo, geo.rf + 2.5 * u, a)
            return <Rect key={a} x={c.x - u} y={c.y - u} width={2 * u} height={2 * u} fill={alfa(TONO.blanco, 0.6)} />
          })}
        </Lienzo>
      </Animated.View>
    </>
  )
}

const CORAZON_8BIT = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...']

/**
 * Tres corazones de píxeles abajo, rebotando a saltos de un píxel, cada uno
 * a su ritmo: la barra de vidas de cualquier juego. Rubí con un píxel blanco
 * de brillo, y un anillo lila apenas dibujado.
 */
function Corazones8bit({ geo }: { geo: Geo }) {
  const { c, ra, u } = geo
  return (
    <>
      <Lienzo geo={geo}>
        <Circle cx={c} cy={c} r={ra} stroke={alfa(TONO.lila, 0.3)} strokeWidth={u} fill="none" strokeDasharray={`${2 * u} ${2 * u}`} />
      </Lienzo>
      <Corazon8bit geo={geo} angulo={150} demora={0} />
      <Corazon8bit geo={geo} angulo={180} demora={330} />
      <Corazon8bit geo={geo} angulo={210} demora={660} />
    </>
  )
}

function Corazon8bit({ geo, angulo, demora }: { geo: Geo; angulo: number; demora: number }) {
  const { ra, u } = geo
  const t = useCiclo(1400, demora)
  const p = 1.8 * u
  const estilo = useAnimatedStyle(() => ({
    /* A saltos de un píxel: cero, uno, dos, uno, cero. */
    transform: [{ translateY: -Math.round(Math.abs(Math.sin(t.value * Math.PI)) * 2) * p }],
  }))
  const w = 7 * p
  const h = 6 * p
  const pos = punto(geo, ra + u, angulo)
  return (
    <Animated.View style={[{ position: 'absolute', left: pos.x - w / 2, top: pos.y - h / 2, width: w, height: h }, estilo]}>
      <Svg width={w} height={h}>
        {pixeles(CORAZON_8BIT, p, TONO.rubi, 'c')}
        <Rect x={p} y={p} width={p} height={p} fill={alfa(TONO.blanco, 0.85)} />
      </Svg>
    </Animated.View>
  )
}

const INVASOR_A = [
  '..X.....X..',
  '...X...X...',
  '..XXXXXXX..',
  '.XX.XXX.XX.',
  'XXXXXXXXXXX',
  'X.XXXXXXX.X',
  'X.X.....X.X',
  '...XX.XX...',
]
const INVASOR_B = [
  '..X.....X..',
  'X..X...X..X',
  'X.XXXXXXX.X',
  'XXX.XXX.XXX',
  'XXXXXXXXXXX',
  '.XXXXXXXXX.',
  '..X.....X..',
  '.X.......X.',
]

/**
 * Un invasor del espacio asomando arriba a la derecha, con sus dos cuadros
 * de siempre alternando dos veces por segundo, y una bala que baja por la
 * izquierda. El anillo es menta punteado: la pantalla de un arcade.
 */
function Invasor({ geo }: { geo: Geo }) {
  const { c, ra, u } = geo
  const t = useCiclo(1000)
  const cuadroA = useAnimatedStyle(() => ({ opacity: t.value < 0.5 ? 1 : 0 }))
  const cuadroB = useAnimatedStyle(() => ({ opacity: t.value < 0.5 ? 0 : 1 }))
  const bala = useCiclo(1600, 400)
  const balaEstilo = useAnimatedStyle(() => ({
    opacity: bala.value < 0.85 ? 1 : 0,
    transform: [{ translateY: Math.floor(bala.value * 10) * 2.2 * u }],
  }))
  const p = 1.7 * u
  const w = 11 * p
  const h = 8 * p
  const pos = punto(geo, ra + 2 * u, 45)
  const posBala = punto(geo, ra + u, -50)
  return (
    <>
      <Lienzo geo={geo}>
        <Circle cx={c} cy={c} r={ra} stroke={alfa(TONO.menta, 0.35)} strokeWidth={1.2 * u} fill="none" strokeDasharray={`${3 * u} ${3 * u}`} />
      </Lienzo>
      <View style={{ position: 'absolute', left: pos.x - w / 2, top: pos.y - h / 2, width: w, height: h }}>
        <Animated.View style={[{ position: 'absolute', width: w, height: h }, cuadroA]}>
          <Svg width={w} height={h}>{pixeles(INVASOR_A, p, TONO.menta, 'a')}</Svg>
        </Animated.View>
        <Animated.View style={[{ position: 'absolute', width: w, height: h }, cuadroB]}>
          <Svg width={w} height={h}>{pixeles(INVASOR_B, p, TONO.menta, 'b')}</Svg>
        </Animated.View>
      </View>
      <Animated.View style={[{ position: 'absolute', left: posBala.x - p / 2, top: posBala.y - 12 * u, width: p, height: 3 * p }, balaEstilo]}>
        <Svg width={p} height={3 * p}>
          <Rect x={0} y={0} width={p} height={3 * p} fill={TONO.lila} />
        </Svg>
      </Animated.View>
    </>
  )
}

/* ------------------------------------------------------------------------ */
/* Gótico                                                                     */
/* ------------------------------------------------------------------------ */

/** La silueta de un murciélago con las alas abiertas, centrada, de envergadura 2s. */
function murcielago(s: number): string {
  const k = s / 14
  /* Las alas, y en el medio un cuerpo con orejas: sin él, de lejos era una
     tilde. */
  return `M0,${1.5 * k} C${-3 * k},${-3 * k} ${-9 * k},${-4 * k} ${-14 * k},${-1 * k} C${-11 * k},${0} ${-10 * k},${2 * k} ${-9 * k},${4.5 * k} C${-7 * k},${2.5 * k} ${-4 * k},${2.5 * k} ${-2.2 * k},${5 * k} C${-1.5 * k},${3 * k} ${-1 * k},${2.5 * k} 0,${2.5 * k} C${1 * k},${2.5 * k} ${1.5 * k},${3 * k} ${2.2 * k},${5 * k} C${4 * k},${2.5 * k} ${7 * k},${2.5 * k} ${9 * k},${4.5 * k} C${10 * k},${2 * k} ${11 * k},${0} ${14 * k},${-1 * k} C${9 * k},${-4 * k} ${3 * k},${-3 * k} 0,${1.5 * k} Z M${-1.6 * k},${-1.2 * k} L${-1.2 * k},${-3.4 * k} L${-0.4 * k},${-1.6 * k} Z M${1.6 * k},${-1.2 * k} L${1.2 * k},${-3.4 * k} L${0.4 * k},${-1.6 * k} Z`
}

/**
 * Tres murciélagos plata dando vueltas por arriba, batiendo las alas —el
 * batido es un `scaleY` que va y vuelve alrededor del cuerpo— y subiendo y
 * bajando apenas. El anillo es humo con un filo plata: piedra vieja.
 */
function Murcielagos({ geo }: { geo: Geo }) {
  const { c, ra, u } = geo
  return (
    <>
      <Lienzo geo={geo}>
        <Circle cx={c} cy={c} r={ra} stroke={alfa(TONO.humo, 0.9)} strokeWidth={3 * u} fill="none" />
        <Circle cx={c} cy={c} r={ra + 1.6 * u} stroke={alfa(TONO.plata, 0.35)} strokeWidth={0.7 * u} fill="none" />
      </Lienzo>
      <Murcielago geo={geo} angulo={-48} r={ra + 5 * u} tam={10 * u} demora={0} />
      <Murcielago geo={geo} angulo={-6} r={ra + 8 * u} tam={7 * u} demora={230} />
      <Murcielago geo={geo} angulo={40} r={ra + 5.5 * u} tam={8.5 * u} demora={480} />
    </>
  )
}

function Murcielago({ geo, angulo, r, tam, demora }: { geo: Geo; angulo: number; r: number; tam: number; demora: number }) {
  const { u } = geo
  const aleteo = useVaiven(240, demora)
  const vuelo = useVaiven(2600, demora)
  const estilo = useAnimatedStyle(() => ({
    transform: [
      { translateY: -2 * u + 4 * u * vuelo.value },
      { scaleY: 1 - 1.35 * aleteo.value },
    ],
  }))
  const pos = punto(geo, r, angulo)
  const caja = tam * 2.2
  return (
    <Animated.View style={[{ position: 'absolute', left: pos.x - caja / 2, top: pos.y - caja / 2, width: caja, height: caja }, estilo]}>
      <Svg width={caja} height={caja}>
        <Path d={murcielago(tam)} fill={TONO.plata} transform={`translate(${caja / 2} ${caja / 2})`} />
      </Svg>
    </Animated.View>
  )
}

/**
 * Una telaraña en la esquina de arriba a la izquierda —radios y anillos,
 * quieta— y una araña que baja de la esquina de la derecha por su hilo y
 * vuelve a subir. Plata muy tenue: se ve al mirar, no antes.
 */
function Telarana({ geo }: { geo: Geo }) {
  const { c, ra, u, lado } = geo
  const origen = { x: 1.5 * u, y: 1.5 * u }
  const largo = ra * 0.95
  const radios = [0, 15, 30, 45, 60, 75, 90].map((a) => {
    const rad = (a * Math.PI) / 180
    return { x: origen.x + largo * Math.cos(rad), y: origen.y + largo * Math.sin(rad) }
  })
  const anillos = [0.3, 0.52, 0.74, 0.96]
  return (
    <>
      <Lienzo geo={geo}>
        <Circle cx={c} cy={c} r={ra} stroke={alfa(TONO.humo, 0.9)} strokeWidth={2.4 * u} fill="none" />
        {radios.map((p, i) => (
          <Line key={i} x1={origen.x} y1={origen.y} x2={p.x} y2={p.y} stroke={alfa(TONO.plata, 0.55)} strokeWidth={0.6 * u} />
        ))}
        {anillos.map((f) => {
          const r = largo * f
          /* Un arco de 90° combado hacia adentro entre radio y radio. */
          let d = ''
          for (let i = 0; i < radios.length - 1; i++) {
            const a1 = (i * 15 * Math.PI) / 180
            const a2 = ((i + 1) * 15 * Math.PI) / 180
            const p1 = { x: origen.x + r * Math.cos(a1), y: origen.y + r * Math.sin(a1) }
            const p2 = { x: origen.x + r * Math.cos(a2), y: origen.y + r * Math.sin(a2) }
            const am = (a1 + a2) / 2
            const m = { x: origen.x + r * 0.9 * Math.cos(am), y: origen.y + r * 0.9 * Math.sin(am) }
            d += `${i === 0 ? 'M' : 'L'}${p1.x},${p1.y} Q${m.x},${m.y} ${p2.x},${p2.y} `
          }
          return <Path key={f} d={d} stroke={alfa(TONO.plata, 0.5)} strokeWidth={0.6 * u} fill="none" />
        })}
      </Lienzo>
      <Arana geo={geo} x={lado - 9 * u} />
    </>
  )
}

function Arana({ geo, x }: { geo: Geo; x: number }) {
  const { u } = geo
  const t = useVaiven(3400)
  const estilo = useAnimatedStyle(() => ({ transform: [{ translateY: 10 * u * t.value }] }))
  const alto = 22 * u
  return (
    <Animated.View style={[{ position: 'absolute', left: x - 4 * u, top: 0, width: 8 * u, height: alto }, estilo]}>
      <Svg width={8 * u} height={alto}>
        <Line x1={4 * u} y1={-40 * u} x2={4 * u} y2={alto - 5 * u} stroke={alfa(TONO.plata, 0.6)} strokeWidth={0.5 * u} />
        {[-1, 1].map((s) =>
          [0, 1, 2, 3].map((i) => (
            <Line
              key={`${s}${i}`}
              x1={4 * u}
              y1={alto - 4.5 * u + i * 0.6 * u}
              x2={4 * u + s * (3.2 - i * 0.4) * u}
              y2={alto - 6.5 * u + i * 1.4 * u}
              stroke={TONO.plata}
              strokeWidth={0.5 * u}
              strokeLinecap="round"
            />
          )),
        )}
        <Circle cx={4 * u} cy={alto - 4 * u} r={1.6 * u} fill={TONO.plata} />
        <Circle cx={4 * u} cy={alto - 6.2 * u} r={1 * u} fill={TONO.plata} />
      </Svg>
    </Animated.View>
  )
}

/**
 * Dos velas apoyadas abajo a los costados, con la llama temblando y una
 * gota de cera. Es lo único con color de la colección: la llama, ámbar y
 * naranja. El anillo es humo, como el resto.
 */
function Velas({ geo }: { geo: Geo }) {
  const { c, ra, u } = geo
  return (
    <>
      <Lienzo geo={geo}>
        <Circle cx={c} cy={c} r={ra} stroke={alfa(TONO.humo, 0.9)} strokeWidth={2.4 * u} fill="none" />
      </Lienzo>
      <Vela geo={geo} angulo={-142} demora={0} />
      <Vela geo={geo} angulo={142} demora={600} />
    </>
  )
}

function Vela({ geo, angulo, demora }: { geo: Geo; angulo: number; demora: number }) {
  const { ra, u } = geo
  const w = 6 * u
  const h = 16 * u
  return (
    <Radial geo={geo} angulo={angulo} r={ra - 2 * u} ancho={w} alto={h}>
      {/* La vela, derecha aunque esté en un ángulo: el Radial la apoya sobre
          el anillo apuntando afuera, que abajo es hacia abajo. */}
      <View style={{ width: w, height: h, transform: [{ rotate: '180deg' }] }}>
        <Llama ancho={w} alto={h} demora={demora} u={u} />
      </View>
    </Radial>
  )
}

function Llama({ ancho, alto, demora, u }: { ancho: number; alto: number; demora: number; u: number }) {
  const t = useVaiven(360, demora)
  const estilo = useAnimatedStyle(() => ({
    transform: [{ scaleY: 0.8 + 0.35 * t.value }, { rotate: `${-6 + 12 * t.value}deg` }],
  }))
  const cera = alto * 0.55
  const llamaH = alto - cera
  return (
    <View style={{ width: ancho, height: alto }}>
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: ancho, height: llamaH, transformOrigin: '50% 100%' }, estilo]}>
        <Svg width={ancho} height={llamaH}>
          <Path
            d={`M${ancho / 2},${llamaH} C${ancho * 0.05},${llamaH * 0.7} ${ancho * 0.15},${llamaH * 0.35} ${ancho / 2},0 C${ancho * 0.85},${llamaH * 0.35} ${ancho * 0.95},${llamaH * 0.7} ${ancho / 2},${llamaH} Z`}
            fill={TONO.naranja}
          />
          <Path
            d={`M${ancho / 2},${llamaH} C${ancho * 0.3},${llamaH * 0.75} ${ancho * 0.35},${llamaH * 0.5} ${ancho / 2},${llamaH * 0.3} C${ancho * 0.65},${llamaH * 0.5} ${ancho * 0.7},${llamaH * 0.75} ${ancho / 2},${llamaH} Z`}
            fill={TONO.ambar}
          />
        </Svg>
      </Animated.View>
      <Svg width={ancho} height={alto} style={{ position: 'absolute' }}>
        <Rect x={ancho * 0.2} y={llamaH} width={ancho * 0.6} height={cera} rx={0.8 * u} fill={TONO.plata} />
        <Rect x={ancho * 0.28} y={llamaH - 0.5 * u} width={ancho * 0.44} height={1.2 * u} fill={alfa(TONO.humo, 0.6)} />
        <Circle cx={ancho * 0.72} cy={llamaH + cera * 0.45} r={0.9 * u} fill={alfa(TONO.blanco, 0.7)} />
      </Svg>
    </View>
  )
}

/** Qué se dibuja con cada nombre de esta tanda. */
export const PIEZAS_TEMATICAS: Record<MarcoTematicoId, (props: { geo: Geo }) => ReactNode> = {
  pixeles: Pixeles,
  corazones8bit: Corazones8bit,
  invasor: Invasor,
  murcielagos: Murcielagos,
  telarana: Telarana,
  velas: Velas,
}
