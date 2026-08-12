import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { verJam, type VistaJam } from '../../src/services/jam'
import { unirseAJam, useJam } from '../../src/state/jam'
import { Avatar } from '../../src/ui/Avatar'
import { ICON_COLOR, IconCheck, IconUsers } from '../../src/ui/icons'

/**
 * La puerta de un Jam: acá cae el link de WhatsApp.
 *
 * `dany-sandy.vercel.app/jam/CODIGO` abre esta ruta — en la app por universal
 * link, en el navegador porque es la misma ruta de Expo Router—. Antes de
 * entrar se elige **dónde escuchar**, que es la pregunta de Spotify al abrir
 * una invitación: en tu dispositivo, sincronizado; o en el del host, usando el
 * tuyo de control remoto. La elección se puede cambiar después, desde el Jam.
 */
export default function EntrarAlJam() {
  const router = useRouter()
  const { code } = useLocalSearchParams<{ code: string }>()
  const jam = useJam()

  // Sin código no hay nada que buscar: nace resuelto, sin pasar por cargando.
  const [vista, setVista] = useState<VistaJam | null | 'cargando'>(code ? 'cargando' : null)
  const [salida, setSalida] = useState<'propia' | 'host'>('propia')
  const [entrando, setEntrando] = useState(false)

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
    if (jam && vista !== 'cargando' && vista?.id === jam.id) {
      router.replace('/jam')
    }
  }, [jam, vista, router])

  async function entrar() {
    if (!code || entrando) return
    setEntrando(true)
    const ok = await unirseAJam(code, salida)
    setEntrando(false)
    if (ok) router.replace('/jam')
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
      <View className="flex-1 items-center justify-center gap-8 px-6">
        <View className="items-center gap-3">
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Entrar al Jam"
            onPress={() => void entrar()}
            disabled={entrando}
            className="items-center rounded-full bg-primary px-5 py-3.5 active:opacity-80"
          >
            {entrando ? (
              <ActivityIndicator color="#121212" />
            ) : (
              <Text className="text-primary-foreground text-[15px] font-semibold">
                Entrar al Jam
              </Text>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/')}
            className="items-center px-5 py-2 active:opacity-60"
          >
            <Text className="text-muted-foreground text-[13px]">Ahora no</Text>
          </Pressable>
        </View>
      </View>
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
      accessibilityState={{ selected: activa }}
      onPress={onPress}
      className={`flex-row items-center gap-3 rounded-2xl px-4 py-3.5 active:opacity-80 ${
        activa ? 'bg-muted' : 'bg-card'
      }`}
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-foreground text-[14px] font-semibold">{titulo}</Text>
        <Text className="text-muted-foreground text-[12px] leading-4">{detalle}</Text>
      </View>
      {activa ? <IconCheck size={17} color={ICON_COLOR.foreground} /> : null}
    </Pressable>
  )
}
