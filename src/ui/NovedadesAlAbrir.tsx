import { useEffect } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useRouter, useSegments } from 'expo-router'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { marcarNovedadesVistas, useNovedadesPendientes } from '../state/novedadesVistas'
import { useUser } from '../state/session'
import { ICON_COLOR, IconSparkles } from './icons'

const ENTRADA_MS = 220

/**
 * «Esto trajo la versión que acabás de abrir».
 *
 * Aparece **una sola vez por versión**, la primera vez que abrís la app después
 * de actualizar, y se va para siempre con un toque. Antes lo mismo estaba solo
 * en Ajustes → Novedades: una pantalla a la que se entra a propósito, o sea que
 * lo que cambiaba lo descubría cada uno tropezándose. Actualizar tiene que
 * poder contarse solo.
 *
 * Es una tarjeta modal y no un aviso al pie, que es lo que usa el resto de la
 * app para lo que no interrumpe (ver `Aviso` y `AvisoActualizacion`). La
 * diferencia es que esto **es** el momento: dura los diez segundos de después
 * de actualizar y no vuelve nunca más, así que se lee o no se lee. Una píldora
 * de tres renglones al pie no puede llevar cinco cambios adentro.
 *
 * Nada de esto se le muestra a quien todavía no entró ni a quien está en el
 * paseo de bienvenida: ahí la app se está presentando, y una lista de arreglos
 * de una versión que nunca usó no significa nada.
 */
export function NovedadesAlAbrir() {
  const pendientes = useNovedadesPendientes()
  const usuario = useUser()
  const segmentos = useSegments() as string[]
  const router = useRouter()
  const { height } = useWindowDimensions()

  /* El paseo de bienvenida se apodera de la pantalla: la tarjeta espera a que
     termine en vez de aparecerle encima. No se despacha sola — cuando salga,
     sigue estando. */
  const visible = !!pendientes && !!usuario && segmentos[0] !== 'onboarding'

  const p = useSharedValue(0)
  useEffect(() => {
    p.value = visible
      ? withTiming(1, { duration: ENTRADA_MS, easing: Easing.out(Easing.cubic) })
      : 0
  }, [visible, p])

  const velo = useAnimatedStyle(() => ({ opacity: p.value }))
  const tarjeta = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ scale: 0.96 + p.value * 0.04 }],
  }))

  if (!visible || !pendientes) return null

  const primera = pendientes[0]
  /* Una sola versión no necesita decir de cuál es cada cambio: ya lo dice el
     encabezado. Varias sí — es la diferencia entre una lista y un revoltijo. */
  const varias = pendientes.length > 1

  return (
    <View style={StyleSheet.absoluteFill} className="items-center justify-center px-6">
      {/* El velo y su toque: despachar es la única salida, y tiene que estar
          también en el gesto de siempre —tocar afuera— y no solo en el botón. */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }, velo]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cerrar las novedades"
        onPress={marcarNovedadesVistas}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View
        style={[
          {
            /* Los colores van inline: NativeWind no procesa clases en
               componentes animados (docs/DESIGN.md). `card` sobre el velo, con
               la sombra de diálogo — la de tarjeta no se ve sobre negro. */
            backgroundColor: '#181818',
            borderRadius: 20,
            maxWidth: 460,
            width: '100%',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          },
          tarjeta,
        ]}
      >
        <View className="gap-1.5 px-6 pb-4 pt-6">
          <View className="flex-row items-center gap-2">
            <IconSparkles size={16} color={ICON_COLOR.foreground} />
            <Text className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[1.2px]">
              Novedades · {primera.version}
            </Text>
          </View>
          {/* El titular de la versión es la frase que resume para qué sirvió
              actualizar. Con varias versiones atrasadas manda la más nueva. */}
          <Text className="text-foreground text-[19px] font-semibold leading-6">
            {primera.titulo}
          </Text>
        </View>

        {/*
         * La lista scrollea adentro de la tarjeta y no la estira: una versión
         * puede traer un cambio o siete, y el botón de cerrar tiene que quedar
         * a la vista siempre — si se va abajo del borde, la tarjeta es una
         * trampa. El tope es contra el alto de la ventana y no un número fijo,
         * que es lo mismo que hace el resto de las hojas.
         */}
        <ScrollView
          style={{ maxHeight: Math.max(180, height * 0.45) }}
          contentContainerClassName="gap-4 px-6 pb-2"
          showsVerticalScrollIndicator={false}
        >
          {pendientes.map((novedad) => (
            <View key={novedad.version} className="gap-2">
              {varias ? (
                <Text className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[1.2px]">
                  {novedad.version} · {novedad.fecha}
                </Text>
              ) : null}
              {varias ? (
                <Text className="text-foreground text-[14px] font-semibold">{novedad.titulo}</Text>
              ) : null}
              <View className="gap-2">
                {novedad.cambios.map((cambio) => (
                  <View key={cambio} className="flex-row gap-2.5">
                    <Text className="text-muted-foreground text-[13px] leading-5">·</Text>
                    <Text className="flex-1 text-muted-foreground text-[13px] leading-5">
                      {cambio}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>

        <View className="gap-2.5 px-6 pb-6 pt-4">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Entendido, cerrar las novedades"
            onPress={marcarNovedadesVistas}
            className="bg-primary h-12 items-center justify-center rounded-full active:opacity-80"
          >
            <Text className="text-primary-foreground text-[13px] font-semibold uppercase tracking-[1.4px]">
              Entendido
            </Text>
          </Pressable>
          {/* La puerta a lo de antes: el historial entero sigue estando en
              Ajustes, y quien quiera leer de dónde viene la app entra de acá
              sin tener que ir a buscar la pantalla. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ver todas las versiones"
            onPress={() => {
              marcarNovedadesVistas()
              router.push('/ajustes/novedades')
            }}
            className="h-10 items-center justify-center rounded-full active:bg-muted"
          >
            <Text className="text-muted-foreground text-[13px] font-semibold">
              Ver todas las versiones
            </Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  )
}
