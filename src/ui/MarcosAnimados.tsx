import type { ReactNode } from 'react'
import Animated, { useAnimatedStyle } from 'react-native-reanimated'
import Svg, { Circle, Ellipse, G, Line, Path } from 'react-native-svg'
import {
  alfa,
  arco,
  capa,
  Giro,
  Lienzo,
  punto,
  Radial,
  TONO,
  useCiclo,
  useVaiven,
  type Geo,
} from './marcoBase'

/**
 * Los marcos animados al estilo de las decoraciones de Discord.
 *
 * Lo que se miró de Discord antes de dibujar: sus decoraciones son
 * animaciones cortas en bucle (dos a cuatro segundos) de **cosas que pasan
 * alrededor** de la foto —chispas que suben, corazones que flotan, un neón
 * que parpadea, orejas que se mueven— y no anillos que giran. Se apoyan en
 * el borde de la foto y la desbordan apenas (1,2×), se mueven de a poco y
 * nunca tapan la cara. En la tienda se ven quietas y se animan al pasar el
 * cursor o al probarlas sobre tu avatar; acá igual: la vidriera anima solo
 * la elegida y la que tiene el cursor encima (ver `app/profile/marco.tsx`).
 *
 * Las mismas reglas que el resto del catálogo (ver `Marco.tsx`): se dibujan
 * con SVG, dos o tres tonos por pieza de la escala de `lib/tema`, a lo sumo
 * una docena de nodos animados, todo con `withRepeat` en el hilo de UI y
 * nada por cuadro. Lo «aleatorio» —el parpadeo del neón, el ritmo de las
 * luciérnagas— sale de períodos que no coinciden, no de un azar por frame.
 */
export const MARCOS_ANIMADOS = [
  { id: 'neon', nombre: 'Neón', familia: 'energia' },
  { id: 'rayo', nombre: 'Rayo', familia: 'energia' },
  { id: 'confeti', nombre: 'Confeti', familia: 'fiesta' },
  { id: 'corazones', nombre: 'Corazones', familia: 'fiesta' },
  { id: 'burbujas', nombre: 'Burbujas', familia: 'fiesta' },
  { id: 'orejas', nombre: 'Orejas de gato', familia: 'fiesta' },
  { id: 'planetas', nombre: 'Planetas', familia: 'cielo' },
  { id: 'aurora', nombre: 'Aurora', familia: 'cielo' },
  { id: 'nieve', nombre: 'Nieve', familia: 'naturaleza' },
  { id: 'luciernagas', nombre: 'Luciérnagas', familia: 'naturaleza' },
] as const

type MarcoAnimadoId = (typeof MARCOS_ANIMADOS)[number]['id']

/** Un cuadro absoluto de `caja`×`caja` centrado en un punto del lienzo. */
function cuadro(geo: Geo, r: number, angulo: number, caja: number) {
  const p = punto(geo, r, angulo)
  return { position: 'absolute' as const, left: p.x - caja / 2, top: p.y - caja / 2, width: caja, height: caja }
}

/* ------------------------------------------------------------------------ */
/* Energía                                                                    */
/* ------------------------------------------------------------------------ */

/**
 * Un tubo de neón: el vidrio apagado atrás, y encima el gas encendido con su
 * resplandor. Parpadea como un cartel de verdad —casi siempre prendido, con
 * dos caídas cortas por ciclo— y un tramo abajo a la izquierda zumba por su
 * cuenta, que es lo que tiene todo neón viejo. Agua y blanco: dos tonos.
 */
function Neon({ geo }: { geo: Geo }) {
  const { c, ra, u } = geo
  const t = useCiclo(3400)
  const luz = useAnimatedStyle(() => {
    const x = t.value
    const caida = (x > 0.31 && x < 0.335) || (x > 0.62 && x < 0.628) || (x > 0.655 && x < 0.67)
    return { opacity: caida ? 0.3 : 0.9 + 0.1 * Math.sin(x * Math.PI * 14) }
  })
  return (
    <>
      <Lienzo geo={geo}>
        <Circle cx={c} cy={c} r={ra} stroke={alfa(TONO.humo, 0.95)} strokeWidth={3.2 * u} fill="none" />
      </Lienzo>
      <Animated.View style={[capa(geo.lado), luz]}>
        <Lienzo geo={geo}>
          <Circle cx={c} cy={c} r={ra} stroke={alfa(TONO.agua, 0.2)} strokeWidth={10 * u} fill="none" />
          <Circle cx={c} cy={c} r={ra} stroke={alfa(TONO.agua, 0.55)} strokeWidth={4.5 * u} fill="none" />
          <Circle cx={c} cy={c} r={ra} stroke={TONO.blanco} strokeWidth={1.5 * u} fill="none" />
        </Lienzo>
      </Animated.View>
      <Zumbido geo={geo} />
    </>
  )
}

/** El tramo que falla: un arco de 40° que titila más rápido y más apagado. */
function Zumbido({ geo }: { geo: Geo }) {
  const { c, ra, u } = geo
  const t = useCiclo(1900)
  const estilo = useAnimatedStyle(() => ({
    opacity: 0.15 + 0.55 * Math.abs(Math.sin(t.value * Math.PI * 7)),
  }))
  return (
    <Animated.View style={[capa(geo.lado), estilo]}>
      <Lienzo geo={geo}>
        <Circle cx={c} cy={c} r={ra} stroke={TONO.humo} strokeWidth={3.4 * u} fill="none" {...arco(ra, 196, 236)} />
      </Lienzo>
    </Animated.View>
  )
}

/**
 * Tres rayos cayendo alrededor, cada uno con su propio relámpago: un
 * destello doble —flash, apagón, flash— y una cola que se apaga, y después
 * nada hasta la próxima vuelta. Los tres períodos son distintos para que la
 * tormenta no tenga ritmo. Cielo con el centro blanco, y un anillo tenue que
 * se ilumina con cada rayo.
 */
function Rayo({ geo }: { geo: Geo }) {
  const { c, ra, u } = geo
  return (
    <>
      <Lienzo geo={geo}>
        <Circle cx={c} cy={c} r={ra} stroke={alfa(TONO.cielo, 0.22)} strokeWidth={u} fill="none" />
      </Lienzo>
      <Relampago geo={geo} angulo={35} r={ra - 3 * u} duracion={2600} demora={0} />
      <Relampago geo={geo} angulo={160} r={ra - 3 * u} duracion={3300} demora={900} />
      <Relampago geo={geo} angulo={265} r={ra - 3 * u} duracion={2900} demora={1700} />
    </>
  )
}

/** La forma de un rayo apuntando hacia arriba, con la base en (w/2, h). */
function rayo(w: number, h: number): string {
  return `M${w * 0.55},0 L${w * 0.15},${h * 0.48} L${w * 0.5},${h * 0.46} L${w * 0.3},${h} L${w * 0.9},${h * 0.4} L${w * 0.55},${h * 0.42} L${w * 0.8},0 Z`
}

function Relampago({
  geo,
  angulo,
  r,
  duracion,
  demora,
}: {
  geo: Geo
  angulo: number
  r: number
  duracion: number
  demora: number
}) {
  const { u } = geo
  /* Quieto, en pleno relámpago: es cuando el rayo se ve. */
  const t = useCiclo(duracion, demora, 0.02)
  const estilo = useAnimatedStyle(() => {
    const x = t.value
    const o =
      x < 0.05 ? 1 : x < 0.09 ? 0.15 : x < 0.14 ? 0.95 : x < 0.34 ? Math.max(0, 0.95 - (x - 0.14) * 4.75) : 0
    return { opacity: o }
  })
  const w = 8 * u
  const h = 15 * u
  return (
    <Radial geo={geo} angulo={angulo} r={r} ancho={w} alto={h}>
      <Animated.View style={[{ width: w, height: h }, estilo]}>
        <Svg width={w} height={h}>
          <Path d={rayo(w, h)} fill={alfa(TONO.cielo, 0.5)} stroke={alfa(TONO.cielo, 0.5)} strokeWidth={3 * u} strokeLinejoin="round" />
          <Path d={rayo(w, h)} fill={TONO.blanco} />
        </Svg>
      </Animated.View>
    </Radial>
  )
}

/* ------------------------------------------------------------------------ */
/* Fiesta                                                                     */
/* ------------------------------------------------------------------------ */

/**
 * Papelitos cayendo por la mitad de arriba: doce piezas —tiras y redondeles—
 * en rosa, menta y oro, cada una naciendo arriba del anillo, girando
 * mientras cae y apagándose antes de llegar a la foto. Ningún período
 * coincide con otro, así que nunca caen dos juntas.
 */
function Confeti({ geo }: { geo: Geo }) {
  const { c, ra, u } = geo
  const colores = [TONO.rosa, TONO.menta, TONO.oro]
  const piezas = Array.from({ length: 12 }, (_, i) => ({
    angulo: -84 + i * 15.3,
    r: ra + ((i * 7) % 3) * 2 * u - u,
    color: colores[i % 3],
    redondo: i % 4 === 3,
    duracion: 2200 + ((i * 173) % 900),
    demora: (i * 331) % 2000,
  }))
  return (
    <>
      <Lienzo geo={geo}>
        <Circle cx={c} cy={c} r={ra} stroke={alfa(TONO.blanco, 0.14)} strokeWidth={u} fill="none" />
      </Lienzo>
      {piezas.map((p) => (
        <Papelito key={p.angulo} geo={geo} {...p} />
      ))}
    </>
  )
}

function Papelito({
  geo,
  angulo,
  r,
  color,
  redondo,
  duracion,
  demora,
}: {
  geo: Geo
  angulo: number
  r: number
  color: string
  redondo: boolean
  duracion: number
  demora: number
}) {
  const { u } = geo
  const t = useCiclo(duracion, demora)
  const estilo = useAnimatedStyle(() => ({
    opacity: Math.sin(Math.PI * t.value),
    transform: [
      { translateY: -5 * u + 16 * u * t.value },
      { translateX: 2 * u * Math.sin(t.value * Math.PI * 3) },
      { rotate: `${angulo + 420 * t.value}deg` },
    ],
  }))
  const caja = 6 * u
  return (
    <Animated.View style={[cuadro(geo, r, angulo, caja), estilo]}>
      <Svg width={caja} height={caja}>
        {redondo ? (
          <Circle cx={caja / 2} cy={caja / 2} r={1.5 * u} fill={color} />
        ) : (
          <Path d={`M${u},${2.2 * u} h${4 * u} v${1.6 * u} h${-4 * u} Z`} fill={color} />
        )}
      </Svg>
    </Animated.View>
  )
}

/**
 * Corazones subiendo por los dos costados de abajo: seis, en rosa y blanco,
 * que nacen chicos pegados al anillo, crecen mientras suben y se van. Es la
 * decoración más pedida de Discord y la más simple de leer a 24 px: un
 * corazón es un corazón a cualquier tamaño.
 */
function Corazones({ geo }: { geo: Geo }) {
  const { c, ra, u } = geo
  const lista = [
    { angulo: 118, color: TONO.rosa, demora: 0 },
    { angulo: 140, color: TONO.blanco, demora: 1100 },
    { angulo: 158, color: TONO.rosa, demora: 500 },
    { angulo: 202, color: TONO.blanco, demora: 1600 },
    { angulo: 222, color: TONO.rosa, demora: 800 },
    { angulo: 244, color: TONO.blanco, demora: 300 },
  ]
  return (
    <>
      <Lienzo geo={geo}>
        <Circle cx={c} cy={c} r={ra} stroke={alfa(TONO.rosa, 0.28)} strokeWidth={u} fill="none" />
      </Lienzo>
      {lista.map((h) => (
        <Corazon key={h.angulo} geo={geo} r={ra} {...h} />
      ))}
    </>
  )
}

/** La forma de un corazón centrado en el origen, de «radio» s. */
function corazon(s: number): string {
  return `M0,${s} C${-1.35 * s},${-0.1 * s} ${-0.7 * s},${-1.15 * s} 0,${-0.5 * s} C${0.7 * s},${-1.15 * s} ${1.35 * s},${-0.1 * s} 0,${s} Z`
}

function Corazon({
  geo,
  angulo,
  r,
  color,
  demora,
}: {
  geo: Geo
  angulo: number
  r: number
  color: string
  demora: number
}) {
  const { u } = geo
  const t = useCiclo(2600, demora)
  const estilo = useAnimatedStyle(() => ({
    opacity: Math.sin(Math.PI * t.value),
    transform: [
      { translateY: 4 * u - 13 * u * t.value },
      { translateX: 1.5 * u * Math.sin(t.value * Math.PI * 2) },
      { scale: 0.55 + 0.55 * t.value },
    ],
  }))
  const s = 3.6 * u
  const caja = s * 3
  return (
    <Animated.View style={[cuadro(geo, r, angulo, caja), estilo]}>
      <Svg width={caja} height={caja}>
        <G x={caja / 2} y={caja / 2}>
          <Path d={corazon(s)} fill={color} />
        </G>
      </Svg>
    </Animated.View>
  )
}

/**
 * Burbujas subiendo desde abajo de la foto, meciéndose: siete, de tamaños
 * distintos, con el borde blanco, el vidrio agua apenas teñido y el brillo
 * arriba a la izquierda que las hace redondas. Las grandes suben más
 * despacio que las chicas, como en el agua.
 */
function Burbujas({ geo }: { geo: Geo }) {
  const { c, ra, u } = geo
  const lista = [
    { angulo: 100, tam: 2.4, duracion: 3200, demora: 0 },
    { angulo: 128, tam: 3.4, duracion: 4100, demora: 700 },
    { angulo: 152, tam: 1.8, duracion: 2700, demora: 1500 },
    { angulo: 180, tam: 2.9, duracion: 3700, demora: 400 },
    { angulo: 208, tam: 2.1, duracion: 2900, demora: 2000 },
    { angulo: 232, tam: 3.8, duracion: 4400, demora: 1100 },
    { angulo: 260, tam: 2.3, duracion: 3100, demora: 2600 },
  ]
  return (
    <>
      <Lienzo geo={geo}>
        <Circle cx={c} cy={c} r={ra} stroke={alfa(TONO.agua, 0.22)} strokeWidth={u} fill="none" />
      </Lienzo>
      {lista.map((b) => (
        <Burbuja key={b.angulo} geo={geo} r={ra} {...b} />
      ))}
    </>
  )
}

function Burbuja({
  geo,
  angulo,
  r,
  tam,
  duracion,
  demora,
}: {
  geo: Geo
  angulo: number
  r: number
  tam: number
  duracion: number
  demora: number
}) {
  const { u } = geo
  const t = useCiclo(duracion, demora)
  const estilo = useAnimatedStyle(() => ({
    opacity: 0.95 * Math.sin(Math.PI * t.value),
    transform: [
      { translateY: 5 * u - 17 * u * t.value },
      { translateX: 2 * u * Math.sin(t.value * Math.PI * 3) },
      { scale: 0.7 + 0.35 * t.value },
    ],
  }))
  const R = tam * u
  const caja = R * 2.6
  return (
    <Animated.View style={[cuadro(geo, r, angulo, caja), estilo]}>
      <Svg width={caja} height={caja}>
        <Circle cx={caja / 2} cy={caja / 2} r={R} fill={alfa(TONO.agua, 0.16)} stroke={alfa(TONO.blanco, 0.85)} strokeWidth={0.7 * u} />
        <Circle cx={caja / 2 - R * 0.38} cy={caja / 2 - R * 0.38} r={R * 0.24} fill={alfa(TONO.blanco, 0.9)} />
      </Svg>
    </Animated.View>
  )
}

/**
 * Dos orejas de gato apoyadas en la cabeza, que se mueven de a una: la
 * izquierda da un tirón, un rato después la derecha. Es la decoración
 * insignia de Discord. Humo con el borde plata y el rosa adentro — dos
 * tonos y el acento—, y la base entra apenas en la foto, como una oreja de
 * verdad sale de una cabeza.
 */
function Orejas({ geo }: { geo: Geo }) {
  const { c, rf, u } = geo
  return (
    <>
      <Lienzo geo={geo}>
        <Circle cx={c} cy={c} r={rf + 1.2 * u} stroke={alfa(TONO.plata, 0.35)} strokeWidth={u} fill="none" />
      </Lienzo>
      <Oreja geo={geo} angulo={-36} demora={0} />
      <Oreja geo={geo} angulo={36} demora={1900} />
    </>
  )
}

function Oreja({ geo, angulo, demora }: { geo: Geo; angulo: number; demora: number }) {
  const { rf, u } = geo
  const t = useCiclo(3800, demora)
  /* Quieta casi todo el ciclo; entre el 10 y el 22 % da el tirón hacia
     afuera y vuelve. El signo sigue al lado: cada oreja se abre hacia su lado. */
  const lado = angulo < 0 ? -1 : 1
  const estilo = useAnimatedStyle(() => {
    const x = t.value
    const tiron = x > 0.1 && x < 0.22 ? Math.sin(((x - 0.1) / 0.12) * Math.PI) : 0
    return { transform: [{ rotate: `${lado * 14 * tiron}deg` }] }
  })
  const w = 15 * u
  const h = 15 * u
  return (
    <Radial geo={geo} angulo={angulo} r={rf - 2.5 * u} ancho={w} alto={h}>
      <Animated.View style={[{ width: w, height: h, transformOrigin: '50% 100%' }, estilo]}>
        <Svg width={w} height={h}>
          <Path
            d={`M${w * 0.5},${0.6 * u} L${w * 0.96},${h - 0.6 * u} L${w * 0.04},${h - 0.6 * u} Z`}
            fill={TONO.humo}
            stroke={TONO.plata}
            strokeWidth={1.1 * u}
            strokeLinejoin="round"
          />
          <Path
            d={`M${w * 0.5},${h * 0.32} L${w * 0.78},${h * 0.9} L${w * 0.22},${h * 0.9} Z`}
            fill={TONO.rosa}
            strokeLinejoin="round"
          />
        </Svg>
      </Animated.View>
    </Radial>
  )
}

/* ------------------------------------------------------------------------ */
/* Cielo                                                                     */
/* ------------------------------------------------------------------------ */

/**
 * Un sistema chico: un planeta naranja con su anillo plata dando la vuelta
 * despacio, uno lila más chico al revés y más rápido por la órbita de
 * afuera, y una piedrita blanca por la de adentro. Tres órbitas apenas
 * dibujadas sostienen la composición cuando los planetas están del otro lado.
 */
function Planetas({ geo }: { geo: Geo }) {
  const { c, ra, u } = geo
  const rExt = ra + 3.5 * u
  const rInt = ra - 3.5 * u
  return (
    <>
      <Lienzo geo={geo}>
        <Circle cx={c} cy={c} r={ra} stroke={alfa(TONO.plata, 0.22)} strokeWidth={0.8 * u} fill="none" />
        <Circle cx={c} cy={c} r={rExt} stroke={alfa(TONO.lila, 0.18)} strokeWidth={0.8 * u} fill="none" />
        <Circle cx={c} cy={c} r={rInt} stroke={alfa(TONO.plata, 0.14)} strokeWidth={0.8 * u} fill="none" />
      </Lienzo>
      <Giro geo={geo} duracion={12000}>
        <Lienzo geo={geo}>
          <G x={c} y={c - ra} rotation={-28}>
            <Ellipse rx={7 * u} ry={1.7 * u} stroke={alfa(TONO.plata, 0.6)} strokeWidth={0.9 * u} fill="none" />
            <Circle r={4 * u} fill={TONO.naranja} />
            <Circle cx={-1.2 * u} cy={-1.2 * u} r={1.4 * u} fill={alfa(TONO.blanco, 0.35)} />
            <Path d={`M${-7 * u},0 A${7 * u},${1.7 * u} 0 0,0 ${7 * u},0`} stroke={TONO.plata} strokeWidth={0.9 * u} fill="none" />
          </G>
        </Lienzo>
      </Giro>
      <Giro geo={geo} duracion={7500} sentido={-1} desde={210}>
        <Lienzo geo={geo}>
          <Circle cx={c} cy={c - rExt} r={2.4 * u} fill={TONO.lila} />
        </Lienzo>
      </Giro>
      <Giro geo={geo} duracion={19000} desde={95}>
        <Lienzo geo={geo}>
          <Circle cx={c} cy={c - rInt} r={1.3 * u} fill={TONO.blanco} />
        </Lienzo>
      </Giro>
    </>
  )
}

/**
 * Una aurora sobre la cabeza: tres cortinas de luz —menta, agua, lila— en
 * arcos anchos por la mitad de arriba, cada una respirando a su ritmo, más
 * brillante y un poco más lejos, y de vuelta. Se mueven despacio a propósito:
 * una aurora ondula, no titila.
 */
function Aurora({ geo }: { geo: Geo }) {
  const { c, ra, u } = geo
  return (
    <>
      <Lienzo geo={geo}>
        <Circle cx={c} cy={c} r={ra} stroke={alfa(TONO.lila, 0.16)} strokeWidth={u} fill="none" />
      </Lienzo>
      <Cortina geo={geo} r={ra - 2 * u} color={TONO.menta} desde={-70} hasta={40} duracion={3800} demora={0} />
      <Cortina geo={geo} r={ra + 2.5 * u} color={TONO.agua} desde={-50} hasta={65} duracion={4600} demora={900} />
      <Cortina geo={geo} r={ra + 6.5 * u} color={TONO.lila} desde={-35} hasta={35} duracion={5400} demora={1800} />
    </>
  )
}

function Cortina({
  geo,
  r,
  color,
  desde,
  hasta,
  duracion,
  demora,
}: {
  geo: Geo
  r: number
  color: string
  desde: number
  hasta: number
  duracion: number
  demora: number
}) {
  const { c, u } = geo
  const t = useVaiven(duracion, demora)
  const estilo = useAnimatedStyle(() => ({
    opacity: 0.3 + 0.45 * t.value,
    transform: [{ scale: 0.985 + 0.03 * t.value }, { rotate: `${-4 + 8 * t.value}deg` }],
  }))
  return (
    <Animated.View style={[capa(geo.lado), estilo]}>
      <Lienzo geo={geo}>
        <Circle cx={c} cy={c} r={r} stroke={alfa(color, 0.35)} strokeWidth={7 * u} fill="none" strokeLinecap="round" {...arco(r, desde, hasta)} />
        <Circle cx={c} cy={c} r={r} stroke={color} strokeWidth={2.2 * u} fill="none" strokeLinecap="round" {...arco(r, desde, hasta)} />
      </Lienzo>
    </Animated.View>
  )
}

/* ------------------------------------------------------------------------ */
/* Naturaleza                                                                 */
/* ------------------------------------------------------------------------ */

/**
 * Nieve cayendo por la mitad de arriba y un copete de nieve asentada sobre
 * la foto. Diez copos —puntos y, los más grandes, asteriscos— que bajan
 * meciéndose y se apagan al llegar a la cabeza, cada uno a su paso.
 * Acromático: blanco y plata, que es lo que es la nieve de noche.
 */
function Nieve({ geo }: { geo: Geo }) {
  const { c, rf, ra, u } = geo
  const copos = Array.from({ length: 10 }, (_, i) => ({
    angulo: -80 + i * 17.8,
    r: ra + (i % 3) * 2.5 * u - 2 * u,
    tam: 1.1 + ((i * 5) % 4) * 0.35,
    duracion: 2800 + ((i * 211) % 1400),
    demora: (i * 397) % 2500,
  }))
  return (
    <>
      <Lienzo geo={geo}>
        <Circle cx={c} cy={c} r={ra} stroke={alfa(TONO.plata, 0.22)} strokeWidth={u} fill="none" />
        <Circle cx={c} cy={c} r={rf + 1.6 * u} stroke={alfa(TONO.blanco, 0.85)} strokeWidth={3.2 * u} fill="none" strokeLinecap="round" {...arco(rf + 1.6 * u, -42, 42)} />
        <Circle cx={c} cy={c} r={rf + 1.6 * u} stroke={alfa(TONO.plata, 0.5)} strokeWidth={1.2 * u} fill="none" strokeLinecap="round" {...arco(rf + 1.6 * u, -60, 60)} />
      </Lienzo>
      {copos.map((k) => (
        <Copo key={k.angulo} geo={geo} {...k} />
      ))}
    </>
  )
}

function Copo({
  geo,
  angulo,
  r,
  tam,
  duracion,
  demora,
}: {
  geo: Geo
  angulo: number
  r: number
  tam: number
  duracion: number
  demora: number
}) {
  const { u } = geo
  const t = useCiclo(duracion, demora)
  const estilo = useAnimatedStyle(() => ({
    opacity: Math.sin(Math.PI * t.value),
    transform: [
      { translateY: -5 * u + 13 * u * t.value },
      { translateX: 2 * u * Math.sin(t.value * Math.PI * 2) },
      { rotate: `${180 * t.value}deg` },
    ],
  }))
  const R = tam * u
  const caja = R * 3
  const m = caja / 2
  return (
    <Animated.View style={[cuadro(geo, r, angulo, caja), estilo]}>
      <Svg width={caja} height={caja}>
        {tam > 1.8 ? (
          [0, 60, 120].map((a) => (
            <Line key={a} x1={m - R} y1={m} x2={m + R} y2={m} stroke={TONO.blanco} strokeWidth={0.7 * u} strokeLinecap="round" transform={`rotate(${a} ${m} ${m})`} />
          ))
        ) : (
          <Circle cx={m} cy={m} r={R * 0.7} fill={TONO.blanco} />
        )}
      </Svg>
    </Animated.View>
  )
}

/**
 * Luciérnagas: seis luces doradas dando vueltas cortas alrededor de la foto,
 * cada una con su halo, que se encienden y se apagan cuando quieren. El
 * anillo es un verde de bosque muy tenue, para que la noche tenga pasto. Lo
 * errático sale de que cada una tiene su período y su vuelo, no de un azar.
 */
function Luciernagas({ geo }: { geo: Geo }) {
  const { c, ra, u } = geo
  const lista = [
    { angulo: 20, duracion: 3600, demora: 0 },
    { angulo: 80, duracion: 4300, demora: 1400 },
    { angulo: 135, duracion: 3900, demora: 600 },
    { angulo: 200, duracion: 4700, demora: 2100 },
    { angulo: 255, duracion: 3400, demora: 900 },
    { angulo: 315, duracion: 4100, demora: 2800 },
  ]
  return (
    <>
      <Lienzo geo={geo}>
        <Circle cx={c} cy={c} r={ra} stroke={alfa(TONO.bosque, 0.7)} strokeWidth={1.2 * u} fill="none" />
      </Lienzo>
      {lista.map((l) => (
        <Luciernaga key={l.angulo} geo={geo} r={ra} {...l} />
      ))}
    </>
  )
}

function Luciernaga({
  geo,
  angulo,
  r,
  duracion,
  demora,
}: {
  geo: Geo
  angulo: number
  r: number
  duracion: number
  demora: number
}) {
  const { u } = geo
  /* Quieta, encendida: a un sexto del ciclo la luz está en su máximo. */
  const t = useCiclo(duracion, demora, 1 / 6)
  const estilo = useAnimatedStyle(() => {
    const x = t.value
    /* Un vuelo en ocho, chico, y una luz que prende dos veces por vuelta. */
    const luz = Math.max(0, Math.sin(x * Math.PI * 2 * 1.5))
    return {
      opacity: 0.15 + 0.85 * luz * luz,
      transform: [
        { translateX: 4 * u * Math.sin(x * Math.PI * 2) },
        { translateY: 3 * u * Math.sin(x * Math.PI * 4) },
      ],
    }
  })
  const caja = 8 * u
  return (
    <Animated.View style={[cuadro(geo, r, angulo, caja), estilo]}>
      <Svg width={caja} height={caja}>
        <Circle cx={caja / 2} cy={caja / 2} r={3.2 * u} fill={alfa(TONO.oro, 0.22)} />
        <Circle cx={caja / 2} cy={caja / 2} r={1.7 * u} fill={alfa(TONO.oro, 0.6)} />
        <Circle cx={caja / 2} cy={caja / 2} r={0.9 * u} fill={TONO.blanco} />
      </Svg>
    </Animated.View>
  )
}

/** Qué se dibuja con cada nombre de esta tanda. */
export const PIEZAS_ANIMADAS: Record<MarcoAnimadoId, (props: { geo: Geo }) => ReactNode> = {
  neon: Neon,
  rayo: Rayo,
  confeti: Confeti,
  corazones: Corazones,
  burbujas: Burbujas,
  orejas: Orejas,
  planetas: Planetas,
  aurora: Aurora,
  nieve: Nieve,
  luciernagas: Luciernagas,
}
