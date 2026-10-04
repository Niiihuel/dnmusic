import { IconButton } from '../../src/ui/IconButton'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Text, useWindowDimensions, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ScrollArea as ScrollView } from '../../src/ui/ScrollArea'
import { volver } from '../../src/lib/volver'
import { pistaDeResultado } from '../../src/lib/pistas'
import { compartirCancion, linkDe } from '../../src/lib/compartir'
import type { TrackResult } from '../../src/services/music'
import { tarjetaDe, type Tarjeta } from '../../src/services/compartidos'
import { dejarCancionPendiente } from '../../src/state/listas'
import { playQueue, togglePlayback, usePlaybackCargada, usePlaybackTrack, useWantPlay } from '../../src/state/playback'
import { usePiso } from '../../src/state/shell'
import { useUser } from '../../src/state/session'
import { Aterrizaje } from '../../src/ui/Aterrizaje'
import { BotonVolver } from '../../src/ui/BotonVolver'
import { TarjetaMusica } from '../../src/ui/TarjetaMusica'
import { useDestinoEscucha } from '../../src/ui/Dispositivos.shared'
import { Panel } from '../../src/ui/Panel'
import { formatLength } from '../../src/ui/SeekBar'
import { Vacio } from '../../src/ui/Vacio'
import {
  ICON_COLOR,
  IconMusic,
  IconPlus,
  IconShare,
} from '../../src/ui/icons'

const ANCHO_PX = 900
const MAX_W = 900

/* La tarjeta pública sólo aporta metadatos; resolver el audio requiere una cuenta aprobada. */
export default function CancionCompartida() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const router = useRouter()
  /* `useUser` distingue sesión pendiente (undefined) de acceso no aprobado (null). */
  const quien = useUser()
  const aprobado = !!quien
  const piso = usePiso(24)
  const ancho = useWindowDimensions().width >= ANCHO_PX
  const sonando = usePlaybackTrack()
  const suena = useWantPlay()
  const cargada = usePlaybackCargada()
  const destino = useDestinoEscucha()

  const [cargado, setCargado] = useState<{ id: string; tarjeta: Tarjeta | null } | null>(null)
  const fresco = !!id && cargado?.id === id
  const tarjeta = fresco ? cargado.tarjeta : undefined

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

  if (quien === undefined) return <SafeAreaView className="flex-1 bg-background" />
  if (!aprobado) return <Aterrizaje que="cancion" id={id ?? ''} />

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

  function reproducir(t: Tarjeta) {
    if (suenaAca) togglePlayback()
    else playQueue([pistaDeResultado(resultado(t), 'enlace')], 0, null)
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={ancho ? ['top', 'bottom'] : ['top']}>
      <View className={`flex-1 ${ancho ? 'gap-2 p-2' : ''}`}>
        {ancho ? null : (
          <View className="flex-row items-center gap-3 px-3 py-1">
            <BotonVolver onPress={() => volver(router, '/')} />
            <Text className="text-foreground text-subheadline font-semibold" numberOfLines={1}>
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
              /* No distinguir ids inexistentes de tarjetas no publicadas evita revelar el catálogo. */
              <View className="px-6 py-16">
                <Vacio
                  icono={<IconMusic size={24} color={ICON_COLOR.muted} />}
                  titulo="Esta canción no está disponible"
                  detalle="El link puede haber quedado viejo. Buscala por su nombre y va a estar."
                  accion={{ rotulo: 'Ir a la app', onPress: () => volver(router, '/') }}
                />
              </View>
            ) : (
              <View className="w-full items-center gap-5 px-6 py-8" style={{ maxWidth: MAX_W }}>
                <Text className="text-muted-foreground text-footnote">Canción compartida</Text>
                <TarjetaMusica
                  datos={{ titulo: tarjeta.titulo, artista: tarjeta.subtitulo, imagen: tarjeta.tapa }}
                  reproduciendo={suenaAca && suena && !destino.remoto}
                  cargando={suenaAca && suena && !cargada && !destino.remoto}
                  etiquetaReproduccion={suenaAca && destino.remoto ? 'Traer música a este dispositivo' : undefined}
                  onReproducir={() => reproducir(tarjeta)}
                  onAbrir={suenaAca ? () => router.push('/playing') : undefined}
                />
                {tarjeta.durationMs ? <Text className="text-muted-foreground text-caption1 tabular-nums">{formatLength(tarjeta.durationMs)}</Text> : null}
                <View className="flex-row items-center gap-3">
                  <IconButton label="Agregar a una lista" symbol="plus" onPress={() => {
                    dejarCancionPendiente(resultado(tarjeta))
                    router.push('/lista/elegir')
                  }} lado={44} size={18} icon={<IconPlus size={18} color={ICON_COLOR.muted} />} />
                  <IconButton expandible copyText={linkDe('cancion', tarjeta.id)} label="Compartir el link" symbol="square.and.arrow.up" onPress={() =>
                    void compartirCancion({
                      videoId: tarjeta.id,
                      title: tarjeta.titulo,
                      artist: tarjeta.subtitulo,
                      artworkUrl: tarjeta.tapa ?? '',
                      durationMs: tarjeta.durationMs ?? 0,
                    })
                  } lado={44} size={18} icon={<IconShare size={18} color={ICON_COLOR.muted} />} />
                </View>
              </View>
            )}
          </ScrollView>
        </Panel>
      </View>
    </SafeAreaView>
  )
}
