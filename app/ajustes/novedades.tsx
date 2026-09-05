import { useState } from 'react'
import { Image, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Panel } from '../../src/ui/Panel'
import { Actualizador } from '../../src/ui/Actualizador'
import { ICON_COLOR, IconBack, IconChevronRight } from '../../src/ui/icons'
import { NOVEDADES, type Novedad } from '../../src/lib/novedades'
import { usePiso } from '../../src/state/shell'
import { volver } from '../../src/lib/volver'

const LOGO = require('../../assets/icon.png')

function Version({ novedad, ultima }: { novedad: Novedad; ultima: boolean }) {
  const [abierta, setAbierta] = useState(ultima)
  return (
    <View className="overflow-hidden rounded-2xl bg-card">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Versión ${novedad.version}: ${novedad.titulo}`}
        aria-expanded={abierta}
        onPress={() => setAbierta((v) => !v)}
        className="flex-row items-center gap-3 p-5 active:bg-muted"
      >
        <View className="min-w-0 flex-1 gap-2">
          <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
            <Text className="text-foreground text-[12px] font-semibold">{novedad.version}</Text>
            <Text className="text-muted-foreground text-[11px]">{novedad.fecha}</Text>
            {ultima ? (
              <Text className="text-muted-foreground text-[10px] uppercase tracking-[1px]">
                Esta versión
              </Text>
            ) : null}
          </View>
          <Text className="text-foreground text-[15px] font-semibold leading-5">
            {novedad.titulo}
          </Text>
        </View>
        <View style={{ transform: [{ rotate: abierta ? '90deg' : '0deg' }] }}>
          <IconChevronRight size={17} color={ICON_COLOR.muted} />
        </View>
      </Pressable>
      {abierta ? (
        <View className="gap-3 px-5 pb-5">
          {novedad.cambios.map((cambio, i) => (
            <View key={i} className="flex-row gap-3">
              <Text className="text-muted-foreground text-[13px] leading-5">·</Text>
              <Text className="min-w-0 flex-1 text-muted-foreground text-[13px] leading-5">
                {cambio}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

export default function Novedades() {
  const router = useRouter()
  const suelto = useWindowDimensions().width < 780
  const piso = usePiso(24)
  return (
    <SafeAreaView className="flex-1 bg-background" edges={suelto ? ['top'] : ['top', 'bottom']}>
      <View className={`min-h-0 flex-1 ${suelto ? '' : 'gap-2 p-2'}`}>
        <View className="flex-row items-center gap-3 px-3 py-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver"
            onPress={() => volver(router, '/ajustes')}
            className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
          >
            <IconBack size={19} color={ICON_COLOR.foreground} />
          </Pressable>
          <Text className="text-foreground text-[15px] font-semibold">Actualizaciones</Text>
        </View>
        <Panel className="flex-1">
          <ScrollView
            contentContainerClassName={`items-center ${suelto ? 'px-4 pt-3' : 'p-6'}`}
            contentContainerStyle={{ paddingBottom: piso }}
          >
            <View className="w-full gap-6" style={{ maxWidth: 720 }}>
              <View className="flex-row items-center gap-4 py-2">
                <Image
                  source={LOGO}
                  style={{ width: 48, height: 48, borderRadius: 12 }}
                  resizeMode="contain"
                />
                <View className="min-w-0 flex-1 gap-1">
                  <Text className="text-foreground text-[24px] font-bold">
                    Siempre un poco mejor.
                  </Text>
                  <Text className="text-muted-foreground text-[13px]">
                    Lo nuevo en dnmusic · {NOVEDADES[0]?.version}
                  </Text>
                </View>
              </View>
              <Actualizador />
              <View className="gap-3">
                <Text className="px-1 text-muted-foreground text-[11px] font-semibold uppercase tracking-[1.2px]">
                  Historial de versiones
                </Text>
                {NOVEDADES.map((n, i) => (
                  <Version key={n.version} novedad={n} ultima={i === 0} />
                ))}
              </View>
            </View>
          </ScrollView>
        </Panel>
      </View>
    </SafeAreaView>
  )
}
