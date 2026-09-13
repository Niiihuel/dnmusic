import { useEffect } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import {
  descartarAviso,
  instalarActualizacion,
  useAvisoDeActualizacion,
} from '../state/actualizacion'
import { usePiso } from '../state/shell'
import { GlassAnimado, HAY_VIDRIO } from './Glass'
import { ICON_COLOR, IconClose, IconSparkles } from './icons'

const ENTRADA_MS = 260

/**
 * «Hay una versión nueva», sin interrumpir a nadie.
 *
 * Solo aparece cuando la actualización ya está **bajada y lista**: mientras se
 * busca o se baja no se dibuja nada, porque eso pasa solo y contarlo no le
 * cambia la decisión a nadie. Y aparece una vez: si la despachás, no vuelve en
 * esta sesión.
 *
 * Lo importante es que no es un pedido, es un ofrecimiento. La actualización se
 * instala igual al cerrar la app —eso ya era así, ver `desktop/src/
 * actualizador.ts`— así que ignorar esto no tiene ningún costo. Lo único que
 * agrega el botón es poder tenerla ya.
 *
 * Reemplaza a un `dialog.showMessageBox` del sistema que aparecía en el medio,
 * modal, con el marco gris del sistema operativo encima de una interfaz que se
 * separa por luminancia, y **también mientras sonaba música**.
 *
 * Fuera del escritorio no existe: el store no encuentra puente y esto devuelve
 * `null` sin montar nada.
 */
export function AvisoActualizacion() {
  const aviso = useAvisoDeActualizacion()
  const router = useRouter()
  const piso = usePiso(12)

  const p = useSharedValue(0)

  useEffect(() => {
    p.value = withTiming(aviso ? 1 : 0, {
      duration: ENTRADA_MS,
      easing: Easing.out(Easing.cubic),
    })
  }, [aviso, p])

  const animado = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * 14 }],
  }))

  if (!aviso) return null

  return (
    /*
     * El envoltorio ubica y **no se anima**: un ancestro con transform u
     * opacidad forma un backdrop root y le apaga el desenfoque al vidrio. El
     * movimiento vive un nivel más abajo, en `GlassAnimado`. Mismo cuidado que
     * en `Aviso.tsx`, donde eso ya costó una tarde.
     */
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 16, right: 16, bottom: piso, alignItems: 'center' }}
    >
      <GlassAnimado
        radius={22}
        style={[HAY_VIDRIO ? null : { backgroundColor: 'rgb(31,31,31)' }, animado]}
      >
        <View className="max-w-[480px] flex-row items-center gap-3 py-2.5 pl-4 pr-2.5">
          <IconSparkles size={17} color={ICON_COLOR.foreground} />

          {/*
            El cuerpo lleva a las novedades. Es el enganche natural: lo primero
            que uno quiere saber antes de reiniciar es qué trae, y esa pantalla
            ya lo cuenta entero.
          */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Ver qué trae la versión ${aviso.version}`}
            onPress={() => router.push('/ajustes/novedades')}
            className="min-w-0 flex-1 active:opacity-70"
          >
            <Text className="text-foreground text-footnote font-semibold" numberOfLines={1}>
              Actualización lista
            </Text>
            <Text className="text-muted-foreground text-caption1" numberOfLines={1}>
              {aviso.version} · Se instala al cerrar.
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reiniciar e instalar ahora"
            onPress={instalarActualizacion}
            className="min-h-11 justify-center rounded-full bg-primary px-3.5 active:opacity-80"
          >
            <Text className="text-primary-foreground text-footnote font-semibold">Reiniciar</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Después"
            onPress={() => descartarAviso(aviso.version)}
            className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
          >
            <IconClose size={15} color={ICON_COLOR.muted} />
          </Pressable>
        </View>
      </GlassAnimado>
    </View>
  )
}
