import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import {
  cancelarTraspaso,
  confirmarTraspaso,
  useTraspasoPendiente,
} from '../state/escucha'

const ENTRADA_MS = 180

/**
 * El modal del traspaso: la música está sonando en otro dispositivo de la
 * cuenta y alguien tocó el transporte acá.
 *
 * Es una pregunta de verdad —dos futuros posibles, ninguno reversible con
 * gracia— así que es un diálogo y no un aviso: interrumpe a propósito. Las dos
 * salidas están escritas como lo que hacen («Reproducir acá» / «Seguir allá»),
 * no como Aceptar/Cancelar; tocar el fondo es la salida conservadora, la que
 * no cambia nada.
 *
 * Vive montado en el layout como `Aviso`: la pregunta puede saltar desde
 * cualquier pantalla — la barra, la cola, una lista, la pantalla de Sonando.
 */
export function Traspaso() {
  const pendiente = useTraspasoPendiente()

  const p = useSharedValue(0)
  useEffect(() => {
    p.value = pendiente
      ? withTiming(1, { duration: ENTRADA_MS, easing: Easing.out(Easing.cubic) })
      : 0
  }, [pendiente, p])

  const velo = useAnimatedStyle(() => ({ opacity: p.value }))
  const tarjeta = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ scale: 0.96 + p.value * 0.04 }],
  }))

  if (!pendiente) return null

  return (
    <View style={StyleSheet.absoluteFill} className="items-center justify-center px-8">
      {/* El velo oscurece y su toque es «Seguir allá»: la salida que no toca
          nada, al alcance de cualquier gesto de escape. */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }, velo]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cerrar sin traer la música"
        onPress={cancelarTraspaso}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View
        style={[
          {
            // Los colores van inline: NativeWind no procesa clases en
            // componentes animados (docs/DESIGN.md). `card` sobre el velo,
            // con la sombra de diálogo — sutil sobre negro no se ve.
            backgroundColor: '#181818',
            borderRadius: 16,
            maxWidth: 400,
            width: '100%',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          },
          tarjeta,
        ]}
      >
        <View className="gap-2 px-6 pb-4 pt-6">
          <Text className="text-foreground text-[18px] font-semibold">
            Estás escuchando en «{pendiente.nombre}»
          </Text>
          <Text className="text-muted-foreground text-[14px] leading-5">
            La música está sonando en otro dispositivo. Podés traerla acá, en el
            segundo por el que va, o dejarla donde está.
          </Text>
        </View>
        <View className="gap-2.5 px-6 pb-6 pt-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reproducir en este dispositivo"
            onPress={confirmarTraspaso}
            className="bg-primary h-12 items-center justify-center rounded-full active:opacity-80"
          >
            <Text className="text-primary-foreground text-[13px] font-semibold uppercase tracking-[1.4px]">
              Reproducir acá
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Seguir en el otro dispositivo"
            onPress={cancelarTraspaso}
            className="bg-muted h-12 items-center justify-center rounded-full active:opacity-70"
          >
            <Text className="text-foreground text-[13px] font-semibold uppercase tracking-[1.4px]">
              Seguir allá
            </Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  )
}
