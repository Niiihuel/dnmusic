import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { artworkSource } from '../../src/lib/artwork'
import { compartirLista } from '../../src/lib/compartirLista'
import { mensajeError } from '../../src/lib/mensajeError'
import { volver } from '../../src/lib/volver'
import {
  copyPlaylist,
  fetchPublicPlaylist,
  joinPlaylist,
  listTracks,
  type ListaAjena,
  type PlaylistTrack,
} from '../../src/services/playlists'
import { avisar } from '../../src/state/aviso'
import { useUser } from '../../src/state/session'
import { Aterrizaje } from '../../src/ui/Aterrizaje'
import { playQueue, togglePlayback, usePlaybackTrack, useWantPlay } from '../../src/state/playback'
import { abrirLista, usePiso } from '../../src/state/shell'
import { Avatar } from '../../src/ui/Avatar'
import { BotonVolver } from '../../src/ui/BotonVolver'
import { CollectionHeader, CollectionTitle, Insignia } from '../../src/ui/CollectionHeader'
import { Panel } from '../../src/ui/Panel'
import { PlaylistCover } from '../../src/ui/PlaylistCover'
import { formatLength } from '../../src/ui/SeekBar'
import { SkeletonList } from '../../src/ui/Skeleton'
import { TrackColumnHeader, TrackRow } from '../../src/ui/TrackRow'
import { Vacio } from '../../src/ui/Vacio'
import {
  ICON_COLOR,
  IconGlobe,
  IconMusic,
  IconPause,
  IconPlay,
  IconPlus,
  IconShare,
  IconUsers,
} from '../../src/ui/icons'

/** Desde acá la pantalla se comporta como el escritorio: panel y salida flotante. */
const ANCHO_PX = 900
const MAX_W = 900

/**
 * La lista pública de otra persona, que es adonde lleva el link compartido.
 *
 * Es una **pantalla** y no una parada del panel del medio a propósito: se llega
 * casi siempre desde afuera —un link de WhatsApp, el perfil de alguien— y desde
 * afuera no hay panel del medio al que volver. Así el mismo camino funciona en
 * el teléfono, en la web y por universal link, igual que la puerta de un Jam.
 *
 * Se dibuja con las mismas piezas que la lista propia —`CollectionHeader`,
 * `TrackRow`, la misma portada— porque tiene que verse igual: el punto de
 * guardársela es llevártela tal cual, y una lista que cambia de aspecto según
 * de quién sea no es la misma lista.
 *
 * Lo que **no** tiene es todo lo que sería editarla: no hay menú de la lista, ni
 * quitar canciones, ni renombrar. Se puede escuchar y se puede guardar.
 */
export default function ListaPublica() {
  const { id, colaborar } = useLocalSearchParams<{ id?: string; colaborar?: string }>()
  const router = useRouter()
  const piso = usePiso(24)
  const ancho = useWindowDimensions().width >= ANCHO_PX

  /*
   * Lo cargado se guarda **junto al id que se pidió**, como en el resto de la
   * app: así «todavía no llegó» es «lo que tengo no es de esta lista», y una
   * respuesta que llega tarde nunca se muestra bajo el nombre equivocado.
   */
  const [cargado, setCargado] = useState<{
    id: string
    lista: ListaAjena | null
    tracks: PlaylistTrack[]
  } | null>(null)
  const fresco = !!id && cargado?.id === id
  const lista = fresco ? cargado.lista : undefined
  const tracks = fresco ? cargado.tracks : []
  const [guardando, setGuardando] = useState(false)
  const sonando = usePlaybackTrack()
  const suena = useWantPlay()
  /*
   * Quien todavía no está adentro ve la tarjeta, no la lista.
   *
   * `useUser` ya contesta las dos preguntas en una: devuelve `undefined`
   * mientras la sesión se resuelve —y ahí no se dibuja nada, o parpadearía la
   * tarjeta en cada arranque— y `null` tanto sin sesión como con la cuenta sin
   * aprobar, que para esta pantalla es lo mismo. Ver `Aterrizaje` y la
   * excepción del gate en `app/_layout`.
   */
  const quien = useUser()
  const aprobado = !!quien

  useEffect(() => {
    if (!id || fresco || !aprobado) return
    let vivo = true

    const cargar = async () => {
      /*
       * Sumarse va **antes** de leer, no después.
       *
       * Una lista colaborativa suele ser privada, y a quien todavía no colabora
       * `get_public_playlist` no le devuelve nada. Al revés, el link de invitar
       * le mostraría «esta lista no está disponible» justo a la persona que fue
       * invitada a escribirla.
       */
      if (colaborar === '1') {
        await joinPlaylist(id).catch(() => {
          /* No acepta colaboradores, o ya no existe. Se sigue igual: la carga
             de abajo es la que sabe con qué cartel contestar. */
        })
      }
      const l = await fetchPublicPlaylist(id)
      /* Las canciones se piden solo si la lista existe y se puede ver: si no,
         sería un viaje que la base va a contestar vacío igual. */
      const t = l ? await listTracks(id).catch(() => []) : []
      if (vivo) setCargado({ id, lista: l, tracks: t })
    }

    cargar().catch(() => vivo && setCargado({ id, lista: null, tracks: [] }))
    return () => {
      vivo = false
    }
  }, [id, fresco, colaborar, aprobado])

  /*
   * De quién es la fila que suena.
   *
   * Se reconoce por el video y no por el índice porque la cola sale de acá
   * **sin lista detrás** (`origin` en null): esta lista no está en tu
   * biblioteca, y decirle a la barra «ver la lista» la mandaría a buscar un id
   * que no vas a encontrar. Sin origen, ese menú queda apagado, que es la
   * verdad.
   */
  const suenaAca = (track: PlaylistTrack) => sonando?.videoId === track.videoId
  const algunaSuena = tracks.some(suenaAca)

  function play(at: number) {
    const track = tracks[at]
    if (!track) return
    if (suenaAca(track)) togglePlayback()
    else playQueue(tracks, at, null)
  }

  async function guardar() {
    if (!id || guardando) return
    setGuardando(true)
    try {
      await copyPlaylist(id)
      avisar('Guardada en tus listas.')
    } catch (e) {
      avisar(mensajeError(e), true)
    } finally {
      setGuardando(false)
    }
  }

  /* Para mostrar, el nombre elegido o el usuario con arroba. Para el avatar,
     el mismo texto **sin** la arroba: las iniciales salen de las primeras
     letras, y con el arroba adelante el redondel decía «@T». */
  const nombreDueño = lista?.dueño.displayName?.trim() || `@${lista?.dueño.username ?? ''}`
  const inicialesDueño = lista?.dueño.displayName?.trim() || lista?.dueño.username || ''
  const total = tracks.length

  if (quien === undefined) return <SafeAreaView className="flex-1 bg-background" />
  if (!aprobado) return <Aterrizaje que="lista" id={id ?? ''} />

  return (
    <SafeAreaView
      className="flex-1 bg-background"
      edges={ancho ? ['top', 'bottom'] : ['top']}
    >
      <View className={`flex-1 ${ancho ? 'gap-2 p-2' : ''}`}>
        {/* En el teléfono la salida va arriba, en el flujo; en escritorio flota
            sobre el contenido. Mismo reparto que el perfil de otra persona. */}
        {ancho ? null : (
          <View className="flex-row items-center gap-3 px-3 py-1">
            <BotonVolver onPress={() => volver(router, '/')} />
            <Text className="text-foreground text-[15px] font-semibold" numberOfLines={1}>
              {lista?.playlist.name ?? 'Lista'}
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
            {lista === undefined ? (
              <View className="py-16">
                <ActivityIndicator color="#FFFFFF" />
              </View>
            ) : lista === null ? (
              /* Un solo cartel para «no existe» y para «es privada»: son la
                 misma respuesta a propósito, así nadie averigua qué ids existen
                 probando. Mismo criterio que el perfil en privado. */
              <View className="px-6 py-16">
                <Vacio
                  icono={<IconMusic size={24} color={ICON_COLOR.muted} />}
                  titulo="Esta lista no está disponible"
                  detalle="Puede que ya no exista o que quien la armó la haya vuelto privada."
                  accion={{ rotulo: 'Ir a la app', onPress: () => volver(router, '/') }}
                />
              </View>
            ) : (
              <View className="w-full" style={{ maxWidth: MAX_W }}>
                <CollectionHeader
                  kind="Lista"
                  insignia={
                    /* Colaborativa gana sobre pública cuando es las dos: lo que
                       cambia lo que podés hacer acá es que la escribís, no que
                       se lea. */
                    lista.playlist.colaborativa ? (
                      <Insignia icono={<IconUsers size={10} color={ICON_COLOR.muted} />}>
                        Colaborativa
                      </Insignia>
                    ) : (
                      <Insignia icono={<IconGlobe size={10} color={ICON_COLOR.muted} />}>
                        Pública
                      </Insignia>
                    )
                  }
                  title={<CollectionTitle>{lista.playlist.name}</CollectionTitle>}
                  meta={`${total} ${total === 1 ? 'canción' : 'canciones'}${
                    lista.playlist.totalMs > 0 ? ` · ${formatLength(lista.playlist.totalMs)}` : ''
                  }`}
                  image={
                    <View className="overflow-hidden rounded-lg">
                      <PlaylistCover
                        covers={lista.playlist.covers}
                        coverPath={lista.playlist.coverPath}
                        size={152}
                      />
                    </View>
                  }
                  actions={
                    <>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={
                          algunaSuena && suena ? 'Pausar' : `Reproducir ${lista.playlist.name}`
                        }
                        onPress={() => (algunaSuena ? togglePlayback() : play(0))}
                        disabled={total === 0}
                        className={`h-14 w-14 items-center justify-center rounded-full ${
                          total === 0 ? 'bg-muted' : 'bg-primary active:opacity-80'
                        }`}
                      >
                        {algunaSuena && suena ? (
                          <IconPause
                            size={20}
                            color={total === 0 ? ICON_COLOR.muted : ICON_COLOR.onPrimary}
                          />
                        ) : (
                          <IconPlay
                            size={20}
                            color={total === 0 ? ICON_COLOR.muted : ICON_COLOR.onPrimary}
                          />
                        )}
                      </Pressable>

                      {/*
                       * Si la podés escribir —sos el dueño o ya colaborás—, lo
                       * que corresponde no es guardarte una copia sino ir a la
                       * de verdad: una copia de una lista que estás editando
                       * entre varios se queda vieja en el momento en que
                       * alguien suma algo, y sería dos listas parecidas en la
                       * biblioteca sin forma de saber cuál es cuál.
                       *
                       * Es también el aterrizaje del link de colaborar: entrás,
                       * la base te sumó, y este botón te deja adentro.
                       */}
                      {lista.puedoEditar ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Abrir en mis listas"
                          onPress={() => {
                            abrirLista(lista.playlist.id)
                            volver(router, '/')
                          }}
                          className="h-11 flex-row items-center gap-2 rounded-full bg-muted px-4 active:opacity-80"
                        >
                          <IconMusic size={16} color={ICON_COLOR.foreground} />
                          <Text className="text-foreground text-[13px] font-semibold">
                            Abrir en mis listas
                          </Text>
                        </Pressable>
                      ) : null}

                      {/*
                       * Guardar es el botón de esta pantalla, así que va al lado
                       * del play y con palabras, no escondido detrás de tres
                       * puntos. En la tuya propia no aparece: duplicarte una
                       * lista que ya tenés no es nada que alguien quiera.
                       */}
                      {lista.mia || lista.puedoEditar ? null : (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Guardar en mis listas"
                          onPress={() => void guardar()}
                          disabled={guardando || total === 0}
                          className="h-11 flex-row items-center gap-2 rounded-full bg-muted px-4 active:opacity-80"
                        >
                          {guardando ? (
                            <ActivityIndicator size="small" color={ICON_COLOR.foreground} />
                          ) : (
                            <IconPlus size={16} color={ICON_COLOR.foreground} />
                          )}
                          <Text className="text-foreground text-[13px] font-semibold">
                            {guardando ? 'Guardando…' : 'Guardar'}
                          </Text>
                        </Pressable>
                      )}

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Compartir el link"
                        onPress={() => void compartirLista(lista.playlist.id, lista.playlist.name)}
                        className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
                      >
                        <IconShare size={18} color={ICON_COLOR.muted} />
                      </Pressable>
                    </>
                  }
                />

                {/* De quién es, con su cara: el link llega solo y sin esto la
                    lista aparece sin dueño. Toca y te lleva a su perfil. */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Ver el perfil de @${lista.dueño.username}`}
                  onPress={() => router.push(`/perfil/${lista.dueño.username}`)}
                  className="mx-6 mb-5 flex-row items-center gap-3 self-start rounded-full bg-card py-1.5 pl-1.5 pr-4 active:opacity-80"
                >
                  <Avatar name={inicialesDueño} path={lista.dueño.avatarPath} size={28} />
                  <Text className="text-muted-foreground text-[13px]" numberOfLines={1}>
                    Una lista de{' '}
                    <Text className="text-foreground font-semibold">{nombreDueño}</Text>
                  </Text>
                </Pressable>

                {!fresco ? (
                  <View className="px-6">
                    <SkeletonList rows={5} />
                  </View>
                ) : total === 0 ? (
                  <View className="px-6 py-6">
                    <Vacio
                      compacto
                      icono={<IconMusic size={20} color={ICON_COLOR.muted} />}
                      titulo="La lista está vacía"
                      /* Si la podés escribir, «quien la armó no le puso nada»
                         te deja esperando a otro para algo que depende de vos.
                         El buscador para sumar vive en la lista de verdad, no
                         en esta pantalla, así que el texto manda para allá. */
                      detalle={
                        lista.puedoEditar
                          ? 'Abrila en tus listas y poné la primera.'
                          : 'Quien la armó todavía no le puso nada.'
                      }
                    />
                  </View>
                ) : (
                  <View className="gap-1">
                    <TrackColumnHeader />
                    {tracks.map((track, i) => (
                      <TrackRow
                        key={track.id}
                        index={i}
                        title={track.title}
                        artist={track.artist}
                        artwork={artworkSource(track.artworkPath, track.artworkUrl, 96)}
                        durationMs={track.durationMs}
                        sounding={suenaAca(track)}
                        playing={suenaAca(track) && suena}
                        onPlay={() => play(i)}
                      />
                    ))}
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        </Panel>
      </View>
    </SafeAreaView>
  )
}
