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
import { ICON_COLOR, IconMusic, IconPlay, IconUser, IconUsers } from './icons'

/**
 * Lo que ve alguien que abre un link nuestro **sin estar adentro**.
 *
 * Es la única pantalla de la app que se dibuja sin sesión, y por eso es la
 * única que no puede leer nada: todo lo que muestra sale de `tarjeta_enlace`,
 * el RPC con excepción en la reja de acceso que devuelve cinco campos de
 * presentación y nada más (ver `services/compartidos`).
 *
 * La forma es la de un embed de Spotify y no la de una pantalla de la app, a
 * propósito: quien llega acá no viene navegando, viene de un mensaje de
 * WhatsApp, y lo primero que tiene que resolver no es dónde está parado sino
 * **si esto le interesa** — la tapa, el título, quién lo hizo—. Recién después
 * viene la puerta.
 *
 * Y la puerta es una sola. Hay tres estados y cada uno tiene **una** acción
 * principal, que es lo que pide `docs/DESIGN.md`:
 *
 * | Quién llega | Qué se le ofrece |
 * | --- | --- |
 * | Sin sesión | Entrar o crear la cuenta, y volver acá al terminar |
 * | Con cuenta pendiente | Nada que tocar: le falta que la aprueben |
 * | Con cuenta aprobada | No llega acá: la ruta ya le muestra la cosa entera |
 *
 * «Abrir en la app» va aparte y solo en el navegador: no es la acción del paso,
 * es un atajo para quien ya la tiene instalada. Ver `lib/abrirEnLaApp` para por
 * qué es un intento y no una certeza.
 */

/** El lado de la tapa. Grande: es el 80% de lo que esta pantalla comunica. */
const TAPA_MAX = 280

export function Aterrizaje({ que, id }: { que: Compartible; id: string }) {
  const router = useRouter()
  const usuario = useAuthUser()
  const acceso = useAccessStatus()
  const { width } = useWindowDimensions()
  const lado = Math.min(TAPA_MAX, Math.max(160, width - 96))

  /* Lo cargado se guarda junto a lo que se pidió, como en el resto de la app:
     «todavía no llegó» es «lo que tengo no es de esto», y una respuesta que
     llega tarde nunca se muestra bajo el título equivocado. */
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

  /*
   * La tapa que no carga.
   *
   * Pasa de verdad y justo acá: las carátulas del CDN de Google contestan 429
   * cada tanto —es lo que motivó copiarlas a Storage, ver la migración del
   * caché de carátulas— y una tarjeta compartida hace meses puede apuntar a una
   * que ya no está. Sin esto quedaba un cuadrado gris grande y mudo, que es
   * peor que el dibujo de que esto es una canción. Se olvida al cambiar de
   * cosa, o una tapa rota dejaría rota la siguiente.
   */
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
        <View
          className="overflow-hidden bg-muted"
          style={{
            width: lado,
            height: lado,
            borderRadius: redondo ? lado / 2 : 16,
            /* La sombra es lo único que despega la tapa del degradado. Un borde
               haría lo mismo y está prohibido: se separa por luminancia. */
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
            className="text-foreground text-center text-[22px] font-semibold leading-7">
            {tarjeta?.titulo ?? (fresco ? sinTarjeta(que) : ' ')}
          </Text>
          {tarjeta?.subtitulo ? (
            <Text numberOfLines={1} className="text-muted-foreground text-center text-[15px]">
              {tarjeta.subtitulo}
            </Text>
          ) : null}
        </View>

        <View className="w-full items-center gap-3" style={{ maxWidth: 320 }}>
          {usuario && acceso?.status !== 'approved' ? (
            <Text className="text-muted-foreground text-center text-[13px] leading-5">
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
              <Text className="text-muted-foreground text-center text-[13px] leading-5">
                dnmusic es de acceso por invitación: al entrar te vuelve acá.
              </Text>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  )
}

/** El dibujo del hueco cuando no hay tapa: dice de qué clase es lo que falta. */
function Marca({ que }: { que: Compartible }) {
  const color = ICON_COLOR.muted
  if (que === 'perfil') return <IconUser size={44} color={color} />
  if (que === 'jam') return <IconUsers size={44} color={color} />
  return <IconMusic size={44} color={color} />
}

/**
 * Qué decir cuando el link no tiene tarjeta.
 *
 * No siempre es «no existe»: una lista que volvió a privada, un Jam que
 * terminó y una canción que nunca se publicó dan lo mismo desde afuera, y está
 * bien que así sea — decir cuál de las tres es contarle a un desconocido algo
 * que no le corresponde—. El texto habla del link, que es lo único que quien
 * mira tiene en la mano.
 */
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
