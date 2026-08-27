import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import {
  cerrarSelectorDispositivos,
  mandarEscuchaA,
  traerEscuchaAca,
  useDispositivoQueSuena,
  useDispositivos,
  useEsteDispositivo,
  useSelectorDispositivos,
} from '../state/escucha'
import { PlayingBars } from './PlayingBars'
import { ICON_COLOR, IconDispositivo } from './icons'

const ENTRADA_MS = 200

/**
 * El selector de dispositivos: dónde suena y a dónde mandarlo.
 *
 * Es Spotify Connect con el modelo de la casa: la lista de los aparatos de tu
 * cuenta conectados ahora (`useDispositivos`), con el que suena marcado. Tocar
 * **este** aparato trae la música acá; tocar **otro** se la manda, y él la toma
 * solo (ver `state/escucha`). No hay un botón de «reproducir en» aparte: tocar
 * el dispositivo **es** elegirlo, como en el panel de Apple Music.
 *
 * Vive fuera de las pantallas —montado en el layout, junto a `Traspaso`— porque
 * la música suena desde cualquier lado y el selector tiene que poder abrirse
 * mire lo que mire la persona.
 */
export function SelectorDispositivos() {
  const abierto = useSelectorDispositivos()
  const dispositivos = useDispositivos()
  const esteId = useEsteDispositivo()
  const sonandoId = useDispositivoQueSuena()

  const p = useSharedValue(0)
  useEffect(() => {
    p.value = withTiming(abierto ? 1 : 0, { duration: ENTRADA_MS, easing: Easing.out(Easing.cubic) })
  }, [abierto, p])

  const velo = useAnimatedStyle(() => ({ opacity: p.value }))
  const tarjeta = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ scale: 0.96 + p.value * 0.04 }],
  }))

  if (!abierto) return null

  /* Solo lo elegís cuando hay más de un aparato: con uno solo no hay a dónde
     mandar nada, y el propio suena por defecto. */
  const elegir = (deviceId: string) => {
    if (deviceId === esteId) traerEscuchaAca()
    else mandarEscuchaA(deviceId)
    cerrarSelectorDispositivos()
  }

  return (
    <View style={StyleSheet.absoluteFill} className="items-center justify-center px-8">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }, velo]} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cerrar el selector de dispositivos"
        onPress={cerrarSelectorDispositivos}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View
        style={[
          {
            // Inline: NativeWind no procesa clases en animados (docs/DESIGN.md).
            backgroundColor: '#181818',
            borderRadius: 16,
            maxWidth: 380,
            width: '100%',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          },
          tarjeta,
        ]}
      >
        <View className="px-6 pb-2 pt-6">
          <Text className="text-foreground text-[18px] font-semibold">Escuchar en</Text>
          <Text className="text-muted-foreground text-[13px] leading-5">
            Elegí dónde suena. La música se mueve en el segundo por el que va.
          </Text>
        </View>

        <View className="gap-1 px-3 pb-4 pt-2">
          {dispositivos.length === 0 ? (
            <Text className="px-3 py-3 text-muted-foreground text-[13px]">
              No hay otros dispositivos conectados ahora.
            </Text>
          ) : (
            dispositivos.map((d) => {
              const suena = d.deviceId === sonandoId
              const esEste = d.deviceId === esteId
              return (
                <Pressable
                  key={d.deviceId}
                  accessibilityRole="button"
                  accessibilityLabel={
                    esEste ? `Traer la música a este dispositivo` : `Reproducir en ${d.nombre}`
                  }
                  onPress={() => elegir(d.deviceId)}
                  className="flex-row items-center gap-3 rounded-xl px-3 py-3 active:bg-muted"
                >
                  {/* Si suena acá, las barras dicen «esto está sonando»; si no, el
                      ícono del aparato. Mismo lenguaje que la fila de una lista. */}
                  {suena ? (
                    <View className="h-[18px] w-[18px] items-center justify-center">
                      <PlayingBars playing size={14} />
                    </View>
                  ) : (
                    <IconDispositivo size={18} color={ICON_COLOR.foreground} />
                  )}
                  <View className="min-w-0 flex-1">
                    <Text className="text-foreground text-[15px]" numberOfLines={1}>
                      {esEste ? 'Este dispositivo' : d.nombre}
                    </Text>
                    {suena ? (
                      <Text className="text-muted-foreground text-[12px]">Sonando ahora</Text>
                    ) : null}
                  </View>
                </Pressable>
              )
            })
          )}
        </View>
      </Animated.View>
    </View>
  )
}
