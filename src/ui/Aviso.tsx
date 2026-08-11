import { useEffect } from 'react'
import { Text, View } from 'react-native'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { limpiarAviso, useAviso } from '../state/aviso'
import { Glass, HAY_VIDRIO } from './Glass'
import { usePiso } from '../state/shell'

/** Cuánto se queda. Un error da más tiempo de lectura que un «Guardado». */
const DURACION_MS = 2200
const DURACION_MALO_MS = 3600
const ENTRADA_MS = 220
const SALIDA_MS = 180

/**
 * El aviso de abajo.
 *
 * Aparece sobre la cáscara —no sobre el teclado ni sobre el reproductor— y se va
 * solo. No lleva botón de cerrar: lo que dice ya pasó, y un aviso que hay que
 * despachar a mano interrumpe más de lo que informa.
 *
 * Con vidrio se apoya sobre lo que haya debajo, que es el caso para el que el
 * material existe. Sin vidrio, gris sólido como el resto.
 *
 * Sube al entrar y baja al salir en el mismo movimiento: un aviso que aparece de
 * golpe se lee como un error de dibujado.
 */
export function Aviso() {
  const { texto, turno, malo } = useAviso()
  const piso = usePiso(12)

  const p = useSharedValue(0)

  useEffect(() => {
    if (!texto) return
    /*
     * Entrar, esperar, salir — en una sola secuencia.
     *
     * Con tres animaciones encadenadas por temporizadores, un aviso nuevo que
     * llega en el medio dejaría la anterior corriendo y las dos pelearían por
     * el mismo valor. Como secuencia, arrancar de nuevo la reemplaza entera.
     */
    p.value = withSequence(
      withTiming(1, { duration: ENTRADA_MS, easing: Easing.out(Easing.cubic) }),
      withDelay(
        malo ? DURACION_MALO_MS : DURACION_MS,
        withTiming(0, { duration: SALIDA_MS, easing: Easing.in(Easing.cubic) }, (fin) => {
          /* Recién cuando terminó de irse se lo saca del store: sacarlo antes
             lo desmontaría a mitad de la animación. */
          if (fin) runOnJS(limpiarAviso)()
        }),
      ),
    )
  }, [texto, turno, malo, p])

  const animado = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * 16 }],
  }))

  if (!texto) return null

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: piso,
          alignItems: 'center',
        },
        animado,
      ]}
    >
      <Glass radius={22} style={HAY_VIDRIO ? {} : { backgroundColor: 'rgb(31,31,31)' }}>
        <View className="px-4 py-3">
          {/* Los errores no se distinguen por color —la paleta es toda gris a
              propósito, ver `docs/DESIGN.md`— sino por el peso del texto y por
              cuánto se queda en pantalla. */}
          <Text
            className={`text-center text-[14px] ${
              malo ? 'text-foreground font-semibold' : 'text-foreground'
            }`}
          >
            {texto}
          </Text>
        </View>
      </Glass>
    </Animated.View>
  )
}
