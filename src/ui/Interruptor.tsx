import { View } from 'react-native'
import Animated, { useAnimatedStyle, useDerivedValue, withSpring } from 'react-native-reanimated'
import { BORDE_REFERENTE, Glass, HAY_VIDRIO } from './Glass'
import type { InterruptorProps } from './Interruptor.types'

/**
 * El interruptor dibujado a mano: web, Android y cualquier iOS sin el módulo.
 *
 * En el iPhone Metro elige `Interruptor.ios.tsx`, que es el `Toggle` del
 * sistema. Acá abajo no hay uno que pedirle al sistema, así que se dibuja — con
 * la paleta acromática de docs/DESIGN.md, donde el encendido es el blanco.
 */

const RECORRIDO = 20
const RESORTE = { damping: 20, stiffness: 300, mass: 0.6, overshootClamping: true }

/**
 * Quién atiende el toque.
 *
 * `false` acá: este interruptor no escucha nada, lo enciende la fila entera que
 * lo contiene. En iOS es `true` —el `Toggle` del sistema se maneja solo— y por
 * eso la fila deja de ser un `Pressable` allá: con los dos escuchando, tocar el
 * interruptor lo prendía y lo apagaba en el mismo gesto.
 */
export const INTERRUPTOR_PROPIO = false

/**
 * La perilla se mueve con resorte y sin rebote: sobre veinte píxeles, pasarse de
 * largo para volver se ve como un error de cálculo. Es el mismo criterio que el
 * indicador de las pestañas.
 */
export function Interruptor({ activo, compacto = false, disabled = false }: InterruptorProps) {
  const recorrido = compacto ? 18 : RECORRIDO
  const p = useDerivedValue(() => withSpring(activo ? 1 : 0, RESORTE), [activo])

  const perilla = useAnimatedStyle(() => ({
    transform: [{ translateX: p.value * recorrido }],
  }))
  /* La pista encendida aparece por encima de la apagada en vez de cambiarle el
     color: animar un color de fondo obliga a interpolarlo cuadro a cuadro, y
     encima taparía el vidrio de abajo con un color plano a mitad de camino. */
  const encendida = useAnimatedStyle(() => ({ opacity: p.value }))

  const cuerpo = (
    <View className={`${compacto ? 'h-[26px] w-[44px]' : 'h-[31px] w-[51px]'} justify-center px-[3px]`}>
      {/* Todo por `style`: NativeWind no procesa `className` sobre componentes
          animados, y acá eso dejaba la pista encendida sin fondo y la perilla
          sin tamaño — el interruptor entero se veía como una píldora gris muerta,
          igual apagado que encendido. Ver la última sección de docs/DESIGN.md.
          #FFFFFF es el token `primary`. */}
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: 999, backgroundColor: '#FFFFFF' },
          encendida,
        ]}
      />
      {/* #121212 es `primary-foreground` (sobre la pista blanca), #4D4D4D es `border`. */}
      <Animated.View
        style={[
          compacto
            ? { width: 20, height: 20, borderRadius: 10, backgroundColor: activo ? '#121212' : '#4D4D4D' }
            : { width: 25, height: 25, borderRadius: 13, backgroundColor: activo ? '#121212' : '#4D4D4D' },
          perilla,
        ]}
      />
    </View>
  )

  if (!HAY_VIDRIO) {
    return <View className={`rounded-full bg-muted ${disabled ? 'opacity-45' : ''}`}>{cuerpo}</View>
  }
  return (
    /* Con el filo del referente: el interruptor es un **input**, y en la
       librería de referencia los inputs llevan el anillo y el resplandor que
       los leen como una pieza hundida — a diferencia de los botones, que van
       lisos. */
    <Glass
      radius={compacto ? 13 : 16}
      style={{ alignSelf: 'center', boxShadow: BORDE_REFERENTE, opacity: disabled ? 0.45 : 1 }}
    >
      {cuerpo}
    </Glass>
  )
}
