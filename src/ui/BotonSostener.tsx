import { useEffect, useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { avisar } from '../state/aviso'

/** Cuánto hay que sostener para que cuente como decisión. */
const LLENADO_MS = 1200
/** Lo que tarda en vaciarse al soltar antes de tiempo. */
const VACIADO_MS = 180

/**
 * Un botón que se completa sosteniéndolo: el relleno avanza mientras el dedo
 * está apoyado y, al llegar al final, recién ahí pasa lo irreversible.
 *
 * Reemplaza a la confirmación de dos toques para terminar un Jam. Aquella
 * pedía leer un texto que cambió («tocá de nuevo…») y acordarse de volver;
 * esta pone la confirmación **en el mismo gesto**: sostener ya es decir «sí,
 * en serio», y soltar antes es arrepentirse gratis. Es el patrón de las
 * acciones destructivas de una pasada — apagar un iPhone es el mismo gesto.
 *
 * El relleno es blanco —el acento de este sistema— y el texto se invierte a
 * medida que la marea sube: son dos capas con el mismo contenido, la de arriba
 * recortada al ancho del progreso, igual que la pista encendida del
 * interruptor de Ajustes. Animar un color de texto por porcentaje no existe;
 * recortar una copia ya pintada, sí.
 *
 * Un toque corto no hace nada más que enseñar el gesto, por el aviso: un botón
 * que termina algo para todos no puede dispararse por un roce.
 */
export function BotonSostener({
  rotulo,
  pista,
  onCompletar,
}: {
  rotulo: string
  /** Lo que dice el aviso ante un toque corto: qué hace y cómo se sostiene. */
  pista: string
  onCompletar: () => void
}) {
  const progreso = useSharedValue(0)
  const [ancho, setAncho] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const desde = useRef(0)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const empezar = () => {
    desde.current = Date.now()
    progreso.value = withTiming(1, { duration: LLENADO_MS, easing: Easing.linear })
    timer.current = setTimeout(() => {
      timer.current = null
      onCompletar()
    }, LLENADO_MS)
  }

  const soltar = () => {
    if (!timer.current) return // Llegó al final: ya está hecho.
    clearTimeout(timer.current)
    timer.current = null
    progreso.value = withTiming(0, { duration: VACIADO_MS })
    // Un toque corto es alguien que esperaba un botón común: se le explica el
    // gesto en vez de dejar un botón que «no anda».
    if (Date.now() - desde.current < 350) avisar(pista)
  }

  const marea = useAnimatedStyle(() => ({ width: progreso.value * ancho }))

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      accessibilityHint={pista}
      onPressIn={empezar}
      onPressOut={soltar}
      onLayout={(e) => setAncho(e.nativeEvent.layout.width)}
      className="h-11 items-center justify-center overflow-hidden rounded-full bg-card px-5"
    >
      {/* Sin selección: en web, sostener el botón arrancaba una selección de
          texto del navegador sobre el rótulo, y esa selección cancela el
          press — la marea llegaba a la mitad y se perdía. */}
      <Text selectable={false} className="text-foreground text-[13px] font-semibold" numberOfLines={1}>
        {rotulo}
      </Text>
      {/* La copia invertida, recortada al progreso. Todo por `style`:
          NativeWind no procesa clases sobre componentes animados.
          #FFFFFF es `primary`; #121212, `primary-foreground`. */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            overflow: 'hidden',
            borderRadius: 999,
            backgroundColor: '#FFFFFF',
          },
          marea,
        ]}
      >
        <View
          style={{ width: ancho, height: '100%' }}
          className="items-center justify-center px-5"
        >
          <Text
            selectable={false}
            style={{ color: '#121212' }}
            className="text-[13px] font-semibold"
            numberOfLines={1}
          >
            {rotulo}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  )
}
