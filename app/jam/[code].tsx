import { ScrollArea as ScrollView } from '../../src/ui/ScrollArea'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { usePreventRemove } from 'expo-router/react-navigation'
import { SafeAreaView } from 'react-native-safe-area-context'
import { verJam, type VistaJam } from '../../src/services/jam'
import { unirseAJam, useJam } from '../../src/state/jam'
import { abrirVista } from '../../src/state/playback'
import { CabeceraSocial, AccionSocial } from '../../src/ui/Social'
import { usePiso } from '../../src/state/shell'
import { Avatar } from '../../src/ui/Avatar'
import { PANEL_PX } from '../../src/ui/NowPlayingBar'
import { ICON_COLOR, IconCheck, IconUsers } from '../../src/ui/icons'

/**
 * La puerta de un Jam: acá cae el link de WhatsApp.
 *
 * `dnmusic-app.vercel.app/jam/CODIGO` abre esta ruta — en la app por universal
 * link, en el navegador porque es la misma ruta de Expo Router—. Antes de
 * entrar se elige **dónde escuchar**, que es la pregunta de Spotify al abrir
 * una invitación: en tu dispositivo, sincronizado; o en el del host, usando el
 * tuyo de control remoto. La elección se puede cambiar después, desde el Jam.
 */
export default function EntrarAlJam() {
  const router = useRouter()
  const { code } = useLocalSearchParams<{ code: string }>()
  const jam = useJam()
  const { width } = useWindowDimensions()
  const piso = usePiso(24)

  /**
   * A dónde va quien ya está adentro.
   *
   * En una ventana grande el Jam **tiene lugar propio**: el panel de la
   * derecha, el mismo que abre el botón de la barra. Mandarlo igual a `/jam`
   * levantaba la hoja de pantalla completa —la forma del teléfono, donde no
   * hay paneles— sobre una ventana de 1900px, con la app entera escondida
   * detrás y un «Salir» perdido arriba a la derecha.
   *
   * Es la misma decisión que toma el botón de Jam de la barra, con el mismo
   * `PANEL_PX`: una sola regla de dónde vive el Jam en cada ancho.
   */
  const alJam = useCallback(() => {
    if (width >= PANEL_PX) {
      abrirVista('jam')
      router.replace('/')
    } else router.replace('/jam')
  }, [width, router])

  // Sin código no hay nada que buscar: nace resuelto, sin pasar por cargando.
  const [vista, setVista] = useState<VistaJam | null | 'cargando'>(code ? 'cargando' : null)
  const [salida, setSalida] = useState<'propia' | 'host'>('propia')
  const [entrando, setEntrando] = useState(false)
  usePreventRemove(entrando, () => {})

  useEffect(() => {
    let vivo = true
    if (!code) return
    verJam(code)
      .then((v) => vivo && setVista(v))
      .catch(() => vivo && setVista(null))
    return () => {
      vivo = false
    }
  }, [code])

  /* Ya adentro de este Jam —o de otro—: la invitación no tiene nada que
     ofrecer, y quedarse acá sería una puerta que da a donde ya estás. */
  useEffect(() => {
    if (!entrando && jam && vista !== 'cargando' && vista?.id === jam.id) {
      alJam()
    }
  }, [jam, vista, alJam, entrando])

  async function entrar() {
    if (!code || entrando) return
    setEntrando(true)
    try { await unirseAJam(code, salida) }
    finally { setEntrando(false) }
  }

  if (vista === 'cargando') {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#FFFFFF" />
      </SafeAreaView>
    )
  }

  if (!vista) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-background px-8">
        <IconUsers size={26} color={ICON_COLOR.muted} />
        <Text className="text-foreground text-[15px] font-semibold">Ese Jam ya no existe</Text>
        <Text className="text-muted-foreground text-center text-[13px] leading-5">
          O terminó, o el código no es. Pedile a quien te invitó que te mande el link de nuevo.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/')}
          className="rounded-full bg-muted px-5 py-2.5 active:opacity-80"
        >
          <Text className="text-foreground text-[13px] font-semibold">Ir a la app</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  const nombreHost = vista.hostDisplayName?.trim() || `@${vista.hostUsername}`

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <CabeceraSocial titulo="Invitación a un Jam" ocupado={entrando} onCerrar={() => router.replace('/')} />
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 24,
          padding: 24,
          paddingBottom: piso,
        }}
      >
        <View className="w-full max-w-[420px] items-center gap-3">
          <Avatar name={nombreHost} path={vista.hostAvatarPath} size={72} />
          <View className="items-center gap-1">
            <Text className="text-foreground text-center text-xl font-bold">
              {nombreHost} te invita a su Jam
            </Text>
            <Text className="text-muted-foreground text-[13px]">
              {vista.cuantos === 1
                ? 'Una persona escuchando'
                : `${vista.cuantos} personas escuchando`}
              {' · '}
              {vista.code}
            </Text>
          </View>
        </View>

        {/* La elección de Spotify, con las dos opciones a la vista y no en un
            menú: es LA decisión de esta pantalla y merece el lugar. */}
        <View className="w-full max-w-[420px] gap-2">
          <Opcion
            titulo="Escuchar en este dispositivo"
            detalle="La música suena acá, sincronizada con todos."
            activa={salida === 'propia'}
            onPress={() => setSalida('propia')}
          />
          <Opcion
            titulo={`Escuchar donde ${nombreHost}`}
            detalle="La música suena allá; desde acá agregás canciones y controlás."
            activa={salida === 'host'}
            onPress={() => setSalida('host')}
          />
        </View>

        <View className="w-full max-w-[420px] gap-3">
          <AccionSocial label="Unirme al Jam" onPress={() => void entrar()} busy={entrando} />
          <AccionSocial label="Ahora no" secundaria onPress={() => router.replace('/')} disabled={entrando} />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

/** Una de las dos formas de escuchar. Radio hecho fila, marcado por luminancia. */
function Opcion({
  titulo,
  detalle,
  activa,
  onPress,
}: {
  titulo: string
  detalle: string
  activa: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: activa }}
      onPress={onPress}
      className={`flex-row items-center gap-3 rounded-2xl px-4 py-3.5 active:opacity-80 ${
        activa ? 'bg-muted' : 'bg-card'
      }`}
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-foreground text-[15px] font-semibold">{titulo}</Text>
        <Text className="text-muted-foreground text-[13px] leading-5">{detalle}</Text>
      </View>
      {activa ? <IconCheck size={17} color={ICON_COLOR.foreground} /> : null}
    </Pressable>
  )
}
