import { SharedLayoutBg } from './SharedLayoutBg'
import { useCallback, useRef, useState, type ReactNode } from 'react'
import {
  Pressable,
  ScrollView,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { BotonVidrio, ES_WEB } from './Glass'
import { LinearGradient } from 'expo-linear-gradient'
import { ICON_COLOR, IconChevronLeft, IconChevronRight } from './icons'

/** Alto del degradado en cada extremo. */
const FADE = 28
/** Tolerancia para decidir que se llegó a un extremo. */
const EPS = 2

/**
 * Un booleano que solo avisa cuando **cambia**.
 *
 * Los dos scrolls de este archivo miran en qué extremo están, y lo miraban
 * llamando al setter en cada evento: con `scrollEventThrottle={16}` eso son
 * sesenta llamadas por segundo mientras el dedo se mueve, todas con el mismo
 * valor salvo en los dos instantes en que se toca un borde. React descarta el
 * re-render cuando el valor no cambió, pero el trabajo de llegar hasta ahí lo
 * hace igual, y lo hace en el medio del scroll, que es justo cuando no hay
 * tiempo de sobra.
 *
 * Con el valor espejado en un ref, el setter se llama solo en la transición.
 * En el medio de una lista larga eso es **ninguna** vez.
 */
function useBordeEstable(inicial: boolean): [boolean, (v: boolean) => void] {
  const [valor, setValor] = useState(inicial)
  const ultimo = useRef(inicial)
  const poner = useCallback((v: boolean) => {
    if (ultimo.current === v) return
    ultimo.current = v
    setValor(v)
  }, [])
  return [valor, poner]
}

type Props = {
  children: ReactNode
  /** Separación uniforme entre el contenido y los bordes del panel. */
  padding?: number
  gap?: number
}

/**
 * Área de scroll con los extremos desvanecidos.
 *
 * El contenido que entra y sale por arriba y por abajo se corta de golpe contra
 * el borde del panel; un degradado hacia el color del panel suaviza ese corte,
 * como el panel derecho de Spotify.
 *
 * Cada degradado aparece **solo cuando hay contenido para ese lado**: dejarlos
 * siempre visibles atenúa el primer y el último elemento aunque no haya nada
 * más que ver, y se lee como un error de color.
 *
 * El color está fijo en el fondo de panel (--color-background). Un degradado
 * tiene que terminar exactamente en el color de atrás, y las variables CSS no
 * se pueden leer desde una prop de LinearGradient. Si algún día se usa el tema
 * claro, esto hay que parametrizarlo.
 */
export function FadingScroll({ children, padding = 8, gap = 8 }: Props) {
  const [atTop, setAtTop] = useBordeEstable(true)
  const [atBottom, setAtBottom] = useBordeEstable(true)

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
    setAtTop(contentOffset.y <= EPS)
    setAtBottom(contentOffset.y + layoutMeasurement.height >= contentSize.height - EPS)
  }

  return (
    <View className="flex-1">
      <ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        onContentSizeChange={(_, h) => {
          // Sin contenido de sobra no hay nada que desvanecer.
          if (h <= 0) setAtBottom(true)
        }}
        contentContainerStyle={{ padding, gap }}
        showsVerticalScrollIndicator
      >
        {children}
      </ScrollView>

      {!atTop && (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(18,18,18,1)', 'rgba(18,18,18,0)']}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: FADE }}
        />
      )}

      {!atBottom && (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(18,18,18,0)', 'rgba(18,18,18,1)']}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: FADE }}
        />
      )}
    </View>
  )
}

/** Ancho del degradado a los costados de una fila. */
const SIDE_FADE = 56
/** Cuánto avanza cada toque de flecha, como fracción de lo que se ve. */
const STEP = 0.8

/**
 * Fila que se desplaza en horizontal, con los costados desvanecidos.
 *
 * Es el gemelo horizontal de `FadingScroll` y comparte su razonamiento: el
 * contenido que entra y sale por el costado se corta de golpe contra el borde
 * del panel, y un degradado hacia el color de atrás suaviza ese corte. Cada
 * lado aparece solo cuando hay algo para ese lado; si no, atenuaría la primera
 * o la última tapa sin motivo.
 *
 * Va aparte y no como una prop `horizontal` del otro porque casi nada se
 * comparte: este necesita flechas —con rueda y trackpad solos, en escritorio
 * una fila horizontal es incómoda de mover— y aquel necesita su padding y su
 * barra vertical.
 */
export function FadingRow({ children, gap = 16, padding = 24 }: Props) {
  const ref = useRef<ScrollView>(null)
  const offset = useRef(0)
  const viewport = useRef(0)
  const contentWidth = useRef(0)
  const [hovered, setHovered] = useState(false)
  const [atStart, setAtStart] = useBordeEstable(true)
  const [atEnd, setAtEnd] = useBordeEstable(true)

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
    offset.current = contentOffset.x
    viewport.current = layoutMeasurement.width
    setAtStart(contentOffset.x <= EPS)
    setAtEnd(contentOffset.x + layoutMeasurement.width >= contentSize.width - EPS)
  }

  const nudge = (direction: 1 | -1) => {
    const step = Math.max(120, viewport.current * STEP)
    ref.current?.scrollTo({ x: Math.max(0, offset.current + direction * step), animated: true })
  }

  return (
    <View
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <ScrollView
        ref={ref}
        horizontal
        onScroll={onScroll}
        scrollEventThrottle={16}
        onLayout={(e) => {
          viewport.current = e.nativeEvent.layout.width
          setAtEnd(offset.current + viewport.current >= contentWidth.current - EPS)
        }}
        onContentSizeChange={(w) => {
          contentWidth.current = w
          // Si el contenido entra entero no hay nada que desvanecer ni a dónde ir.
          if (w <= viewport.current + EPS) setAtEnd(true)
          else if (offset.current <= EPS) setAtEnd(false)
        }}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap, paddingHorizontal: padding, ...(ES_WEB ? { paddingVertical: 8 } : {}) }}
      >
        <SharedLayoutBg targets="surfaces" className="dn-shared-carousel" style={{ gap }}>{children}</SharedLayoutBg>
      </ScrollView>

      {!atStart && (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(18,18,18,1)', 'rgba(18,18,18,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: SIDE_FADE }}
        />
      )}

      {!atEnd && (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(18,18,18,0)', 'rgba(18,18,18,1)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: SIDE_FADE }}
        />
      )}

      {/* Las flechas aparecen con el cursor sobre la fila y solo del lado al
          que se puede ir, como en Apple Music. */}
      {hovered && !atStart ? <Arrow side="left" onPress={() => nudge(-1)} /> : null}
      {hovered && !atEnd ? <Arrow side="right" onPress={() => nudge(1)} /> : null}
    </View>
  )
}

function Arrow({ side, onPress }: { side: 'left' | 'right'; onPress: () => void }) {
  if (ES_WEB) return (
    <View style={{ position: 'absolute', top: '32%', [side]: 6 }}>
      <BotonVidrio label={side === 'left' ? 'Ver lo anterior' : 'Ver lo siguiente'}
        onPress={onPress} style={{ width: 36, height: 36 }}>
        {side === 'left' ? <IconChevronLeft size={16} color={ICON_COLOR.foreground} />
          : <IconChevronRight size={16} color={ICON_COLOR.foreground} />}
      </BotonVidrio>
    </View>
  )
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={side === 'left' ? 'Ver lo anterior' : 'Ver lo siguiente'}
      onPress={onPress}
      className="absolute h-9 w-9 items-center justify-center rounded-full bg-card active:opacity-70"
      style={{
        top: '32%',
        [side]: 6,
        // Sobre casi negro una sombra sutil no se ve; ver docs/DESIGN.md.
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
      }}
    >
      {side === 'left' ? (
        <IconChevronLeft size={16} color={ICON_COLOR.foreground} />
      ) : (
        <IconChevronRight size={16} color={ICON_COLOR.foreground} />
      )}
    </Pressable>
  )
}
