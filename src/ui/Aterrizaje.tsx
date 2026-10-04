import { useEffect, useState } from 'react'
import { ActivityIndicator, Image, Text, useWindowDimensions, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { conAlfa, useColorPortada } from '../lib/colorPortada'
import { abrirEnLaApp, puedeIntentarLaApp } from '../lib/abrirEnLaApp'
import type { Compartible } from '../lib/compartir'
import { tarjetaDe, type Tarjeta } from '../services/compartidos'
import { useAccessStatus, useAuthUser } from '../state/session'
import { AccionSocial } from './Social'
import { TarjetaMusica } from './TarjetaMusica'
import { ICON_COLOR, IconMusic, IconPlay, IconUser, IconUsers } from './icons'

/* Sin acceso aprobado sólo se consultan los metadatos públicos de tarjeta_enlace. */

const TAPA_MAX = 280

export function Aterrizaje({ que, id }: { que: Compartible; id: string }) {
  const router = useRouter()
  const usuario = useAuthUser()
  const acceso = useAccessStatus()
  const { width } = useWindowDimensions()
  const lado = Math.min(TAPA_MAX, Math.max(160, width - 96))

  /* La clave evita mostrar una respuesta anterior bajo el enlace actual. */
  const [cargado, setCargado] = useState<{ clave: string; tarjeta: Tarjeta | null } | null>(null)
  const clave = `${que}/${id}`
  const fresco = cargado?.clave === clave
  const tarjeta = fresco ? cargado.tarjeta : null

  useEffect(() => {
    let vivo = true
    tarjetaDe(que, id)
      .then((t) => vivo && setCargado({ clave: `${que}/${id}`, tarjeta: t }))
      .catch(() => vivo && setCargado({ clave: `${que}/${id}`, tarjeta: null }))
    return () => {
      vivo = false
    }
  }, [que, id])

  const tinte = useColorPortada(tarjeta?.tapa ?? null)
  const [saltando, setSaltando] = useState(false)
  const redondo = que === 'perfil' || que === 'jam'

  /* El fallo pertenece a este enlace; una tapa rota no debe ocultar la siguiente. */
  const [tapaRota, setTapaRota] = useState<string | null>(null)
  const hayTapa = !!tarjeta?.tapa && tapaRota !== clave

  return (
    <SafeAreaView className="bg-background flex-1">
      {tinte ? (
        <LinearGradient
          pointerEvents="none"
          colors={[conAlfa(tinte, 0.55), conAlfa(tinte, 0.14), 'transparent']}
          locations={[0, 0.6, 1]}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 420 }}
        />
      ) : null}

      <View className="flex-1 items-center justify-center gap-6 px-8">
        {que === 'cancion' && tarjeta ? <TarjetaMusica
          datos={{ titulo: tarjeta.titulo, artista: tarjeta.subtitulo, imagen: tarjeta.tapa }}
          onAbrir={usuario && acceso?.status !== 'approved' ? undefined : () => router.push('/sign-in')}
        /> : <>
        <View
          className="overflow-hidden bg-muted"
          style={{
            width: lado,
            height: lado,
            borderRadius: redondo ? lado / 2 : 16,

            shadowColor: '#000',
            shadowOpacity: 0.45,
            shadowRadius: 32,
            shadowOffset: { width: 0, height: 12 },
          }}>
          {hayTapa && tarjeta?.tapa ? (
            <Image
              source={{ uri: tarjeta.tapa }}
              style={{ width: lado, height: lado }}
              onError={() => setTapaRota(clave)}
            />
          ) : (
            <View className="flex-1 items-center justify-center">
              {fresco ? (
                <Marca que={que} />
              ) : (
                <ActivityIndicator size="small" color={ICON_COLOR.muted} />
              )}
            </View>
          )}
        </View>

        <View className="items-center gap-1">
          <Text
            accessibilityRole="header"
            numberOfLines={2}
            className="text-foreground text-center text-title2 font-semibold">
            {tarjeta?.titulo ?? (fresco ? sinTarjeta(que) : ' ')}
          </Text>
          {tarjeta?.subtitulo ? (
            <Text numberOfLines={1} className="text-muted-foreground text-center text-subheadline">
              {tarjeta.subtitulo}
            </Text>
          ) : null}
        </View>

        </>}

        <View className="w-full items-center gap-3" style={{ maxWidth: 320 }}>
          {usuario && acceso?.status !== 'approved' ? (
            <Text className="text-muted-foreground text-center text-footnote leading-5">
              Tu solicitud de acceso todavía está esperando. Cuando la acepten vas a poder abrir
              esto.
            </Text>
          ) : (
            <>
              <AccionSocial
                expandida
                label={llamado(que)}
                icono={<IconPlay size={16} color={ICON_COLOR.onPrimary} />}
                onPress={() => router.push('/sign-in')}
              />
              {puedeIntentarLaApp() ? (
                <AccionSocial
                  expandida
                  secundaria
                  busy={saltando}
                  label="Abrir en la app"
                  onPress={() => {
                    setSaltando(true)
                    void abrirEnLaApp(que, id).finally(() => setSaltando(false))
                  }}
                />
              ) : null}
              <Text className="text-muted-foreground text-center text-footnote leading-5">
                dnmusic es de acceso por invitación: al entrar te vuelve acá.
              </Text>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  )
}

function Marca({ que }: { que: Compartible }) {
  const color = ICON_COLOR.muted
  if (que === 'perfil') return <IconUser size={44} color={color} />
  if (que === 'jam') return <IconUsers size={44} color={color} />
  return <IconMusic size={44} color={color} />
}

/* No distinguir contenido privado, inexistente o no publicado evita revelar datos sin sesión. */
function sinTarjeta(que: Compartible): string {
  if (que === 'jam') return 'Este Jam ya terminó'
  if (que === 'perfil') return 'Este perfil no es público'
  return que === 'lista' ? 'Esta lista no está disponible' : 'Esta canción no está disponible'
}

function llamado(que: Compartible): string {
  if (que === 'jam') return 'Entrar al Jam'
  if (que === 'perfil') return 'Ver el perfil'
  return que === 'lista' ? 'Escuchar la lista' : 'Escuchar en dnmusic'
}
