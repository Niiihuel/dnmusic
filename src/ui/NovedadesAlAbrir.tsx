import { Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native'
import { useRouter, useSegments } from 'expo-router'
import { marcarNovedadesVistas, useNovedadesPendientes } from '../state/novedadesVistas'
import { useAjustesCargados, usePreferencia } from '../state/ajustes'
import { useUser } from '../state/session'
import { ICON_COLOR, IconClose } from './icons'

/** Un resumen breve; el historial completo queda en Ajustes. */
export function NovedadesAlAbrir() {
  const pendientes = useNovedadesPendientes()
  const usuario = useUser()
  const segmentos = useSegments() as string[]
  const router = useRouter()
  const { height } = useWindowDimensions()
  const mostrar = usePreferencia('novedadesAlAbrir')
  const cargados = useAjustesCargados()
  const primera = pendientes?.[0]
  const visible = !!primera && !!usuario && segmentos[0] !== 'onboarding' && mostrar && cargados
  if (!visible || !primera) return null

  return (
    <Modal transparent animationType="fade" visible onRequestClose={marcarNovedadesVistas}>
      <View
        className="flex-1 items-center justify-center px-5"
        style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar las novedades"
          onPress={marcarNovedadesVistas}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        />
        <View
          aria-modal
          className="w-full overflow-hidden rounded-[24px] bg-card"
          style={{
            maxWidth: 440,
            maxHeight: height - 48,
            boxShadow: '0 12px 48px rgba(0,0,0,0.45)',
          }}
        >
          <ScrollView contentContainerClassName="gap-5 p-6" showsVerticalScrollIndicator={false}>
            <View className="flex-row items-center justify-between gap-3">
              <View className="rounded-full bg-muted px-3 py-1.5">
                <Text className="text-muted-foreground text-[11px] font-semibold">
                  dnmusic {primera.version}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cerrar las novedades"
                onPress={marcarNovedadesVistas}
                className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
              >
                <IconClose size={17} color={ICON_COLOR.muted} />
              </Pressable>
            </View>
            <View className="gap-2">
              <Text
                accessibilityRole="header"
                className="text-foreground text-[24px] font-bold leading-7"
              >
                {primera.titulo}
              </Text>
              <Text className="text-muted-foreground text-[12px]">Ya está en tu app.</Text>
            </View>
            <View className="gap-3">
              {primera.cambios.slice(0, 3).map((cambio, i) => (
                <View key={i} className="flex-row gap-3">
                  <Text className="text-muted-foreground text-[13px] leading-5">·</Text>
                  <Text className="min-w-0 flex-1 text-muted-foreground text-[13px] leading-5">
                    {cambio}
                  </Text>
                </View>
              ))}
            </View>
            <View className="gap-2">
              <Pressable
                accessibilityRole="button"
                onPress={marcarNovedadesVistas}
                className="h-12 items-center justify-center rounded-full bg-primary active:opacity-80"
              >
                <Text className="text-primary-foreground text-[13px] font-semibold">
                  Seguir escuchando
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  marcarNovedadesVistas()
                  router.push('/ajustes/novedades')
                }}
                className="min-h-11 items-center justify-center rounded-full active:bg-muted"
              >
                <Text className="text-muted-foreground text-[13px]">Ver todos los cambios</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}
