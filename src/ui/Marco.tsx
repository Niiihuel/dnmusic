import { COLECCION_MARCOS, MarcoColeccion } from './MarcosColeccion'
import { useId, type ReactNode } from 'react'
import { View } from 'react-native'
import Animated, { useAnimatedStyle } from 'react-native-reanimated'
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, Stop } from 'react-native-svg'
import {
  alfa,
  arco,
  capa,
  Chispa,
  geometria,
  Giro,
  Lienzo,
  Movimiento,
  punto,
  Radial,
  TONO,
  useCiclo,
  useVaiven,
  type Geo,
} from './marcoBase'
import { MARCOS_ANIMADOS, PIEZAS_ANIMADAS } from './MarcosAnimados'
import { MARCOS_TEMATICOS, PIEZAS_TEMATICAS } from './MarcosTematicos'
import { MarcoImagenPorId } from './DecoracionImagen'
import { esDiscord } from '../services/discordCatalogo'
import { DiscordAvatar } from './DiscordCosmeticos'

export { aireDelMarco, DESBORDE } from './marcoBase'

/**
 * Los marcos del avatar: decoraciones dibujadas, no assets.
 *
 * La idea viene de las decoraciones de Discord y los marcos de Steam, con una
 * decisión distinta de fondo: **se dibujan acá**, con SVG y animación, en vez
 * de subir imágenes. No hay archivo que hospedar ni catálogo que se muera con
 * un CDN ajeno (la lección de decoprofile: 429 decoraciones apuntando a un
 * Drive que hoy da 404), pesan cero bytes y se ven nítidos a cualquier tamaño.
 *
 * Son piezas con personalidad —llamas, alas, una corona, un vinilo que gira—
 * y no anillos con un punto, porque eso es lo que hace que alguien elija una:
 * una decoración se lleva puesta, y para llevarla puesta tiene que decir algo.
 * Van en familias (clásicos, música, naturaleza, cielo, realeza, fiesta,
 * energía) para que la vidriera se recorra y no se escanee. Lo compartido
 * —geometría, tonos, primitivas, las tres formas de moverse— está en
 * `marcoBase.tsx`; los animados al estilo Discord, en `MarcosAnimados.tsx`.
 *
 * **Sobre el color y `docs/DESIGN.md`.** La interfaz sigue acromática; el
 * marco es contenido de la persona, como su foto o el tema de sus vitrinas, y
 * por eso puede tener color — con criterio: cada marco usa dos o tres tonos
 * de la misma escala que `lib/tema` (Tailwind v4: 200/300 para lo claro, 800
 * para lo oscuro), nunca un arcoíris. La mitad del catálogo es acromática
 * (blanco, plata, humo, un dorado apagado) para quien quiere quedarse en la
 * paleta de la app.
 *
 * **Geometría.** El marco **desborda** a la foto, no la pisa. Discord usa
 * 1,2× el lado del avatar y Steam ~1,3×; acá el lienzo es de 1,35× para que
 * alas, llamas y coronas tengan aire, y los anillos siguen viviendo en el
 * radio del 1,2× (`ra`), que es donde la vista los espera. La foto es un
 * círculo de radio `rf` en el centro y queda intacta; lo poco que la roza (la
 * raíz de un ala, la base de la corona) es lo mismo que hacen las referencias.
 *
 * **Rendimiento.** Se dibujan en el perfil grande y de a seis o más en la
 * vidriera. Todo se anima con `withRepeat`/`withTiming`/`withDelay` de
 * Reanimated en el hilo de UI —nada de `requestAnimationFrame` ni bucles por
 * cuadro, ver el incidente de CPU en `ui/MotorAudio`— y cada marco tiene a lo
 * sumo una docena de nodos animados. Lo que se puede dejar quieto, se deja
 * quieto en un solo SVG; lo que se mueve va en `Animated.View` con `style`
 * (nunca `className`, ver «Trampa: NativeWind y los componentes animados»).
 * Las animaciones se cancelan al desmontar.
 *
 * En la base el marco es solo un nombre (`profiles.marco`): qué se dibuja con
 * ese nombre vive en este archivo. Un nombre que esta versión no conozca se
 * dibuja como ninguno — un perfil editado por una app más nueva no rompe a la
 * vieja. Por eso los cinco ids originales (`aro`, `pulso`, `orbita`, `trazos`,
 * `destello`) se conservan tal cual, con el dibujo mejorado.
 */

export type FamiliaMarco =
  | 'clasicos'
  | 'musica'
  | 'naturaleza'
  | 'cielo'
  | 'realeza'
  | 'fiesta'
  | 'energia'
  | 'arcade'
  | 'gotico'

/** Las familias en el orden de la vidriera, con su rótulo. */
export const FAMILIAS_MARCO: { id: FamiliaMarco; titulo: string }[] = [
  { id: 'clasicos', titulo: 'Clásicos' },
  { id: 'musica', titulo: 'Música' },
  { id: 'naturaleza', titulo: 'Naturaleza' },
  { id: 'cielo', titulo: 'Cielo' },
  { id: 'realeza', titulo: 'Realeza' },
  { id: 'fiesta', titulo: 'Fiesta' },
  { id: 'energia', titulo: 'Energía' },
  { id: 'arcade', titulo: 'Arcade' },
  { id: 'gotico', titulo: 'Gótico' },
]

export const MARCOS = [
  ...COLECCION_MARCOS,
  ...MARCOS_ANIMADOS,
  ...MARCOS_TEMATICOS,
  { id: 'aro', nombre: 'Aro', familia: 'clasicos' },
  { id: 'pulso', nombre: 'Pulso', familia: 'clasicos' },
  { id: 'orbita', nombre: 'Órbita', familia: 'clasicos' },
  { id: 'trazos', nombre: 'Trazos', familia: 'clasicos' },
  { id: 'destello', nombre: 'Destello', familia: 'clasicos' },

  { id: 'vinilo', nombre: 'Vinilo', familia: 'musica' },
  { id: 'ecualizador', nombre: 'Ecualizador', familia: 'musica' },
  { id: 'ondas', nombre: 'Ondas', familia: 'musica' },
  { id: 'notas', nombre: 'Notas', familia: 'musica' },

  { id: 'llamas', nombre: 'Llamas', familia: 'naturaleza' },
  { id: 'petalos', nombre: 'Pétalos', familia: 'naturaleza' },
  { id: 'nubes', nombre: 'Nubes', familia: 'naturaleza' },

  { id: 'estrellas', nombre: 'Estrellas', familia: 'cielo' },
  { id: 'aureola', nombre: 'Aureola', familia: 'cielo' },
  { id: 'luna', nombre: 'Luna', familia: 'cielo' },

  { id: 'corona', nombre: 'Corona', familia: 'realeza' },
  { id: 'alas', nombre: 'Alas', familia: 'realeza' },
  { id: 'laurel', nombre: 'Laurel', familia: 'realeza' },
] as const satisfies readonly { id: string; nombre: string; familia: FamiliaMarco }[]

export type MarcoId = (typeof MARCOS)[number]['id']

/**
 * El marco alrededor de un hueco cuadrado de `size` px.
 *
 * Se dibuja **encima y por fuera** con posición absoluta: quien lo usa apila
 * `<Marco>` como hermano del avatar, y el marco se centra solo. `pointerEvents`
 * apagado — es decoración, y el círculo de la foto sigue siendo el blanco. El
 * contenedor de quien lo apila tiene que dejar `overflow: visible`, que es lo
 * que hace un `View` si nadie le dice lo contrario.
 */
export function Marco({
  marco,
  size,
  animado = true,
}: {
  marco: string | null | undefined
  size: number
  animado?: boolean
}) {
  if (!marco) return null
  if (esDiscord(marco)) return <DiscordAvatar id={marco} size={size} animado={animado} />
  if (!MARCOS.some((m) => m.id === marco)) {
    /* No es un marco dibujado: puede ser uno del catálogo en imagen
       (`services/decoraciones`). Si tampoco está ahí, nada, sin romper. */
    return <MarcoImagenPorId id={marco} size={size} animado={animado} />
  }
  const geo = geometria(size)
  const aire = (geo.lado - size) / 2
  const Pieza = PIEZAS[marco as MarcoId]
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: -aire, left: -aire, width: geo.lado, height: geo.lado, overflow: 'visible' }}
    >
      <Movimiento.Provider value={animado}>
        <Pieza geo={geo} />
      </Movimiento.Provider>
    </View>
  )
}

/* ------------------------------------------------------------------------ */
/* Clásicos                                                                   */
/* ------------------------------------------------------------------------ */

/** Dos aros finos, quietos: el marco de quien quiere marco sin espectáculo. */
function Aro({ geo }: { geo: Geo }) {
  const { c, rf, ra, u } = geo
  return (
    <Lienzo geo={geo}>
      <Circle cx={c} cy={c} r={ra} stroke={alfa(TONO.blanco, 0.85)} strokeWidth={1.5 * u} fill="none" />
      <Circle cx={c} cy={c} r={rf + 2.5 * u} stroke={alfa(TONO.blanco, 0.28)} strokeWidth={u} fill="none" />
    </Lienzo>
  )
}

/**
 * Un aro que respira. Dos ondas que nacen sobre el anillo, crecen hasta el
 * borde y se apagan, a medio período una de otra: con una sola el latido se
 * sentía a saltos; con dos siempre hay una a la vista.
 */
function Pulso({ geo }: { geo: Geo }) {
  const { c, ra, u } = geo
  return (
    <>
      <Lienzo geo={geo}>
        <Circle cx={c} cy={c} r={ra} stroke={alfa(TONO.blanco, 0.6)} strokeWidth={1.5 * u} fill="none" />
      </Lienzo>
      <OndaDePulso geo={geo} demora={0} />
      <OndaDePulso geo={geo} demora={1300} />
    </>
  )
}

function OndaDePulso({ geo, demora }: { geo: Geo; demora: number }) {
  const t = useCiclo(2600, demora)
  const tope = (geo.c - geo.u) / geo.ra
  const estilo = useAnimatedStyle(() => ({
    opacity: 0.85 * (1 - t.value) ** 1.4,
    transform: [{ scale: 1 + (tope - 1) * Math.sin((t.value * Math.PI) / 2) }],
  }))
  return (
    <Animated.View style={[capa(geo.lado), estilo]}>
      <Lienzo geo={geo}>
        <Circle cx={geo.c} cy={geo.c} r={geo.ra} stroke={TONO.blanco} strokeWidth={1.5 * geo.u} fill="none" />
      </Lienzo>
    </Animated.View>
  )
}

/**
 * Un satélite dando la vuelta, con la cola de un cometa. La cola son dos
 * arcos del mismo círculo, uno más largo y tenue que el otro, terminados
 * justo donde está el punto: el trazo de un SVG arranca a las tres y corre en
 * sentido horario, así que el desfase se calcula para que el arco muera a las
 * doce, que es donde está el satélite antes de girar.
 */
function Orbita({ geo }: { geo: Geo }) {
  const { c, ra, u } = geo
  const vuelta = 2 * Math.PI * ra
  const cola = (largo: number) => ({
    strokeDasharray: `${largo} ${vuelta - largo}`,
    strokeDashoffset: vuelta / 4 + largo,
  })
  return (
    <>
      <Lienzo geo={geo}>
        <Circle cx={c} cy={c} r={ra} stroke={alfa(TONO.blanco, 0.2)} strokeWidth={u} fill="none" />
      </Lienzo>
      <Giro geo={geo} duracion={6000}>
        <Lienzo geo={geo}>
          <Circle cx={c} cy={c} r={ra} stroke={alfa(TONO.blanco, 0.2)} strokeWidth={2 * u} fill="none" strokeLinecap="round" {...cola(vuelta * 0.22)} />
          <Circle cx={c} cy={c} r={ra} stroke={alfa(TONO.blanco, 0.45)} strokeWidth={2 * u} fill="none" strokeLinecap="round" {...cola(vuelta * 0.09)} />
          <Circle cx={c} cy={c - ra} r={5 * u} fill={alfa(TONO.blanco, 0.25)} />
          <Circle cx={c} cy={c - ra} r={3 * u} fill={TONO.blanco} />
        </Lienzo>
      </Giro>
    </>
  )
}

/**
 * Dos aros de trazos girando en sentidos opuestos, el de afuera sin apuro y
 * el de adentro más fino y más lento todavía: la aguja de un reloj y su
 * sombra. Un solo aro parecía una rueda; dos en contra parecen un mecanismo.
 */
function Trazos({ geo }: { geo: Geo }) {
  const { c, rf, ra, u } = geo
  const ri = rf + 3 * u
  const trazo = (r: number, n: number) => (2 * Math.PI * r) / n
  return (
    <>
      <Giro geo={geo} duracion={24000}>
        <Lienzo geo={geo}>
          <Circle
            cx={c}
            cy={c}
            r={ra}
            stroke={alfa(TONO.blanco, 0.8)}
            strokeWidth={2 * u}
            strokeDasharray={`${trazo(ra, 36)} ${trazo(ra, 36)}`}
            strokeLinecap="round"
            fill="none"
          />
        </Lienzo>
      </Giro>
      <Giro geo={geo} duracion={40000} sentido={-1}>
        <Lienzo geo={geo}>
          <Circle
            cx={c}
            cy={c}
            r={ri}
            stroke={alfa(TONO.blanco, 0.32)}
            strokeWidth={u}
            strokeDasharray={`${trazo(ri, 72)} ${trazo(ri, 72)}`}
            fill="none"
          />
        </Lienzo>
      </Giro>
    </>
  )
}

/**
 * Cuatro estrellas de cuatro puntas en los puntos cardinales, titilando
 * desparejo, y cuatro chispas quietas en las diagonales para que el anillo se
 * lea entero aun cuando las estrellas están apagadas.
 */
function Destello({ geo }: { geo: Geo }) {
  const { c, ra, u } = geo
  return (
    <>
      <Lienzo geo={geo}>
        <Circle cx={c} cy={c} r={ra} stroke={alfa(TONO.blanco, 0.18)} strokeWidth={u} fill="none" />
        {[45, 135, 225, 315].map((a) => {
          const p = punto(geo, ra, a)
          return <Circle key={a} cx={p.x} cy={p.y} r={1.1 * u} fill={alfa(TONO.blanco, 0.6)} />
        })}
      </Lienzo>
      {[0, 90, 180, 270].map((a, i) => (
        <Chispa key={a} geo={geo} angulo={a} r={ra} tam={5 * u} color={TONO.blanco} demora={i * 450} duracion={1000 + i * 90} />
      ))}
    </>
  )
}

/* ------------------------------------------------------------------------ */
/* Música                                                                     */
/* ------------------------------------------------------------------------ */

/**
 * Un disco de vinilo con la foto de etiqueta. La banda entre la foto y el
 * borde es el disco: negro, con surcos finos y dos reflejos opuestos —los
 * de una luz cenital sobre un disco de verdad— que son lo que hace visible
 * el giro, porque un anillo negro liso da vuelta y nadie se entera. Gira a
 * 12 rpm y no a 33: a la velocidad real mareaba.
 */
function Vinilo({ geo }: { geo: Geo }) {
  const { c, rf, u } = geo
  const borde = c - 0.5 * u
  const medio = (rf + borde) / 2
  const ancho = borde - rf
  const vuelta = 2 * Math.PI * medio
  const surcos = [2.5, 4.5, 6.5, 8.5, 10.5].map((k) => rf + k * u).filter((r) => r < borde - u)
  return (
    <Giro geo={geo} duracion={5000}>
      <Lienzo geo={geo}>
        <Circle cx={c} cy={c} r={medio} stroke={TONO.carbon} strokeWidth={ancho} fill="none" />
        {surcos.map((r) => (
          <Circle key={r} cx={c} cy={c} r={r} stroke={alfa(TONO.blanco, 0.07)} strokeWidth={0.6 * u} fill="none" />
        ))}
        <Circle
          cx={c}
          cy={c}
          r={medio}
          stroke={alfa(TONO.blanco, 0.11)}
          strokeWidth={ancho}
          fill="none"
          strokeDasharray={`${vuelta * 0.13} ${vuelta * 0.37} ${vuelta * 0.13} ${vuelta * 0.37}`}
        />
        <Circle cx={c} cy={c} r={borde} stroke={alfa(TONO.plata, 0.35)} strokeWidth={0.8 * u} fill="none" />
        <Circle cx={c} cy={c} r={rf + 0.8 * u} stroke={alfa(TONO.plata, 0.7)} strokeWidth={1.4 * u} fill="none" />
      </Lienzo>
    </Giro>
  )
}

/**
 * Once barras radiales sobre la mitad de abajo, cada una a su propio ritmo:
 * períodos distintos y desfasados para que nunca se sincronicen, que es lo
 * que las hace parecer un ecualizador y no una ola. Cada barra escala desde
 * su base (`transformOrigin`), así crece hacia afuera y no hacia los dos lados.
 */
function Ecualizador({ geo }: { geo: Geo }) {
  const { c, rf, u } = geo
  const base = rf + 2 * u
  const alto = geo.c - base - 1.5 * u
  const barras = [110, 124, 138, 152, 166, 180, 194, 208, 222, 236, 250]
  return (
    <>
      <Lienzo geo={geo}>
        <Circle
          cx={c}
          cy={c}
          r={rf + u}
          stroke={alfa(TONO.bosque, 0.9)}
          strokeWidth={1.4 * u}
          fill="none"
          strokeLinecap="round"
          {...arco(rf + u, 100, 260)}
        />
      </Lienzo>
      {barras.map((a, i) => (
        <Radial key={a} geo={geo} angulo={a} r={base} ancho={2.6 * u} alto={alto}>
          <Barra
            alto={alto}
            color={i % 2 === 0 ? TONO.menta : TONO.agua}
            duracion={520 + ((i * 137) % 460)}
            demora={(i * 91) % 400}
          />
        </Radial>
      ))}
    </>
  )
}

function Barra({ alto, color, duracion, demora }: { alto: number; color: string; duracion: number; demora: number }) {
  const t = useVaiven(duracion, demora)
  const estilo = useAnimatedStyle(() => ({ transform: [{ scaleY: 0.18 + 0.82 * t.value }] }))
  return (
    <Animated.View
      style={[
        { width: '100%', height: alto, borderRadius: alto, backgroundColor: color, transformOrigin: '50% 100%' },
        estilo,
      ]}
    />
  )
}

/**
 * Ondas de sonido saliendo de la foto: tres pares de arcos, uno a cada
 * lado, que nacen pegados al borde y se abren hasta el lienzo apagándose.
 * Un tercio de período entre una y otra: siempre hay una naciendo, una en el
 * medio y una muriendo, que es la cadencia de un parlante dibujado.
 */
function Ondas({ geo }: { geo: Geo }) {
  return (
    <>
      <Onda geo={geo} demora={0} color={TONO.cielo} />
      <Onda geo={geo} demora={750} color={TONO.blanco} />
      <Onda geo={geo} demora={1500} color={TONO.cielo} />
    </>
  )
}

function Onda({ geo, demora, color }: { geo: Geo; demora: number; color: string }) {
  const { c, rf, ra, u } = geo
  const t = useCiclo(2250, demora)
  const desde = (rf + 1.5 * u) / ra
  const hasta = (c - u) / ra
  const estilo = useAnimatedStyle(() => ({
    opacity: 0.95 * Math.sin(Math.PI * t.value),
    transform: [{ scale: desde + (hasta - desde) * t.value }],
  }))
  /* Dos arcos de 70° centrados en las tres y en las nueve. */
  const vuelta = 2 * Math.PI * ra
  const arco = vuelta * (70 / 360)
  return (
    <Animated.View style={[capa(geo.lado), estilo]}>
      <Lienzo geo={geo}>
        <Circle
          cx={c}
          cy={c}
          r={ra}
          stroke={color}
          strokeWidth={1.6 * u}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${arco} ${vuelta / 2 - arco}`}
          strokeDashoffset={arco / 2}
        />
      </Lienzo>
    </Animated.View>
  )
}

/**
 * Corcheas flotando alrededor. Cada nota sube un poco, se inclina y se
 * desvanece, y vuelve a nacer donde empezó; las cuatro van desfasadas para
 * que parezcan salir de a una. La corchea se dibuja a mano: cabeza, plica y
 * corchete — tres trazos que a 9 px se leen como nota y no como coma.
 */
function Notas({ geo }: { geo: Geo }) {
  const { c, ra, u } = geo
  return (
    <>
      <Lienzo geo={geo}>
        <Circle cx={c} cy={c} r={ra} stroke={alfa(TONO.blanco, 0.16)} strokeWidth={u} fill="none" />
      </Lienzo>
      {[
        { angulo: 40, color: TONO.blanco },
        { angulo: 140, color: TONO.rosa },
        { angulo: 220, color: TONO.blanco },
        { angulo: 320, color: TONO.rosa },
      ].map((n, i) => (
        <Nota key={n.angulo} geo={geo} angulo={n.angulo} color={n.color} demora={i * 700} />
      ))}
    </>
  )
}

function Nota({ geo, angulo, color, demora }: { geo: Geo; angulo: number; color: string; demora: number }) {
  const { ra, u } = geo
  const t = useCiclo(2800, demora)
  const estilo = useAnimatedStyle(() => ({
    opacity: Math.sin(Math.PI * t.value),
    transform: [{ translateY: 3 * u - 7 * u * t.value }, { rotate: `${-10 + 20 * t.value}deg` }],
  }))
  const p = punto(geo, ra - 1.5 * u, angulo)
  const w = 9 * u
  const h = 12 * u
  return (
    <Animated.View style={[{ position: 'absolute', left: p.x - w / 2, top: p.y - h / 2, width: w, height: h }, estilo]}>
      <Svg width={w} height={h}>
        <G x={3 * u} y={9.8 * u} rotation={-25}>
          <Ellipse rx={2.8 * u} ry={2 * u} fill={color} />
        </G>
        <Line x1={5.5 * u} y1={9.2 * u} x2={5.5 * u} y2={1.2 * u} stroke={color} strokeWidth={1.2 * u} strokeLinecap="round" />
        <Path d={`M${5.5 * u},${1.2 * u} Q${9 * u},${2.6 * u} ${8 * u},${6.2 * u}`} stroke={color} strokeWidth={1.2 * u} fill="none" strokeLinecap="round" />
      </Svg>
    </Animated.View>
  )
}

/* ------------------------------------------------------------------------ */
/* Naturaleza                                                                 */
/* ------------------------------------------------------------------------ */

/**
 * Fuego alrededor de la mitad de abajo. Dos capas: atrás, seis lenguas
 * quietas de brasa, más anchas, que dan cuerpo; adelante, siete lenguas con
 * degradado —ámbar en la punta, naranja, brasa en la base— que crecen,
 * se encogen y se ladean cada una a su ritmo. El parpadeo nace de que los
 * períodos no coinciden, no de un azar por cuadro.
 */
function Llamas({ geo }: { geo: Geo }) {
  const { c, rf, u } = geo
  const base = rf + 0.5 * u
  const alto = c - base - 0.5 * u
  const ancho = 7 * u
  const fondo = [126, 148, 169, 191, 212, 234]
  const frente = [115, 137, 158, 180, 202, 223, 245]
  return (
    <>
      <Lienzo geo={geo}>
        <Circle cx={c} cy={c} r={rf + 2 * u} stroke={alfa(TONO.brasa, 0.35)} strokeWidth={4 * u} fill="none" />
      </Lienzo>
      {fondo.map((a) => (
        <Radial key={a} geo={geo} angulo={a} r={base - u} ancho={ancho * 1.25} alto={alto * 0.85}>
          <Svg width={ancho * 1.25} height={alto * 0.85}>
            <Path d={lengua(ancho * 1.25, alto * 0.85)} fill={alfa(TONO.brasa, 0.75)} />
          </Svg>
        </Radial>
      ))}
      {frente.map((a, i) => (
        <Radial key={a} geo={geo} angulo={a} r={base} ancho={ancho} alto={alto}>
          <Lengua ancho={ancho} alto={alto} duracion={420 + ((i * 97) % 220)} demora={(i * 131) % 300} />
        </Radial>
      ))}
    </>
  )
}

/** La forma de una lengua de fuego, con la base abajo y la punta arriba. */
function lengua(w: number, h: number): string {
  return `M${w / 2},${h} C${w * 0.02},${h * 0.72} ${w * 0.12},${h * 0.4} ${w / 2},0 C${w * 0.88},${h * 0.4} ${w * 0.98},${h * 0.72} ${w / 2},${h} Z`
}

function Lengua({ ancho, alto, duracion, demora }: { ancho: number; alto: number; duracion: number; demora: number }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const t = useVaiven(duracion, demora)
  const estilo = useAnimatedStyle(() => ({
    transform: [{ scaleY: 0.78 + 0.34 * t.value }, { rotate: `${-5 + 10 * t.value}deg` }],
  }))
  return (
    <Animated.View style={[{ width: ancho, height: alto, transformOrigin: '50% 100%' }, estilo]}>
      <Svg width={ancho} height={alto}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={TONO.ambar} />
            <Stop offset="0.55" stopColor={TONO.naranja} />
            <Stop offset="1" stopColor={TONO.brasa} />
          </LinearGradient>
        </Defs>
        <Path d={lengua(ancho, alto)} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  )
}

/**
 * Una corola de doce pétalos alrededor de la foto, girando tan despacio que
 * se nota solo al rato, y respirando: los pares y los impares se abren y se
 * cierran a contratiempo, como una flor que late. Hubo una versión con
 * pétalos sueltos cayendo por los costados y no funcionó: la banda ya está
 * llena de corola y los sueltos se leían como manchas, no como caída.
 */
function Petalos({ geo }: { geo: Geo }) {
  const { c, rf, u } = geo
  return (
    <Giro geo={geo} duracion={60000}>
      <Lienzo geo={geo}>
        <Circle cx={c} cy={c} r={rf + 1.5 * u} stroke={alfa(TONO.vino, 0.5)} strokeWidth={1.2 * u} fill="none" />
      </Lienzo>
      <Corola geo={geo} desde={0} demora={0} />
      <Corola geo={geo} desde={30} demora={1400} />
    </Giro>
  )
}

/** Seis pétalos, uno cada 60°, que se abren un poco y vuelven. */
function Corola({ geo, desde, demora }: { geo: Geo; desde: number; demora: number }) {
  const { ra, u } = geo
  const t = useVaiven(2800, demora)
  const estilo = useAnimatedStyle(() => ({ transform: [{ scale: 0.97 + 0.05 * t.value }] }))
  return (
    <Animated.View style={[capa(geo.lado), estilo]}>
      <Lienzo geo={geo}>
        {Array.from({ length: 6 }, (_, i) => desde + i * 60).map((a) => {
          const p = punto(geo, ra + 0.5 * u, a)
          return (
            <G key={a} x={p.x} y={p.y} rotation={a}>
              <Ellipse rx={3.2 * u} ry={5.6 * u} fill={alfa(TONO.rosa, 0.95)} stroke={alfa(TONO.vino, 0.55)} strokeWidth={0.6 * u} />
            </G>
          )
        })}
      </Lienzo>
    </Animated.View>
  )
}

/**
 * Tres nubes apoyadas en la parte de abajo, derivando de un lado al otro
 * cada una a su paso, y una bruma tenue alrededor de la foto para que las
 * nubes tengan de dónde salir. Acromático: las nubes son blancas y la sombra
 * es plata, que es exactamente lo que son en la paleta de la app.
 */
function Nubes({ geo }: { geo: Geo }) {
  const { c, rf, ra, u } = geo
  return (
    <>
      <Lienzo geo={geo}>
        <Circle cx={c} cy={c} r={ra} stroke={alfa(TONO.plata, 0.16)} strokeWidth={7 * u} fill="none" />
        <Circle cx={c} cy={c} r={rf + 1.5 * u} stroke={alfa(TONO.blanco, 0.3)} strokeWidth={u} fill="none" />
      </Lienzo>
      <Nube geo={geo} angulo={150} escala={1} duracion={4200} demora={0} />
      <Nube geo={geo} angulo={200} escala={1.15} duracion={5200} demora={900} />
      <Nube geo={geo} angulo={315} escala={0.7} duracion={6000} demora={1800} />
    </>
  )
}

function Nube({ geo, angulo, escala, duracion, demora }: { geo: Geo; angulo: number; escala: number; duracion: number; demora: number }) {
  const { ra, u } = geo
  const t = useVaiven(duracion, demora)
  const estilo = useAnimatedStyle(() => ({ transform: [{ translateX: -2.5 * u + 5 * u * t.value }] }))
  const w = 17 * u * escala
  const h = 8.5 * u * escala
  const p = punto(geo, ra, angulo)
  const s = u * escala
  return (
    <Animated.View style={[{ position: 'absolute', left: p.x - w / 2, top: p.y - h / 2, width: w, height: h }, estilo]}>
      <Svg width={w} height={h}>
        {/* La sombra plata, un pelo más abajo, y encima las bolas blancas. */}
        <G y={0.8 * s}>
          <Circle cx={4.5 * s} cy={5.8 * s} r={2.9 * s} fill={TONO.plata} />
          <Circle cx={8.5 * s} cy={4.4 * s} r={3.9 * s} fill={TONO.plata} />
          <Circle cx={12.6 * s} cy={5.8 * s} r={2.8 * s} fill={TONO.plata} />
        </G>
        <Circle cx={4.5 * s} cy={5.5 * s} r={2.9 * s} fill={TONO.blanco} />
        <Circle cx={8.5 * s} cy={4 * s} r={3.9 * s} fill={TONO.blanco} />
        <Circle cx={12.6 * s} cy={5.5 * s} r={2.8 * s} fill={TONO.blanco} />
      </Svg>
    </Animated.View>
  )
}

/* ------------------------------------------------------------------------ */
/* Cielo                                                                     */
/* ------------------------------------------------------------------------ */

/**
 * Tres estrellas en tres órbitas, a velocidades y sentidos distintos, cada
 * una titilando por su cuenta. Dos anillos de órbita apenas visibles sostienen
 * la composición cuando las estrellas están del otro lado.
 */
function Estrellas({ geo }: { geo: Geo }) {
  const { c, ra, u } = geo
  return (
    <>
      <Lienzo geo={geo}>
        <Circle cx={c} cy={c} r={ra - 1.5 * u} stroke={alfa(TONO.blanco, 0.16)} strokeWidth={u} fill="none" />
        <Circle cx={c} cy={c} r={ra + 3.5 * u} stroke={alfa(TONO.lila, 0.18)} strokeWidth={0.8 * u} fill="none" />
      </Lienzo>
      <Giro geo={geo} duracion={9000}>
        <Chispa geo={geo} angulo={0} r={ra - 1.5 * u} tam={4.2 * u} color={TONO.blanco} demora={0} duracion={900} />
      </Giro>
      <Giro geo={geo} duracion={14000} sentido={-1} desde={140}>
        <Chispa geo={geo} angulo={0} r={ra + 3.5 * u} tam={3.2 * u} color={TONO.lila} demora={300} duracion={1300} />
      </Giro>
      <Giro geo={geo} duracion={6500} desde={230}>
        <Chispa geo={geo} angulo={0} r={ra + u} tam={2.2 * u} color={TONO.blanco} demora={600} duracion={700} />
      </Giro>
    </>
  )
}

/**
 * Una aureola dorada flotando sobre la cabeza: una elipse achatada con su
 * halo, que sube y baja despacio mientras el halo respira. Abajo, una luz
 * tenue alrededor de la foto, quieta, para que el oro no quede suelto. Es el
 * dorado apagado del ámbar 200, no un amarillo.
 */
function Aureola({ geo }: { geo: Geo }) {
  const { c, rf, u } = geo
  const ry = 4 * u
  const rx = rf * 0.52
  const cy = c - rf - 1.5 * u - ry
  const t = useVaiven(3200)
  const flota = useAnimatedStyle(() => ({ transform: [{ translateY: -1.5 * u + 3 * u * t.value }] }))
  const halo = useAnimatedStyle(() => ({ opacity: 0.25 + 0.3 * t.value }))
  return (
    <>
      <Lienzo geo={geo}>
        <Circle cx={c} cy={c} r={rf + 2 * u} stroke={alfa(TONO.oro, 0.14)} strokeWidth={4 * u} fill="none" />
      </Lienzo>
      <Animated.View style={[capa(geo.lado), flota]}>
        <Animated.View style={[capa(geo.lado), halo]}>
          <Lienzo geo={geo}>
            <Ellipse cx={c} cy={cy} rx={rx} ry={ry} stroke={TONO.oro} strokeWidth={6 * u} fill="none" />
          </Lienzo>
        </Animated.View>
        <Lienzo geo={geo}>
          <Ellipse cx={c} cy={cy + 0.8 * u} rx={rx} ry={ry} stroke={alfa(TONO.cobre, 0.7)} strokeWidth={2 * u} fill="none" />
          <Ellipse cx={c} cy={cy} rx={rx} ry={ry} stroke={TONO.oro} strokeWidth={2 * u} fill="none" />
        </Lienzo>
      </Animated.View>
    </>
  )
}

/**
 * Una luna en cuarto arriba a la derecha, hamacándose apenas, y tres
 * estrellitas titilando desparejas. El anillo es lila muy tenue: azul de
 * noche sobre el fondo de la app no se veía. La luna es blanca con la sombra
 * plata para que quede acromática.
 */
function Luna({ geo }: { geo: Geo }) {
  const { c, ra, u } = geo
  const t = useVaiven(3600)
  const estilo = useAnimatedStyle(() => ({ transform: [{ rotate: `${-7 + 14 * t.value}deg` }] }))
  const R = 7.5 * u
  const p = punto(geo, ra - u, 45)
  const caja = R * 2.6
  /* Media circunferencia de radio R por fuera y un arco apenas más abierto
     por dentro (1,08R deja un grosor de un tercio): lo que queda entre las
     dos es la luna. Con 1,35R el grosor era de más de la mitad y parecía un
     disco recortado. */
  const creciente = `M0,${-R} A${R},${R} 0 1,1 0,${R} A${R * 1.08},${R * 1.08} 0 0,0 0,${-R} Z`
  return (
    <>
      <Lienzo geo={geo}>
        <Circle cx={c} cy={c} r={ra} stroke={alfa(TONO.lila, 0.28)} strokeWidth={u} fill="none" />
      </Lienzo>
      <Chispa geo={geo} angulo={300} r={ra} tam={2.6 * u} color={TONO.lila} demora={0} duracion={1100} />
      <Chispa geo={geo} angulo={340} r={ra + 2 * u} tam={1.8 * u} color={TONO.blanco} demora={500} duracion={800} />
      <Chispa geo={geo} angulo={135} r={ra} tam={2.2 * u} color={TONO.blanco} demora={900} duracion={1400} />
      <Animated.View style={[{ position: 'absolute', left: p.x - caja / 2, top: p.y - caja / 2, width: caja, height: caja }, estilo]}>
        <Svg width={caja} height={caja}>
          <G x={caja / 2} y={caja / 2} rotation={-35}>
            <G x={0.8 * u} y={0.8 * u}>
              <Path d={creciente} fill={TONO.plata} />
            </G>
            <Path d={creciente} fill={TONO.blanco} />
          </G>
        </Svg>
      </Animated.View>
    </>
  )
}

/* ------------------------------------------------------------------------ */
/* Realeza                                                                    */
/* ------------------------------------------------------------------------ */

/**
 * Una corona apoyada en la cabeza: cinco puntas con su bolita, la base
 * siguiendo la curva de la foto, y tres rubíes en la banda que destellan de
 * a uno. La corona entera se hamaca un pelo hacia arriba y abajo — quieta
 * parecía una calcomanía. Oro con el ámbar 800 de sombra, y el rojo 300 de
 * las piedras: tres tonos y nada más.
 */
function Corona({ geo }: { geo: Geo }) {
  const { rf, u } = geo
  const t = useVaiven(2600)
  const bobina = useAnimatedStyle(() => ({ transform: [{ translateY: -0.8 * u + 1.6 * u * t.value }] }))

  const rBase = rf + 0.8 * u
  const puntas = [-30, -15, 0, 15, 30]
  const alturas = [9, 10.5, 12, 10.5, 9]
  const valles = [-22.5, -7.5, 7.5, 22.5]
  const P = (r: number, a: number) => punto(geo, r, a)
  const ini = P(rBase, -34)
  const fin = P(rBase, 34)
  let d = `M${ini.x},${ini.y}`
  puntas.forEach((a, i) => {
    const tip = P(rf + alturas[i] * u, a)
    d += ` L${tip.x},${tip.y}`
    if (i < valles.length) {
      const v = P(rf + 5 * u, valles[i])
      d += ` L${v.x},${v.y}`
    }
  })
  d += ` L${fin.x},${fin.y} A${rBase},${rBase} 0 0,0 ${ini.x},${ini.y} Z`
  const rBanda = rf + 3 * u

  return (
    <Animated.View style={[capa(geo.lado), bobina]}>
      <Lienzo geo={geo}>
        <Path d={d} fill={TONO.oro} stroke={alfa(TONO.cobre, 0.9)} strokeWidth={0.9 * u} strokeLinejoin="round" />
        {/* La banda: un arco del mismo ancho que la base, en la sombra. */}
        <Circle
          cx={geo.c}
          cy={geo.c}
          r={rBanda}
          stroke={alfa(TONO.cobre, 0.45)}
          strokeWidth={0.8 * u}
          fill="none"
          {...arco(rBanda, -30, 30)}
        />
        {puntas.map((a, i) => {
          const tip = P(rf + alturas[i] * u, a)
          return <Circle key={a} cx={tip.x} cy={tip.y} r={1.1 * u} fill={TONO.oro} stroke={alfa(TONO.cobre, 0.9)} strokeWidth={0.6 * u} />
        })}
      </Lienzo>
      {[-15, 0, 15].map((a, i) => (
        <Joya key={a} geo={geo} angulo={a} r={rBanda} tam={(a === 0 ? 1.6 : 1.2) * u} demora={i * 380} />
      ))}
    </Animated.View>
  )
}

/** Una piedra que destella: brilla y se apaga, con su punto de luz. */
function Joya({ geo, angulo, r, tam, demora }: { geo: Geo; angulo: number; r: number; tam: number; demora: number }) {
  const t = useVaiven(1500, demora)
  const estilo = useAnimatedStyle(() => ({ opacity: 0.55 + 0.45 * t.value }))
  const p = punto(geo, r, angulo)
  const caja = tam * 3
  return (
    <Animated.View style={[{ position: 'absolute', left: p.x - caja / 2, top: p.y - caja / 2, width: caja, height: caja }, estilo]}>
      <Svg width={caja} height={caja}>
        <Circle cx={caja / 2} cy={caja / 2} r={tam} fill={TONO.rubi} stroke={alfa(TONO.cobre, 0.8)} strokeWidth={0.5 * geo.u} />
        <Circle cx={caja / 2 - tam * 0.3} cy={caja / 2 - tam * 0.3} r={tam * 0.3} fill={alfa(TONO.blanco, 0.9)} />
      </Svg>
    </Animated.View>
  )
}

/**
 * Dos alas abiertas hacia arriba, batiendo despacio. Cada ala son cinco
 * plumas en abanico desde una raíz pegada al costado de la foto, plata y
 * blanco alternados; el ala entera gira unos grados alrededor de esa raíz
 * (`transformOrigin` en píxeles), que es lo que hace que bata y no que
 * tiemble. La izquierda es la derecha reflejada con `scaleX: -1`, así el
 * batido queda simétrico por construcción.
 *
 * Las plumas suben en diagonal y no salen al costado a propósito: hacia el
 * costado el lienzo da 12 unidades de aire y las alas quedaban como
 * plumeros; hacia la esquina da más de 30, y ahí caben alas de verdad.
 */
function Alas({ geo }: { geo: Geo }) {
  return (
    <>
      <Ala geo={geo} />
      <View style={[capa(geo.lado), { transform: [{ scaleX: -1 }] }]}>
        <Ala geo={geo} />
      </View>
    </>
  )
}

/**
 * El ala derecha, batiendo alrededor de su raíz.
 *
 * Dibuja en un SVG **más grande que el lienzo** (1,3×, centrado): las alas
 * son la única pieza que no entra en el 1,35× de la foto sin quedar de
 * juguete, y hay lugar de sobra — la tarjeta de la vidriera deja 32px a
 * cada lado de la foto, y la banda del perfil reserva el aire con
 * `aireDelMarco`. El contenedor deja `overflow: visible` justamente para esto.
 */
function Ala({ geo }: { geo: Geo }) {
  const { lado, c, rf, u } = geo
  const t = useVaiven(2100)
  const estilo = useAnimatedStyle(() => ({ transform: [{ rotate: `${-7 + 14 * t.value}deg` }] }))
  const L = Math.round(lado * 1.3)
  const extra = (L - lado) / 2
  const raiz = { x: c + rf + u, y: c + 1.5 * u }
  /* Ángulos desde la horizontal, negativos hacia arriba; los largos están
     medidos para que ninguna punta salga del SVG grande ni se meta en la foto. */
  const plumas: { angulo: number; largo: number; ancho: number; color: string }[] = [
    { angulo: -82, largo: 28 * u, ancho: 5 * u, color: TONO.plata },
    { angulo: -64, largo: 27 * u, ancho: 5.2 * u, color: TONO.blanco },
    { angulo: -46, largo: 24 * u, ancho: 4.8 * u, color: TONO.plata },
    { angulo: -28, largo: 19 * u, ancho: 4.4 * u, color: TONO.blanco },
    { angulo: -10, largo: 14 * u, ancho: 3.8 * u, color: TONO.plata },
  ]
  return (
    <Animated.View style={[capa(lado), { transformOrigin: `${raiz.x}px ${raiz.y}px` }, estilo]}>
      <Svg width={L} height={L} style={{ position: 'absolute', left: -extra, top: -extra }}>
        <G x={raiz.x + extra} y={raiz.y + extra}>
          {plumas.map((p) => (
            <G key={p.angulo} rotation={p.angulo}>
              <Path d={pluma(p.largo, p.ancho)} fill={p.color} stroke={alfa(TONO.humo, 0.35)} strokeWidth={0.5 * u} />
              <Line x1={p.largo * 0.2} y1={0} x2={p.largo * 0.88} y2={0} stroke={alfa(TONO.humo, 0.22)} strokeWidth={0.5 * u} />
            </G>
          ))}
        </G>
      </Svg>
    </Animated.View>
  )
}

/** Una pluma apuntando a +x: redonda en la raíz, en punta al final. */
function pluma(L: number, w: number): string {
  return `M${L * 0.12},0 C${L * 0.15},${-w * 0.75} ${L * 0.7},${-w * 0.6} ${L},0 C${L * 0.7},${w * 0.6} ${L * 0.15},${w * 0.75} ${L * 0.12},0 Z`
}

/**
 * Una corona de laurel: dos ramas doradas que suben por los costados, con
 * las hojas en pares, y un brillo que las recorre de abajo hacia arriba y
 * se apaga al llegar, como la luz pasando por un metal. Las ramas quedan
 * quietas en un solo SVG; lo único que se mueve es el brillo, uno por rama.
 */
function Laurel({ geo }: { geo: Geo }) {
  const { c, ra, u } = geo
  const vuelta = 2 * Math.PI * ra
  /* Las hojas en pares, cada 14°, de abajo (150°) hacia arriba (38°). */
  const pasos = Array.from({ length: 9 }, (_, i) => 150 - i * 14)
  const rama = (lado: 1 | -1) =>
    pasos.map((a) => {
      const p = punto(geo, ra, a * lado)
      /* La hoja apunta a lo largo de la rama, hacia arriba, abierta 40° hacia afuera. */
      const tangente = a * lado - 90 * lado
      return [
        { key: `${lado}${a}o`, x: p.x, y: p.y, rot: tangente + 40 * lado },
        { key: `${lado}${a}i`, x: p.x, y: p.y, rot: tangente - 40 * lado },
      ]
    })
  return (
    <>
      <Lienzo geo={geo}>
        <Circle
          cx={c}
          cy={c}
          r={ra}
          stroke={alfa(TONO.cobre, 0.85)}
          strokeWidth={1.1 * u}
          fill="none"
          /* El trazo arranca a las tres (90°) y corre en sentido horario: la
             rama derecha va de 34° a 150° y la izquierda de 210° a 326°. */
          strokeDasharray={`${vuelta * (116 / 360)} ${vuelta * (60 / 360)} ${vuelta * (116 / 360)} ${vuelta * (68 / 360)}`}
          strokeDashoffset={vuelta * (56 / 360)}
        />
        {([1, -1] as const).flatMap(rama).flat().map((h) => (
          <G key={h.key} x={h.x} y={h.y} rotation={h.rot}>
            <Ellipse rx={2 * u} ry={4.4 * u} fill={TONO.oro} stroke={alfa(TONO.cobre, 0.8)} strokeWidth={0.6 * u} />
          </G>
        ))}
      </Lienzo>
      <Brillo geo={geo} />
      <View style={[capa(geo.lado), { transform: [{ scaleX: -1 }] }]}>
        <Brillo geo={geo} />
      </View>
    </>
  )
}

/** Un arco de luz que sube por la rama derecha y se apaga arriba. */
function Brillo({ geo }: { geo: Geo }) {
  const { c, ra, u } = geo
  const t = useCiclo(3200)
  const estilo = useAnimatedStyle(() => ({
    opacity: 0.4 * Math.sin(Math.PI * t.value),
    transform: [{ rotate: `${150 - 112 * t.value}deg` }],
  }))
  const vuelta = 2 * Math.PI * ra
  const largo = vuelta * 0.06
  return (
    <Animated.View style={[capa(geo.lado), estilo]}>
      <Lienzo geo={geo}>
        <Circle
          cx={c}
          cy={c}
          r={ra}
          stroke={TONO.blanco}
          strokeWidth={7 * u}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${largo} ${vuelta - largo}`}
          strokeDashoffset={vuelta / 4 + largo / 2}
        />
      </Lienzo>
    </Animated.View>
  )
}

/** Qué se dibuja con cada nombre. */
const PIEZAS: Record<MarcoId, (props: { geo: Geo }) => ReactNode> = {
  ...PIEZAS_ANIMADAS,
  ...PIEZAS_TEMATICAS,
  eclipse: () => <MarcoColeccion id="eclipse" />,
  astral: () => <MarcoColeccion id="astral" />,
  zarza: () => <MarcoColeccion id="zarza" />,
  jardin: () => <MarcoColeccion id="jardin" />,
  cromo: () => <MarcoColeccion id="cromo" />,
  reliquia: () => <MarcoColeccion id="reliquia" />,

  aro: Aro,
  pulso: Pulso,
  orbita: Orbita,
  trazos: Trazos,
  destello: Destello,
  vinilo: Vinilo,
  ecualizador: Ecualizador,
  ondas: Ondas,
  notas: Notas,
  llamas: Llamas,
  petalos: Petalos,
  nubes: Nubes,
  estrellas: Estrellas,
  aureola: Aureola,
  luna: Luna,
  corona: Corona,
  alas: Alas,
  laurel: Laurel,
}
