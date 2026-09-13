import { useEffect, useRef, useState } from 'react'
import { Pressable, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { TextoPerfil as Text } from './FuentePerfil'
import { Glass } from './Glass'
import type { PestanaPerfil } from './PestanasPerfil'

const PESTANAS: { id: PestanaPerfil; rotulo: string }[] = [
  { id: 'reciente', rotulo: 'Reciente' },
  { id: 'space', rotulo: 'Space' },
]

/** El mismo resorte que la cápsula de la barra de pestañas (`ui/TabBar`). */
const RESORTE = { damping: 22, stiffness: 260, mass: 0.7, overshootClamping: true }

/** Alto de la píldora: el de «Editar perfil», que va en la misma fila. */
const ALTO = 44
const AIRE = 4

/**
 * El segmento de dos posiciones.
 *
 * Habla el idioma de las pestañas de la app: una píldora de vidrio —va sobre
 * el fondo del perfil, que es justo donde el material tiene algo que
 * difuminar— con la elegida marcada por una cápsula que **se desliza** de una
 * a otra, como la de `TabPildora`. La cápsula es blanca y no un gris más claro
 * porque acá es el estado activo de la pantalla, que es a lo que
 * `docs/DESIGN.md` le reserva el acento; y se mide en vez de repartirse en
 * mitades porque «Reciente» y «Space» no miden lo mismo.
 *
 * `activa` en `null` es «todavía no se decidió»: la píldora se dibuja igual,
 * sin cápsula, para que la fila no cambie de alto cuando llega la cuenta.
 */
export function SelectorPestanasPerfil({
  activa,
  onCambiar,
}: {
  activa: PestanaPerfil | null
  onCambiar: (pestana: PestanaPerfil) => void
}) {
  const [sitios, setSitios] = useState<Partial<Record<PestanaPerfil, { x: number; w: number }>>>({})
  const x = useSharedValue(0)
  const w = useSharedValue(0)
  const opacidad = useSharedValue(0)
  /** El primer dibujado no se anima: la cápsula nace donde tiene que estar. */
  const colocada = useRef(false)

  useEffect(() => {
    const sitio = activa ? sitios[activa] : undefined
    if (!sitio) return
    if (colocada.current) {
      x.value = withSpring(sitio.x, RESORTE)
      w.value = withSpring(sitio.w, RESORTE)
    } else {
      x.value = sitio.x
      w.value = sitio.w
      opacidad.value = 1
      colocada.current = true
    }
  }, [activa, sitios, x, w, opacidad])

  /* Por `style` y nunca por `className`: NativeWind no procesa clases en los
     componentes animados y la cápsula se dibujaría sin fondo (`docs/DESIGN.md`). */
  const capsula = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
    width: w.value,
    opacity: opacidad.value,
  }))

  return (
    <Glass radius={ALTO / 2} style={{ height: ALTO, padding: AIRE }}>
      <View className="flex-row" accessibilityRole="tablist">
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              borderRadius: (ALTO - AIRE * 2) / 2,
              backgroundColor: '#FFFFFF', // `primary`: el acento, para el estado activo
            },
            capsula,
          ]}
        />
        {PESTANAS.map((p) => {
          const on = activa === p.id
          return (
            <Pressable
              key={p.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={p.rotulo}
              onPress={() => onCambiar(p.id)}
              onLayout={(e) => {
                // React Native libera el evento al terminar el callback; el
                // actualizador de estado puede ejecutarse después.
                const { x: sx, width: sw } = e.nativeEvent.layout
                setSitios((s) => {
                  return s[p.id]?.x === sx && s[p.id]?.w === sw ? s : { ...s, [p.id]: { x: sx, w: sw } }
                })
              }}
              className="items-center justify-center rounded-full px-5 active:opacity-70"
              style={{ height: ALTO - AIRE * 2 }}
            >
              <Text
                className={`text-footnote font-semibold ${
                  on ? 'text-primary-foreground' : 'text-muted-foreground'
                }`}
              >
                {p.rotulo}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </Glass>
  )
}

