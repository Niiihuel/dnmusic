import { useEffect, useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { avisar } from '../state/aviso'
import { TECLADO_FISICO } from '../lib/teclado'

/** Cuánto hay que sostener para que cuente como decisión. */
const LLENADO_MS = 1200
/** Lo que tarda en vaciarse al soltar antes de tiempo. */
const VACIADO_MS = 180
/** Cuánto se queda armado el botón de escritorio antes de volver solo. */
const ARMADO_MS = 4000

/**
 * Confirmar una acción de las que no se deshacen, en un solo control.
 *
 * **Con el dedo se sostiene; con el mouse se hace clic dos veces**, y no es
 * capricho: son dos gestos que quieren decir lo mismo en dos aparatos donde el
 * otro no existe.
 *
 * En el teléfono, sostener pone la confirmación adentro del mismo gesto —«sí,
 * en serio»— y soltar antes es arrepentirse gratis; es lo que hace el apagado
 * del iPhone. Con un mouse ese gesto **no está en el vocabulario**: nadie
 * mantiene apretado un botón de una pantalla grande. Acá el botón parecía roto
 * — se hacía clic en «Terminar el Jam» y no pasaba nada más que un aviso al pie
 * explicando un gesto que no se le hace a un mouse.
 *
 * Con puntero fino se arma en el primer clic —el botón se enciende en blanco y
 * pregunta— y se cumple en el segundo. Es la confirmación de dos toques que en
 * el teléfono se había descartado porque el dedo tapa el rótulo que cambia;
 * con el cursor eso no pasa: el texto nuevo queda entero a la vista y a un
 * píxel del clic siguiente. Se desarma solo a los cuatro segundos o al sacar el
 * cursor de encima, así que arrepentirse sigue siendo gratis.
 *
 * Las dos formas terminan **en el mismo cuadro**: fondo blanco —el acento de
 * este sistema— con el texto en negativo. En una es adonde llega la marea, en
 * la otra es el estado armado.
 */
export function BotonSostener(props: {
  rotulo: string
  /** Lo que dice el aviso ante un toque corto: qué hace y cómo se sostiene. */
  pista: string
  onCompletar: () => void
}) {
  return TECLADO_FISICO ? <DosClics {...props} /> : <Sostenido {...props} />
}

/**
 * La forma de escritorio: clic para armar, clic para cumplir.
 *
 * Armado se dibuja igual que el sostenido al llenarse —blanco con el texto en
 * negativo— para que las dos formas del mismo botón terminen en la misma
 * imagen. Y el rótulo dice lo que falta («¿Seguro?»), que es lo único que
 * distingue un botón armado de uno que ya hizo algo.
 */
function DosClics({
  rotulo,
  onCompletar,
}: {
  rotulo: string
  pista: string
  onCompletar: () => void
}) {
  const [armado, setArmado] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const desarmar = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setArmado(false)
  }
  useEffect(() => desarmar, [])

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={armado ? `Confirmar: ${rotulo}` : rotulo}
      accessibilityHint={armado ? undefined : 'Hay que confirmarlo con un segundo clic.'}
      onPress={() => {
        if (armado) {
          desarmar()
          onCompletar()
          return
        }
        setArmado(true)
        timer.current = setTimeout(desarmar, ARMADO_MS)
      }}
      /* Sacar el cursor de encima es cambiar de idea: el botón no puede quedar
         armado esperando un clic que ya no va a llegar ahí. */
      onPointerLeave={desarmar}
      className={`h-11 items-center justify-center overflow-hidden rounded-full px-5 ${
        armado ? 'bg-primary' : 'bg-card active:opacity-80'
      }`}
    >
      <Text
        selectable={false}
        style={armado ? { color: '#121212' } : undefined} /* primary-foreground */
        className={`text-footnote font-semibold ${armado ? '' : 'text-foreground'}`}
        numberOfLines={1}
      >
        {armado ? `¿Seguro? ${rotulo}` : rotulo}
      </Text>
    </Pressable>
  )
}

/**
 * La forma del teléfono: el relleno avanza mientras el dedo está apoyado y, al
 * llegar al final, recién ahí pasa lo irreversible.
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
function Sostenido({
  rotulo,
  pista,
  onCompletar,
}: {
  rotulo: string
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
      <Text selectable={false} className="text-foreground text-footnote font-semibold" numberOfLines={1}>
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
            className="text-footnote font-semibold"
            numberOfLines={1}
          >
            {rotulo}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  )
}
