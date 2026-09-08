import { useState, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, { useAnimatedStyle } from 'react-native-reanimated'
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg'
import { alfa, estrella, Movimiento, TONO, useCiclo } from './marcoBase'
import { esDiscord } from '../services/discordCatalogo'
import { DiscordPlaca } from './DiscordCosmeticos'

/**
 * Las placas de nombre: la decoración **detrás del nombre**, como las
 * «nameplates» de Discord. Es la tercera pieza de la tienda, con el marco
 * (alrededor de la foto) y el efecto (sobre el fondo).
 *
 * Una placa es una franja redondeada con el tinte de su colección —los dos
 * tonos de `colecciones.ts`, muy diluidos sobre la placa oscura—, un patrón
 * quieto que dice de qué colección es (píxeles, estrellas, puntos, rayas,
 * barras, luces) y un brillo que la recorre de a ratos, como la luz sobre
 * un metal. El texto va encima, tal cual: la placa no cambia la tipografía.
 *
 * Se dibuja con lo mismo que los marcos —SVG y Reanimated en el hilo de UI—
 * y tiene un solo nodo animado, el brillo, porque puede haber una por fila
 * en una lista.
 */
export const PLACAS = [
  { id: 'placa-arcade', nombre: 'Arcade', patron: 'pixeles', tonos: [TONO.menta, TONO.lila] },
  { id: 'placa-gotico', nombre: 'Gótico', patron: 'niebla', tonos: [TONO.plata, TONO.humo] },
  { id: 'placa-medianoche', nombre: 'Medianoche', patron: 'estrellas', tonos: ['#deddf5', '#333d49'] },
  { id: 'placa-tormenta', nombre: 'Tormenta', patron: 'rayas', tonos: [TONO.agua, TONO.cielo] },
  { id: 'placa-cosmos', nombre: 'Cosmos', patron: 'estrellas', tonos: [TONO.lila, TONO.cielo] },
  { id: 'placa-fiesta', nombre: 'Fiesta', patron: 'puntos', tonos: [TONO.rosa, TONO.oro] },
  { id: 'placa-bosque', nombre: 'Bosque', patron: 'luces', tonos: [TONO.menta, TONO.bosque] },
  { id: 'placa-maquinas', nombre: 'Máquinas', patron: 'barras', tonos: [TONO.plata, TONO.agua] },
  { id: 'placa-corte', nombre: 'La corte', patron: 'rayas', tonos: [TONO.oro, TONO.cobre] },
] as const satisfies readonly {
  id: string
  nombre: string
  patron: Patron
  tonos: readonly [string, string]
}[]

type Patron = 'pixeles' | 'niebla' | 'estrellas' | 'rayas' | 'puntos' | 'luces' | 'barras'

export type PlacaId = (typeof PLACAS)[number]['id']

export function placaDe(id: string | null | undefined) {
  return PLACAS.find((p) => p.id === id) ?? null
}

export function nombreDePlaca(id: string | null | undefined): string | null {
  return placaDe(id)?.nombre ?? null
}

/**
 * La placa detrás de lo que le pongas adentro. Sin `id` conocido, dibuja los
 * hijos tal cual: así se puede envolver siempre el nombre y decidir después.
 */
export function PlacaDeNombre({
  id,
  animado = true,
  radio = 14,
  compacta = false,
  children,
}: {
  id: string | null | undefined
  animado?: boolean
  radio?: number
  compacta?: boolean
  children: ReactNode
}) {
  const placa = placaDe(id)
  const [ancho, setAncho] = useState(0)
  if (esDiscord(id)) return <DiscordPlaca id={id} animado={animado} radio={radio} compacta={compacta}>{children}</DiscordPlaca>
  if (!placa) return <>{children}</>
  const [a, b] = placa.tonos
  return (
    <View
      className="overflow-hidden"
      style={{ width: 320, maxWidth: '100%', minWidth: 0, minHeight: compacta ? 24 : 72, justifyContent: 'center', borderRadius: radio, backgroundColor: 'rgba(24,24,24,0.55)' }}
      onLayout={(e) => setAncho(e.nativeEvent.layout.width)}
    >
      <LinearGradient
        colors={[alfa(a, 0.32), alfa(b, 0.16), alfa(a, 0.08)]}
        locations={[0, 0.55, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {ancho > 0 ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <PatronSvg patron={placa.patron} ancho={ancho} tono={a} />
          <Movimiento.Provider value={animado}>
            <Brillo ancho={ancho} />
          </Movimiento.Provider>
        </View>
      ) : null}
      <View style={{ paddingHorizontal: compacta ? 6 : 14, paddingVertical: compacta ? 3 : 8 }}>{children}</View>
    </View>
  )
}

/** Un reflejo que cruza la placa de izquierda a derecha y descansa. */
function Brillo({ ancho }: { ancho: number }) {
  const t = useCiclo(5200, 600)
  const estilo = useAnimatedStyle(() => {
    /* Cruza en la primera mitad del ciclo; el resto, quieto fuera del borde. */
    const f = Math.min(1, t.value * 2)
    return { transform: [{ translateX: -ancho * 0.5 + ancho * 1.6 * f }] }
  })
  return (
    <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, width: ancho * 0.45 }, estilo]}>
      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.14)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[StyleSheet.absoluteFill, { transform: [{ skewX: '-18deg' }] }]}
      />
    </Animated.View>
  )
}

/** El patrón quieto de cada colección, en el tono claro y muy apagado. */
function PatronSvg({ patron, ancho, tono }: { patron: Patron; ancho: number; tono: string }) {
  const alto = 120
  const color = alfa(tono, 0.28)
  const nodos: ReactNode[] = []
  switch (patron) {
    case 'pixeles':
      for (let i = 0; i < Math.ceil(ancho / 22); i++) {
        const x = i * 22 + ((i * 7) % 5) * 2
        nodos.push(<Rect key={i} x={x} y={8 + ((i * 13) % 4) * 10} width={5} height={5} fill={color} />)
      }
      break
    case 'puntos':
      for (let i = 0; i < Math.ceil(ancho / 16); i++) {
        for (let j = 0; j < 4; j++) {
          if ((i + j) % 2 === 0) nodos.push(<Circle key={`${i}-${j}`} cx={i * 16 + 8} cy={j * 16 + 8} r={1.6} fill={color} />)
        }
      }
      break
    case 'rayas':
      for (let i = -6; i < Math.ceil(ancho / 18) + 6; i++) {
        const x = i * 18
        nodos.push(<Line key={i} x1={x} y1={alto} x2={x + 40} y2={0} stroke={color} strokeWidth={1.2} />)
      }
      break
    case 'estrellas':
      for (let i = 0; i < Math.ceil(ancho / 34); i++) {
        const x = i * 34 + 10 + ((i * 11) % 7) * 2
        const y = 6 + ((i * 17) % 5) * 7
        const s = 2.2 + ((i * 3) % 3) * 0.8
        nodos.push(<Path key={i} d={estrella(s)} fill={color} transform={`translate(${x} ${y})`} />)
      }
      break
    case 'luces':
      for (let i = 0; i < Math.ceil(ancho / 40); i++) {
        const x = i * 40 + 14 + ((i * 9) % 6) * 3
        const y = 8 + ((i * 13) % 4) * 8
        nodos.push(<Circle key={`h${i}`} cx={x} cy={y} r={6} fill={alfa(tono, 0.1)} />)
        nodos.push(<Circle key={`n${i}`} cx={x} cy={y} r={1.8} fill={color} />)
      }
      break
    case 'barras':
      for (let i = 0; i < Math.ceil(ancho / 9); i++) {
        const h = 6 + ((i * 7) % 5) * 5
        nodos.push(<Rect key={i} x={i * 9 + 2} y={alto - h} width={4} height={h} rx={1} fill={color} />)
      }
      break
    case 'niebla':
      for (let i = 0; i < Math.ceil(ancho / 60); i++) {
        nodos.push(
          <Circle key={i} cx={i * 60 + 30} cy={alto - 4 + ((i * 5) % 3) * 6} r={26} fill={alfa(tono, 0.07)} />,
        )
      }
      break
  }
  return (
    <Svg width={ancho} height="100%" viewBox={`0 0 ${ancho} ${alto}`} preserveAspectRatio="xMidYMax slice">
      {nodos}
    </Svg>
  )
}
