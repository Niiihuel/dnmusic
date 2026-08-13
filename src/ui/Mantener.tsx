import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

/**
 * Sostener para confirmar, en forma de **fila de Ajustes**.
 *
 * Es el mismo gesto que `BotonSostener` —la píldora que termina un Jam— con el
 * cuerpo de `FilaAjuste`: ícono, rótulo y detalle, para que una acción
 * peligrosa no parezca de otra familia, solo más deliberada. Comparten la
 * mecánica y la razón: el doble toque que había antes confirmaba con
 * *repetición*, y repetir es justo lo que hace alguien impaciente — la
 * confirmación se regalaba sola. Sostener confirma con *intención*, se ve
 * mientras pasa, y soltar antes es arrepentirse gratis, sin diálogo que
 * cerrar. (Un `Alert.alert` tampoco serviría: `react-native-web` no lo
 * implementa y la acción moriría en silencio en el navegador.)
 *
 * La diferencia con la píldora es dónde aparece la pista ante un toque corto:
 * acá la fila ya tiene una línea de detalle, así que la explicación toma ese
 * lugar por unos segundos en vez de salir volando en un aviso.
 */

/** Cuánto hay que sostener para que cuente como decisión. */
const LLENADO_MS = 1200
/** Lo que tarda en vaciarse al soltar antes de tiempo. */
const VACIADO_MS = 180
/** Cuánto queda la pista en pantalla después de un toque corto. */
const PISTA_MS = 3000

export function FilaSostener({
  rotulo,
  detalle,
  icono,
  onCompletar,
  ultima = false,
}: {
  rotulo: string
  /** Qué implica, en una línea. Un toque corto lo reemplaza por la pista. */
  detalle?: string
  icono?: ReactNode
  onCompletar: () => void
  ultima?: boolean
}) {
  const progreso = useSharedValue(0)
  const [pista, setPista] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pistaTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      if (pistaTimer.current) clearTimeout(pistaTimer.current)
    },
    [],
  )

  const empezar = () => {
    setPista(false)
    progreso.value = withTiming(1, { duration: LLENADO_MS, easing: Easing.linear })
    /* El disparo lo decide un timer y no el final de la animación: el callback
       de reanimated corre en el hilo de UI y en web puede no llegar. Mismo
       criterio que `BotonSostener`. */
    timer.current = setTimeout(() => {
      timer.current = null
      progreso.value = withTiming(0, { duration: 350 })
      onCompletar()
    }, LLENADO_MS)
  }

  const soltar = () => {
    if (!timer.current) return // Llegó al final: ya está hecho.
    clearTimeout(timer.current)
    timer.current = null
    progreso.value = withTiming(0, { duration: VACIADO_MS })
    setPista(true)
    if (pistaTimer.current) clearTimeout(pistaTimer.current)
    pistaTimer.current = setTimeout(() => setPista(false), PISTA_MS)
  }

  /* `scaleX` con origen a la izquierda y no un ancho animado: escalar es puro
     compositor, animar `width` relayouta la fila en cada cuadro. */
  const marea = useAnimatedStyle(() => ({ transform: [{ scaleX: progreso.value }] }))

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      accessibilityHint="Mantené apretado para confirmar"
      onPressIn={empezar}
      onPressOut={soltar}
      className="flex-row items-center gap-3 px-4"
    >
      {/* El relleno va por `style`: NativeWind no procesa clases en componentes
          animados (docs/DESIGN.md). Blanco al 10% — el acento del sistema,
          apenas presente: avisa que algo se está armando sin volverse una
          superficie nueva. */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: 'rgba(255,255,255,0.10)',
            transformOrigin: 'left',
          },
          marea,
        ]}
      />

      {icono ? <View className="w-6 items-center">{icono}</View> : null}

      <View
        className={`min-w-0 flex-1 gap-0.5 py-3.5 ${ultima ? '' : 'border-b border-muted'}`}
      >
        <Text className="text-foreground text-[15px]">{rotulo}</Text>
        {pista ? (
          <Text className="text-muted-foreground text-[12px] leading-4">
            Mantené apretado para confirmar
          </Text>
        ) : detalle ? (
          <Text className="text-muted-foreground text-[12px] leading-4">{detalle}</Text>
        ) : null}
      </View>
    </Pressable>
  )
}
