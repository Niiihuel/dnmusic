import { useEffect, useState } from 'react'
import { ActivityIndicator, Image, Pressable, Text, useWindowDimensions, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ScrollArea as ScrollView } from '../../src/ui/ScrollArea'
import { volver } from '../../src/lib/volver'
import { mensajeError } from '../../src/lib/mensajeError'
import { pistaDeResultado } from '../../src/lib/pistas'
import { compartirCancion } from '../../src/lib/compartir'
import { useColorPortada } from '../../src/lib/colorPortada'
import { resolveSong, type TrackResult } from '../../src/services/music'
import { tarjetaDe, type Tarjeta } from '../../src/services/compartidos'
import { avisar } from '../../src/state/aviso'
import { dejarCancionPendiente } from '../../src/state/listas'
import { playQueue, togglePlayback, usePlaybackTrack, useWantPlay } from '../../src/state/playback'
import { usePiso } from '../../src/state/shell'
import { useUser } from '../../src/state/session'
import { Aterrizaje } from '../../src/ui/Aterrizaje'
import { BotonVolver } from '../../src/ui/BotonVolver'
import { CollectionHeader, CollectionTitle, Insignia } from '../../src/ui/CollectionHeader'
import { Panel } from '../../src/ui/Panel'
import { formatLength } from '../../src/ui/SeekBar'
import { Vacio } from '../../src/ui/Vacio'
import {
  ICON_COLOR,
  IconMusic,
  IconPause,
  IconPlay,
  IconPlus,
  IconShare,
} from '../../src/ui/icons'

/** Desde acá la pantalla se comporta como el escritorio, igual que la lista. */
const ANCHO_PX = 900
const MAX_W = 900
/** El lado de la tapa en la cabecera; el mismo de la lista pública. */
const TAPA = 152

/**
 * Una canción por link: adonde lleva `dnmusic-app.vercel.app/cancion/<id>`.
 *
 * Es la hermana de `app/lista/[id]` y se llega igual —un mensaje de WhatsApp,
 * el menú de alguien— así que es una **pantalla** y no una parada del panel del
 * medio: desde afuera no hay panel al que volver.
 *
 * A diferencia de la lista, la canción no es una fila de ninguna tabla: vive
 * adentro de las listas que la tienen. Lo que se lee acá es la tarjeta que
 * publicó quien compartió —`tarjeta_enlace`, ver `services/compartidos`— y el
 * audio se resuelve recién al tocar Reproducir, como cualquier resultado de
 * búsqueda. Por eso el botón tarda la primera vez: hay que traer el tema a
 * Storage.
 *
 * Sin cuenta aprobada no se dibuja nada de esto: la ruta cae en `Aterrizaje`,
 * que muestra la tapa y la puerta. Que la tarjeta se vea sin sesión no abre la
 * reproducción — resolver y firmar el audio siguen pidiendo cuenta.
 */
export default function CancionCompartida() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const router = useRouter()
  /* `useUser` da `undefined` mientras la sesión se resuelve y `null` tanto sin
     sesión como con la cuenta sin aprobar: para esta pantalla es lo mismo. */
  const quien = useUser()
  const aprobado = !!quien
  const piso = usePiso(24)
  const ancho = useWindowDimensions().width >= ANCHO_PX
  const sonando = usePlaybackTrack()
  const suena = useWantPlay()

  const [cargado, setCargado] = useState<{ id: string; tarjeta: Tarjeta | null } | null>(null)
  const fresco = !!id && cargado?.id === id
  const tarjeta = fresco ? cargado.tarjeta : undefined
  const [resolviendo, setResolviendo] = useState(false)
  const tinte = useColorPortada(tarjeta?.tapa ?? null)

  useEffect(() => {
    if (!id || !aprobado) return
    let vivo = true
    tarjetaDe('cancion', id)
      .then((t) => vivo && setCargado({ id, tarjeta: t }))
      .catch(() => vivo && setCargado({ id, tarjeta: null }))
    return () => {
      vivo = false
    }
  }, [id, aprobado])

  /* Sin cuenta aprobada, la tarjeta y la puerta. Va después de los hooks —y no
     en un `return` temprano— para no romper su orden entre renders. */
  if (quien === undefined) return <SafeAreaView className="flex-1 bg-background" />
  if (!aprobado) return <Aterrizaje que="cancion" id={id ?? ''} />

  /** El resultado que entiende el resto de la app, armado con lo de la tarjeta. */
  const resultado = (t: Tarjeta): TrackResult => ({
    videoId: t.id,
    title: t.titulo,
    artist: t.subtitulo,
    artistId: null,
    album: '',
    albumId: null,
    artworkUrl: t.tapa ?? '',
    durationMs: t.durationMs ?? 0,
  })

  const suenaAca = !!tarjeta && sonando?.videoId === tarjeta.id

  async function reproducir(t: Tarjeta) {
    if (suenaAca) {
      togglePlayback()
      return
    }
    setResolviendo(true)
    try {
      const pista = resultado(t)
      const song = await resolveSong(pista)
      playQueue([pistaDeResultado(pista, 'enlace', song)], 0, null)
    } catch (e) {
      avisar(`No se pudo reproducir: ${mensajeError(e)}`, true)
    } finally {
      setResolviendo(false)
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={ancho ? ['top', 'bottom'] : ['top']}>
      <View className={`flex-1 ${ancho ? 'gap-2 p-2' : ''}`}>
        {ancho ? null : (
          <View className="flex-row items-center gap-3 px-3 py-1">
            <BotonVolver onPress={() => volver(router, '/')} />
            <Text className="text-foreground text-[15px] font-semibold" numberOfLines={1}>
              {tarjeta?.titulo ?? 'Canción'}
            </Text>
          </View>
        )}

        <Panel className="flex-1">
          {ancho ? (
            <View className="absolute left-4 top-4 z-10">
              <BotonVolver onPress={() => volver(router, '/')} />
            </View>
          ) : null}

          <ScrollView
            contentContainerClassName="items-center"
            contentContainerStyle={{ paddingTop: ancho ? 64 : 8, paddingBottom: piso }}
          >
            {tarjeta === undefined ? (
              <View className="py-16">
                <ActivityIndicator color="#FFFFFF" />
              </View>
            ) : tarjeta === null ? (
              /* Un solo cartel para «no existe» y para «nadie la publicó»: la
                 misma respuesta a propósito, así nadie recorre el catálogo
                 probando ids. Mismo criterio que la lista y que el perfil. */
              <View className="px-6 py-16">
                <Vacio
                  icono={<IconMusic size={24} color={ICON_COLOR.muted} />}
                  titulo="Esta canción no está disponible"
                  detalle="El link puede haber quedado viejo. Buscala por su nombre y va a estar."
                  accion={{ rotulo: 'Ir a la app', onPress: () => volver(router, '/') }}
                />
              </View>
            ) : (
              <View className="w-full" style={{ maxWidth: MAX_W }}>
                <CollectionHeader
                  kind="Canción"
                  tint={tinte}
                  bleedTop={ancho ? 64 : 8}
                  insignia={
                    <Insignia icono={<IconShare size={10} color={ICON_COLOR.muted} />}>
                      Compartida
                    </Insignia>
                  }
                  title={<CollectionTitle>{tarjeta.titulo}</CollectionTitle>}
                  meta={[tarjeta.subtitulo, tarjeta.durationMs ? formatLength(tarjeta.durationMs) : '']
                    .filter(Boolean)
                    .join(' · ')}
                  image={
                    <View className="overflow-hidden rounded-lg bg-muted" style={{ width: TAPA, height: TAPA }}>
                      {tarjeta.tapa ? (
                        <Image source={{ uri: tarjeta.tapa }} style={{ width: TAPA, height: TAPA }} />
                      ) : (
                        <View className="flex-1 items-center justify-center">
                          <IconMusic size={32} color={ICON_COLOR.muted} />
                        </View>
                      )}
                    </View>
                  }
                  actions={
                    <>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={
                          suenaAca && suena ? 'Pausar' : `Reproducir ${tarjeta.titulo}`
                        }
                        accessibilityState={{ busy: resolviendo }}
                        disabled={resolviendo}
                        onPress={() => void reproducir(tarjeta)}
                        className="h-14 w-14 items-center justify-center rounded-full bg-primary active:opacity-80"
                      >
                        {resolviendo ? (
                          <ActivityIndicator size="small" color={ICON_COLOR.onPrimary} />
                        ) : suenaAca && suena ? (
                          <IconPause size={20} color={ICON_COLOR.onPrimary} />
                        ) : (
                          <IconPlay size={20} color={ICON_COLOR.onPrimary} />
                        )}
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Agregar a una lista"
                        onPress={() => {
                          dejarCancionPendiente(resultado(tarjeta))
                          router.push('/lista/elegir')
                        }}
                        className="h-11 w-11 items-center justify-center rounded-full bg-muted active:opacity-75"
                      >
                        <IconPlus size={18} color={ICON_COLOR.muted} />
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Compartir el link"
                        onPress={() =>
                          void compartirCancion({
                            videoId: tarjeta.id,
                            title: tarjeta.titulo,
                            artist: tarjeta.subtitulo,
                            artworkUrl: tarjeta.tapa ?? '',
                            durationMs: tarjeta.durationMs ?? 0,
                          })
                        }
                        className="h-11 w-11 items-center justify-center rounded-full bg-muted active:opacity-75"
                      >
                        <IconShare size={18} color={ICON_COLOR.muted} />
                      </Pressable>
                    </>
                  }
                />
              </View>
            )}
          </ScrollView>
        </Panel>
      </View>
    </SafeAreaView>
  )
}
