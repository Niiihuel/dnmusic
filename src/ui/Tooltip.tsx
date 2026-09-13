import { useEffect } from 'react'
import { Platform, Text, View } from 'react-native'
import {
  cerrarTooltip,
  retenerTooltip,
  soltarTooltip,
  useTooltip,
} from '../state/tooltip'
import { CapaTooltip } from './CapaTooltip'
import { SuperficieTooltip } from './SuperficieTooltip'

/**
 * El rótulo de un botón de solo ícono, al dejarle el cursor encima.
 *
 * **Solo donde hay mouse.** `TECLADO_FISICO` mira el puntero (`pointer: fine`)
 * y no el ancho de la ventana: una ventana angosta en una compu sigue teniendo
 * mouse, y una tablet ancha no. En pantallas de tocar esto no existe, y no es
 * una limitación sino lo correcto — un tooltip al tocar llega tarde, porque el
 * toque ya ejecutó el botón. Ahí el que explica es el menú.
 */
export { useConTooltip } from './useConTooltip'

/** Aire entre el botón y el rótulo. */
const SEPARACION = 6
/** Margen mínimo contra el borde de la ventana. */
const MARGEN = 8
/** Alto aproximado, solo para decidir si entra arriba o va abajo. */
const ALTO = 28
/** Ancho máximo: si no entra, el texto era demasiado largo para un tooltip. */
const ANCHO_MAX = 260
const ANCHO_MIN = 56

/**
 * Calcula una caja compacta pegada al control.
 *
 * Antes todos los rótulos ocupaban una caja invisible de 260 px. Al acotarla
 * contra el borde derecho, un texto corto terminaba centrado lejos del icono.
 * La punta conserva además la referencia exacta cuando la caja debe correrse.
 */
export function geometriaTooltip(
  tip: { texto: string; x: number; y: number; w: number; h: number },
  width: number,
  height: number,
) {
  const arriba = tip.y - SEPARACION - ALTO >= MARGEN || tip.y > height / 2
  const ancho = Math.min(ANCHO_MAX, Math.max(ANCHO_MIN, tip.texto.length * 7 + 20))
  const centro = tip.x + tip.w / 2
  const left = Math.max(MARGEN, Math.min(centro - ancho / 2, width - ancho - MARGEN))
  const punta = Math.max(12, Math.min(centro - left - 4, ancho - 20))
  return { arriba, left, ancho, punta }
}

/** El rótulo dibujado, montado una sola vez en la raíz. */
export function Tooltip() {
  const tip = useTooltip()

  useEffect(() => {
    if (!tip || Platform.OS !== 'web' || typeof window === 'undefined') return
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrarTooltip()
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [tip])

  if (!tip) return null

  return (
    <CapaTooltip>
      <Rotulo tip={tip} />
    </CapaTooltip>
  )
}

function Rotulo({ tip }: { tip: { texto: string; x: number; y: number; w: number; h: number } }) {
  const { width, height } = useVentana()
  const { arriba, left, ancho, punta } = geometriaTooltip(tip, width, height)
  const vertical = arriba
    ? { bottom: height - tip.y + SEPARACION }
    : { top: tip.y + tip.h + SEPARACION }

  return (
    <View
      pointerEvents="auto"
      onPointerEnter={retenerTooltip}
      onPointerLeave={soltarTooltip}
      style={{
        position: 'absolute',
        ...vertical,
        left,
        width: ancho,
      }}
    >
      <SuperficieTooltip
        style={{ width: '100%', paddingHorizontal: 10, paddingVertical: 6 }}
      >
        <Text className="text-foreground text-center text-caption1" numberOfLines={1}>
          {tip.texto}
        </Text>
      </SuperficieTooltip>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: punta,
          width: 8,
          height: 8,
          backgroundColor: 'rgba(28,28,28,0.9)',
          transform: [{ rotate: '45deg' }],
          ...(arriba ? { bottom: -3 } : { top: -3 }),
        }}
      />
    </View>
  )
}

/** El tamaño de la ventana, sin arrastrar re-dibujos: solo se lee al abrir. */
function useVentana() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return { width: window.innerWidth, height: window.innerHeight }
  }
  return { width: 1024, height: 768 }
}
