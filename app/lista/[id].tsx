import { BordeScrollNativo } from '../../src/ui/CollectionScrollEdge'
import { BotonSuperficie } from '../../src/ui/BotonSuperficie'
import { BotonMixPlaylist } from '../../src/ui/BotonMixPlaylist'
import { PlaylistTransitionRow } from '../../src/ui/PlaylistTransitionRow'
import { IconButton } from '../../src/ui/IconButton'
import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { artworkSource } from '../../src/lib/artwork'
import { compartirLista, linkDeLista } from '../../src/lib/compartirLista'
import { mensajeError } from '../../src/lib/mensajeError'
import { volver } from '../../src/lib/volver'
import type { TrackResult } from '../../src/services/music'
import {
  copyPlaylist,
  fetchPublicPlaylist,
  joinPlaylist,
  listTracks,
  removeTrack,
  type ListaAjena,
  type PlaylistTrack,
} from '../../src/services/playlists'
import { avisar } from '../../src/state/aviso'
import { dejarCancionACompartir } from '../../src/state/compartir'
import { alternarMeGusta, useMeGusta } from '../../src/state/gustos'
import { avisarListaCambiada, dejarCancionPendiente } from '../../src/state/listas'
import { useUser } from '../../src/state/session'
import { Aterrizaje } from '../../src/ui/Aterrizaje'
import { canEnqueueNext, enqueue, enqueueNext, playCollection, playQueue, togglePlayback, usePlaybackTrack, useWantPlay } from '../../src/state/playback'
import { abrirArtista, abrirLista, usePiso } from '../../src/state/shell'
import { loadActivePlaylistMix, useMixPlaylistRevision, type ActivePlaylistMix } from '../../src/state/mixPlayback'
import { avisarContenidoPlaylistCambiado, usePlaylistContentRevision } from '../../src/state/playlistContent'
import { usePlaylistBpms } from '../../src/state/playlistBpm'
import { HAY_DESCARGAS, useDescargas } from '../../src/state/descargas'
import { Avatar } from '../../src/ui/Avatar'
import { BotonVolver } from '../../src/ui/BotonVolver'
import { CollectionHeader, CollectionTitle, Insignia } from '../../src/ui/CollectionHeader'
import { Confirmar } from '../../src/ui/Confirmar'
import { Panel } from '../../src/ui/Panel'
import { PlaylistCover } from '../../src/ui/PlaylistCover'
import { entradaDeTrack, menuDescargaCancion } from '../../src/ui/descargasControl'
import { Menu, type MenuItem } from '../../src/ui/Menu'
import { formatLength } from '../../src/ui/SeekBar'
import { SkeletonList } from '../../src/ui/Skeleton'
import { TrackColumnHeader, TrackRow } from '../../src/ui/TrackRow'
import { Vacio } from '../../src/ui/Vacio'
import {
  ICON_COLOR,
  IconGlobe,
  IconHeart,
  IconHeartFilled,
  IconMinus,
  IconMusic,
  IconPause,
  IconPlay,
  IconPlus,
  IconQueue,
  IconShare,
  IconUser,
  IconUsers,
} from '../../src/ui/icons'

/** Desde acá la pantalla se comporta como el escritorio: panel y salida flotante. */
const ANCHO_PX = 900
const MAX_W = 900

/** La hoja de elegir lista recibe la canción ya resuelta, igual que en Inicio. */
function resultadoDeLista(track: PlaylistTrack): TrackResult {
  return {
    videoId: track.videoId, title: track.title, artist: track.artist,
    artistId: track.artistId, album: '', albumId: null,
    artworkUrl: track.artworkUrl, durationMs: track.durationMs,
    audioPath: track.audioPath, artworkPath: track.artworkPath,
  }
}

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
 * El visitante no edita la lista. Quien ya es dueño o colaborador sí puede
 * quitar canciones desde el menú de cada fila; los demás pueden escuchar,
 * guardar y usar acciones personales como Me gusta o Agregar a una lista.
 */
export default function ListaPublica() {
  const { id, colaborar } = useLocalSearchParams<{ id?: string; colaborar?: string }>()
  const router = useRouter()
  const piso = usePiso(24)
  const ancho = useWindowDimensions().width >= ANCHO_PX
  const toolbarIOS = Platform.OS === 'ios' && !ancho
  const safeTop = useSafeAreaInsets().top
  const [altoToolbar, setAltoToolbar] = useState(safeTop + 56)

  /*
   * Lo cargado se guarda **junto al id que se pidió**, como en el resto de la
   * app: así «todavía no llegó» es «lo que tengo no es de esta lista», y una
   * respuesta que llega tarde nunca se muestra bajo el nombre equivocado.
   */
  const [cargado, setCargado] = useState<{
    id: string
    contentRevision: number
    lista: ListaAjena | null
    tracks: PlaylistTrack[]
  } | null>(null)
  const contentRevision = usePlaylistContentRevision(id ?? null)
  const fresco = !!id && cargado?.id === id && cargado.contentRevision === contentRevision
  const lista = fresco ? cargado.lista : undefined
  const tracks = fresco ? cargado.tracks : []
  const bpms = usePlaylistBpms(tracks)
  const [guardando, setGuardando] = useState(false)
  const [porQuitar, setPorQuitar] = useState<{ playlistId: string; trackId: string; title: string } | null>(null)
  const { items: descargas } = useDescargas()
  const gustos = useMeGusta()
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
  const mixRevision = useMixPlaylistRevision(id ?? null)
  const [loadedMix, setLoadedMix] = useState<{ playlistId: string; revision: number; data: ActivePlaylistMix | null } | null>(null)
  useEffect(() => {
    if (!id || !aprobado) return
    let alive = true
    loadActivePlaylistMix(id)
      .then(data => { if (alive) setLoadedMix({ playlistId: id, revision: mixRevision, data }) })
      .catch(() => { if (alive) setLoadedMix({ playlistId: id, revision: mixRevision, data: null }) })
    return () => { alive = false }
  }, [id, aprobado, mixRevision])
  const activeMix = loadedMix && loadedMix.playlistId === id && loadedMix.revision === mixRevision
    ? loadedMix.data?.mix ? loadedMix.data : null : null
  const transitionsByPair = useMemo(() => new Map(
    (activeMix?.edges ?? []).map(edge => [`${edge.fromPlaylistTrackId}:${edge.toPlaylistTrackId}`, edge]),
  ), [activeMix])

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
      if (vivo) setCargado({ id, contentRevision, lista: l, tracks: t })
    }

    cargar().catch(() => vivo && setCargado({ id, contentRevision, lista: null, tracks: [] }))
    return () => {
      vivo = false
    }
  }, [id, fresco, colaborar, aprobado, contentRevision])

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
    else playQueue(tracks, at, { id: id!, name: lista?.playlist.name ?? 'Lista', kind: 'public' })
  }

  async function quitar(trackId: string) {
    if (!lista?.puedoEditar) return
    try {
      await removeTrack(trackId)
      avisarContenidoPlaylistCambiado(lista.playlist.id)
      avisarListaCambiada(lista.playlist.id)
    } catch (error) {
      avisar(`No se pudo quitar la canción: ${mensajeError(error)}`, true)
    }
  }

  /** Un mismo menú para tres puntos, toque largo y clic derecho. */
  function opcionesDe(track: PlaylistTrack, download: ReturnType<typeof entradaDeTrack>): MenuItem[] {
    const gustada = gustos.some(cancion => cancion.videoId === track.videoId)
    return [
      {
        label: gustada ? 'Quitar de me gusta' : 'Me gusta',
        rapida: true,
        selected: gustada || undefined,
        onPress: () => alternarMeGusta(track),
        icon: gustada ? <IconHeartFilled size={15} color={ICON_COLOR.foreground} />
          : <IconHeart size={15} color={ICON_COLOR.muted} />,
        sfSymbol: gustada ? 'heart.fill' : 'heart',
      },
      {
        label: 'Poner a continuación',
        onPress: () => enqueueNext(track),
        disabled: !canEnqueueNext(),
        subtitle: canEnqueueNext() ? undefined : 'El orden del Jam es compartido',
        icon: <IconQueue size={15} color={ICON_COLOR.muted} />,
        sfSymbol: 'text.line.first.and.arrowtriangle.forward',
      },
      {
        label: 'Agregar a la cola',
        rapida: true,
        onPress: () => enqueue(track),
        icon: <IconQueue size={15} color={ICON_COLOR.muted} />,
        sfSymbol: 'text.badge.plus',
      },
      {
        label: 'Compartir',
        rapida: true,
        onPress: () => { dejarCancionACompartir(track); router.push('/compartir') },
        icon: <IconShare size={15} color={ICON_COLOR.muted} />,
        sfSymbol: 'square.and.arrow.up',
      },
      {
        label: 'Agregar a una lista',
        onPress: () => { dejarCancionPendiente(resultadoDeLista(track)); router.push('/lista/elegir') },
        icon: <IconPlus size={15} color={ICON_COLOR.muted} />,
        sfSymbol: 'text.badge.plus',
      },
      ...(track.artistId ? [{
        label: 'Ir al artista',
        subtitle: track.artist,
        separadorAntes: true,
        onPress: () => { abrirArtista(track.artistId!, track.artist); volver(router, '/') },
        icon: <IconUser size={15} color={ICON_COLOR.muted} />,
        sfSymbol: 'music.microphone' as const,
      }] : []),
      ...menuDescargaCancion(track, download),
      ...(lista?.puedoEditar ? [{
        label: 'Quitar de la lista',
        onPress: () => setPorQuitar({ playlistId: lista.playlist.id, trackId: track.id, title: track.title }),
        destructive: true,
        icon: <IconMinus size={15} color={ICON_COLOR.muted} />,
        sfSymbol: 'minus.circle' as const,
      }] : []),
    ]
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
      edges={toolbarIOS ? [] : ancho ? ['top', 'bottom'] : ['top']}
    >
      <View className={`flex-1 ${ancho ? 'gap-2 p-2' : ''}`}>
        {/* En el teléfono la salida va arriba, en el flujo; en escritorio flota
            sobre el contenido. Mismo reparto que el perfil de otra persona. */}
        {ancho ? null : (
          <View collapsable={false} onLayout={e => setAltoToolbar(e.nativeEvent.layout.height)}
            style={toolbarIOS ? { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, paddingTop: safeTop + 4 } : undefined}
            className="flex-row items-center gap-3 px-3 py-1">
            {toolbarIOS ? <BordeScrollNativo /> : null}
            <BotonVolver onPress={() => volver(router, '/')} />
            <Text className="text-foreground text-subheadline font-semibold" numberOfLines={1}>
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
            contentContainerStyle={{ paddingTop: toolbarIOS ? altoToolbar + 8 : ancho ? 64 : 8, paddingBottom: piso }}
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
                  bleedTop={toolbarIOS ? altoToolbar + 8 : 0}
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
                      <IconButton label={
                          algunaSuena && suena ? 'Pausar' : `Reproducir ${lista.playlist.name}`
                        } symbol={algunaSuena && suena ? 'pause.fill' : 'play.fill'} onPress={() => (algunaSuena ? togglePlayback() : playCollection(tracks, { id: id!, name: lista.playlist.name, kind: 'public' }))} disabled={total === 0} lado={56} size={20} variant="primary" icon={algunaSuena && suena ? (
                          <IconPause
                            size={20}
                            color={total === 0 ? ICON_COLOR.muted : ICON_COLOR.onPrimary}
                          />
                        ) : (
                          <IconPlay
                            size={20}
                            color={total === 0 ? ICON_COLOR.muted : ICON_COLOR.onPrimary}
                          />
                        )} />

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
                        <BotonSuperficie
                          accessibilityRole="button"
                          accessibilityLabel="Abrir en mis listas"
                          onPress={() => {
                            abrirLista(lista.playlist.id)
                            volver(router, '/')
                          }}
                          className="h-11 flex-row items-center gap-2 rounded-full bg-muted px-4 active:opacity-80"
                        >
                          <IconMusic size={16} color={ICON_COLOR.foreground} />
                          <Text className="text-foreground text-footnote font-semibold">
                            Abrir en mis listas
                          </Text>
                        </BotonSuperficie>
                      ) : null}

                      {/*
                       * Guardar es el botón de esta pantalla, así que va al lado
                       * del play y con palabras, no escondido detrás de tres
                       * puntos. En la tuya propia no aparece: duplicarte una
                       * lista que ya tenés no es nada que alguien quiera.
                       */}
                      {lista.mia || lista.puedoEditar ? null : (
                        <BotonSuperficie
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
                          <Text className="text-foreground text-footnote font-semibold">
                            {guardando ? 'Guardando…' : 'Guardar'}
                          </Text>
                        </BotonSuperficie>
                      )}

                      {total >= 2 ? <BotonMixPlaylist playlistId={lista.playlist.id} name={lista.playlist.name}
                        onPress={() => router.push({ pathname: '/lista/mix', params: {
                          id: lista.playlist.id, nombre: lista.playlist.name, owner: lista.mia ? '1' : '0',
                        } })} /> : null}

                      <IconButton expandible copyText={linkDeLista(lista.playlist.id)} label="Compartir el link" symbol="square.and.arrow.up" onPress={() => void compartirLista(lista.playlist.id, lista.playlist.name)} lado={44} size={18} icon={<IconShare size={18} color={ICON_COLOR.muted} />} />
                    </>
                  }
                />

                {/* De quién es, con su cara: el link llega solo y sin esto la
                    lista aparece sin dueño. Toca y te lleva a su perfil. */}
                <BotonSuperficie
                  accessibilityRole="button"
                  accessibilityLabel={`Ver el perfil de @${lista.dueño.username}`}
                  onPress={() => router.push(`/perfil/${lista.dueño.username}`)}
                  className="mx-6 mb-5 flex-row items-center gap-3 self-start rounded-full bg-card py-1.5 pl-1.5 pr-4 active:opacity-80"
                >
                  <Avatar name={inicialesDueño} path={lista.dueño.avatarPath} size={28} />
                  <Text className="text-muted-foreground text-footnote" numberOfLines={1}>
                    Una lista de{' '}
                    <Text className="text-foreground font-semibold">{nombreDueño}</Text>
                  </Text>
                </BotonSuperficie>

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
                  <View className="gap-2">
                    <TrackColumnHeader bpm />
                    {tracks.map((track, i) => {
                      const download = HAY_DESCARGAS ? entradaDeTrack(track, descargas) : null
                      const options = opcionesDe(track, download)
                      return <View key={track.id} style={activeMix?.mix && tracks[i + 1] ? { gap: 8 } : undefined}>
                        <TrackRow
                          index={i}
                          title={track.title}
                          artist={track.artist}
                          bpm={bpms.get(track.audioPath) ?? null}
                          downloaded={download?.descarga.estado === 'lista' && !download.descarga.temporal}
                          artwork={artworkSource(track.artworkPath, track.artworkUrl, 96)}
                          durationMs={track.durationMs}
                          sounding={suenaAca(track)}
                          playing={suenaAca(track) && suena}
                          onPlay={() => play(i)}
                          menu={options}
                          trailing={options.length ? <Menu items={options} label={`Opciones de ${track.title}`} size={14} /> : null}
                        />
                        {activeMix?.mix && tracks[i + 1] ? <PlaylistTransitionRow
                          from={track.title} to={tracks[i + 1].title}
                          preset={transitionsByPair.get(`${track.id}:${tracks[i + 1].id}`)?.preset ?? activeMix.mix.defaultPreset}
                          durationMs={transitionsByPair.get(`${track.id}:${tracks[i + 1].id}`)?.durationMs ?? activeMix.mix.defaultDurationMs}
                          onPress={() => router.push({ pathname: '/lista/mix', params: {
                            id: id!, nombre: lista.playlist.name, fromTrackId: track.id,
                          } })} /> : null}
                      </View>
                    })}
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        </Panel>
      </View>
      <Confirmar visible={!!porQuitar && porQuitar.playlistId === lista?.playlist.id}
        titulo="¿Quitar de la lista?"
        mensaje={porQuitar ? `«${porQuitar.title}» dejará de aparecer en «${lista?.playlist.name ?? 'esta lista'}».` : ''}
        rotulo="Quitar"
        onCancelar={() => setPorQuitar(null)}
        onConfirmar={() => { const trackId = porQuitar?.trackId; setPorQuitar(null); if (trackId) void quitar(trackId) }} />
    </SafeAreaView>
  )
}
