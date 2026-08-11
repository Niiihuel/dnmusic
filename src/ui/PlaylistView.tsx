import { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, Pressable, Text, TextInput, View } from 'react-native'
import { artworkSource } from '../lib/artwork'
import { listTracks, removeTrack, type Playlist, type PlaylistTrack } from '../services/playlists'
import {
  playAt,
  playQueue,
  syncQueue,
  togglePlayback,
  usePlaybackTrack,
  useManualPlaying,
  usePlaybackIndex,
  usePlaybackOriginId,
  useWantPlay,
} from '../state/playback'
import { usePiso } from '../state/shell'
import { addShowcase } from '../services/showcases'
import { getSupabase } from '../lib/supabase'
import { useColapso } from './useColapso'
import { FormError } from './Button'
import { CollectionHeader, CollectionTitle, useCoverSize } from './CollectionHeader'
import { Menu, type MenuItem } from './Menu'
import { Panel } from './Panel'
import { PlaylistCover } from './PlaylistCover'
import { formatLength } from './SeekBar'
import { SkeletonList } from './Skeleton'
import { TrackColumnHeader, TrackRow } from './TrackRow'
import {
  ICON_COLOR,
  IconClose,
  IconImage,
  IconMusic,
  IconPause,
  IconPencil,
  IconPlay,
  IconSearch,
  IconTrash,
  IconUser,
} from './icons'

/**
 * Una lista, en el panel del medio.
 *
 * Ocupa el mismo lugar que el chat, no una pantalla aparte: la música es otro
 * modo de la app, no otra app. La cabecera grande con la portada, el botón
 * redondo de reproducir y la tabla de canciones vienen de Spotify; los grises
 * y el acento blanco, de nuestro `docs/DESIGN.md`.
 */
export function PlaylistView({
  playlist,
  reloadToken,
  onChanged,
  onPickCover,
  onRename,
  onDelete,
  onClose,
  onSearch,
  menuFor,
}: {
  playlist: Playlist
  /**
   * Cambia cuando alguien de afuera le sumó una canción —el buscador de
   * arriba, por ejemplo— y hay que releer. La pantalla no puede avisarlo por
   * el objeto `playlist`, que solo trae el conteo.
   */
  reloadToken: number
  /** Cambió el contenido: quien la abrió recarga la biblioteca. */
  onChanged: () => void
  onPickCover: () => void
  onRename: (name: string) => Promise<void>
  onDelete: () => void
  onClose: () => void
  /**
   * Mandar el cursor al buscador de arriba.
   *
   * La lista no tiene buscador propio: el de arriba ya sabe a qué lista sumar
   * —lo dice en su propio texto— y tener dos era pedirle a quien mira que
   * eligiera entre dos formas de hacer lo mismo.
   */
  onSearch?: () => void
  /**
   * Las opciones de una canción: ir al artista, encolarla, sumarla a otra lista.
   *
   * Las arma la pantalla porque dependen de cosas que la lista no conoce —a
   * dónde se puede navegar, qué otras listas tenés—. Son las mismas que en el
   * buscador y en la página de un artista: una canción ofrece lo mismo en toda
   * la app, esté guardada o no. «Quitar de la lista» se agrega acá abajo, que
   * es lo único que solo se puede hacer desde adentro.
   */
  menuFor?: (track: PlaylistTrack) => MenuItem[]
}) {
  /*
   * Las canciones se guardan **junto al id de su lista**.
   *
   * Así "todavía no cargaron" es simplemente "lo que tengo no es de esta
   * lista", sin resetear desde un efecto — y una respuesta que llega tarde
   * nunca se muestra bajo la lista equivocada. Mismo criterio que la búsqueda
   * y que la URL firmada de la barra.
   */
  const [loaded, setLoaded] = useState<{
    playlistId: string
    token: number
    tracks: PlaylistTrack[]
  } | null>(null)
  const fresh = loaded?.playlistId === playlist.id && loaded.token === reloadToken
  const tracks = fresh ? loaded.tracks : null
  const [error, setError] = useState<string | null>(null)
  /** Fila bajo el cursor: es lo que destapa los íconos, como en Spotify. */
  const [hovered, setHovered] = useState<string | null>(null)
  /** El nombre se edita en su lugar, no en un diálogo aparte. */
  const [renaming, setRenaming] = useState(false)

  const soundingId = usePlaybackOriginId()
  const soundingIndex = usePlaybackIndex()
  const soundingPlay = useWantPlay()
  const soundingTrack = usePlaybackTrack()
  // Con algo encolado a mano sonando, ninguna fila de la lista es la que suena.
  const onManual = useManualPlaying()
  const isMine = soundingId === playlist.id && !onManual

  /**
   * Si esta fila es la que está sonando.
   *
   * Cuando la cola salió de esta lista alcanza el índice. Pero la misma canción
   * puede estar sonando desde otro lado —se la buscó arriba, o salió de un
   * álbum— y seguir siendo *esta*: ahí se la reconoce por el video. Antes la
   * fila se quedaba muda mientras el tema sonaba, que es justamente el momento
   * en que uno mira la lista para ver dónde está parado.
   */
  const isSounding = (track: PlaylistTrack, index: number) =>
    isMine ? soundingIndex === index : soundingTrack?.videoId === track.videoId

  const refresh = useCallback(async () => {
    const next = await listTracks(playlist.id)
    setLoaded({ playlistId: playlist.id, token: reloadToken, tracks: next })
    syncQueue(playlist.id, next)
    onChanged()
  }, [playlist.id, reloadToken, onChanged])

  useEffect(() => {
    if (fresh) return
    let alive = true
    const id = playlist.id
    const token = reloadToken
    listTracks(id)
      .then((t) => alive && setLoaded({ playlistId: id, token, tracks: t }))
      .catch(() => alive && setError('No se pudieron cargar las canciones.'))
    return () => {
      alive = false
    }
  }, [playlist.id, reloadToken, fresh])

  async function drop(trackId: string) {
    // La cola se reacomoda sola: quitar una canción de más arriba no tiene por
    // qué cortar lo que suena, y solo se frena si se borró justamente eso.
    await removeTrack(trackId).catch(() => setError('No se pudo quitar la canción.'))
    await refresh()
  }

  /** Tocar una fila: manda esta lista a la barra desde esa canción. */
  function play(at: number) {
    if (isMine) playAt(at)
    /* Ya suena esta misma canción, pero venida de otro lado: tocarla pausa o
       sigue, como en el buscador. Volver a encolar la lista la reiniciaría
       desde cero y no hay nada en la pantalla que anticipe ese salto. */
    else if (tracks?.[at] && soundingTrack?.videoId === tracks[at].videoId) togglePlayback()
    else if (tracks) playQueue(tracks, at, { id: playlist.id, name: playlist.name })
  }

  /** Lo que ofrece una canción de esta lista, para el botón y para el gesto. */
  const opcionesDe = (track: PlaylistTrack): MenuItem[] => [
    ...(menuFor?.(track) ?? []),
    {
      label: 'Quitar de la lista',
      onPress: () => void drop(track.id),
      destructive: true,
      sfSymbol: 'minus.circle',
    },
  ]

  /**
   * Fija esta lista como vitrina del perfil.
   *
   * Guarda solo el id: el nombre y la tapa se leen al dibujarla, así que
   * renombrarla o cambiarle la portada se refleja solo. Guardar una copia dejaría
   * el perfil mostrando un nombre viejo — es el mismo criterio que usa el
   * historial de navegación con las listas.
   */
  async function fijarLista() {
    const { data } = await getSupabase().auth.getUser()
    const me = data.user?.id
    if (!me) return
    await addShowcase(me, 'lista', { playlistId: playlist.id }).catch(() =>
      setError('No se pudo fijar la lista.'),
    )
  }

  const total = tracks?.length ?? 0
  const piso = usePiso(16)
  const colapso = useColapso()
  const menu: MenuItem[] = [
    {
      label: 'Cambiar la portada',
      onPress: onPickCover,
      icon: <IconImage size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'photo',
    },
    {
      label: 'Cambiar el nombre',
      onPress: () => setRenaming(true),
      icon: <IconPencil size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'pencil',
    },
    {
      label: 'Cerrar la lista',
      onPress: onClose,
      icon: <IconClose size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'xmark',
    },
    {
      label: 'Fijar en mi perfil',
      onPress: () => void fijarLista(),
      icon: <IconUser size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'pin',
    },
    {
      label: 'Borrar la lista',
      onPress: onDelete,
      destructive: true,
      icon: <IconTrash size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'trash',
    },
  ]

  return (
    <Panel className="flex-1">
      <View className="min-h-0 flex-1">
        <FlatList
          data={tracks ?? []}
          keyExtractor={(t) => t.id}
          className="min-h-0 flex-1"
          contentContainerClassName="gap-1"
          /* Lo que ocupan el reproductor y las pestañas: la última canción
             tiene que quedar al alcance, aunque las de arriba pasen por
             detrás del material. */
          contentContainerStyle={{ paddingBottom: piso }}
          {...colapso}
          ListHeaderComponent={
            <Header
              playlist={playlist}
              renaming={renaming}
              onRenamed={async (next) => {
                setRenaming(false)
                if (next !== null)
                  await onRename(next).catch(() => setError('No se pudo renombrar.'))
              }}
              total={total}
              totalMs={tracks?.reduce((sum, t) => sum + t.durationMs, 0) ?? playlist.totalMs}
              playing={isMine && soundingPlay}
              menu={menu}
              onPlay={() => (total > 0 ? play(isMine ? soundingIndex : 0) : undefined)}
              onPickCover={onPickCover}
              onRename={() => setRenaming(true)}
            >
              {error ? (
                <View className="px-6 pb-3">
                  <FormError message={error} />
                </View>
              ) : null}

              {total > 0 ? <TrackColumnHeader /> : null}
            </Header>
          }
          ListEmptyComponent={
            tracks === null ? (
              <View className="px-6">
                <SkeletonList rows={5} />
              </View>
            ) : (
              /*
               * La lista vacía manda al buscador de arriba, que es el único de
               * la app.
               *
               * Antes tenía uno propio adentro, con su campo y su desplegable:
               * dos buscadores en la misma pantalla, con distinta forma de
               * agregar y sin manera de saber cuál usar. Este botón pone el
               * cursor en el de arriba, que ya sabe a qué lista sumar.
               */
              <View className="items-center gap-4 px-8 py-12">
                <IconMusic size={22} color={ICON_COLOR.muted} />
                <Text className="text-muted-foreground text-center text-[13px] leading-5">
                  Todavía no hay nada en «{playlist.name}».
                </Text>
                {onSearch ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Buscar una canción para sumar"
                    onPress={onSearch}
                    className="h-10 flex-row items-center gap-2 rounded-full bg-muted px-4 active:opacity-70"
                  >
                    <IconSearch size={15} color={ICON_COLOR.foreground} />
                    <Text className="text-foreground text-[13px] font-semibold">
                      Buscá una canción
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            )
          }
          renderItem={({ item, index }) => (
            <TrackRow
              index={index}
              title={item.title}
              artist={item.artist}
              artwork={artworkSource(item.artworkPath, item.artworkUrl, 96)}
              durationMs={item.durationMs}
              sounding={isSounding(item, index)}
              playing={isSounding(item, index) && soundingPlay}
              hovered={hovered === item.id}
              onHover={(on) => setHovered(on ? item.id : null)}
              onPlay={() => play(index)}
              /* La misma lista por los dos caminos: los tres puntos y el
                 mantener apretado. Armarla acá una sola vez es lo que evita que
                 con el tiempo ofrezcan cosas distintas. */
              menu={opcionesDe(item)}
              /* Va siempre: `TrackRow` decide si se ve —en el teléfono sí, en
                 escritorio bajo el cursor—. Antes se decidía acá con `hovered`
                 y en el teléfono no aparecía nunca. */
              trailing={
                <Menu
                  items={opcionesDe(item)}
                  label={`Opciones de ${item.title}`}
                  size={14}
                />
              }
            />
          )}
        />
      </View>
    </Panel>
  )
}

/** La cabecera grande: portada, nombre y los controles de la lista. */
function Header({
  playlist,
  renaming,
  onRenamed,
  total,
  totalMs,
  playing,
  menu,
  onPlay,
  onPickCover,
  onRename,
  children,
}: {
  playlist: Playlist
  renaming: boolean
  /** `null` cancela sin guardar. */
  onRenamed: (name: string | null) => void
  /** Empezar a editar el nombre. */
  onRename: () => void
  total: number
  totalMs: number
  playing: boolean
  menu: MenuItem[]
  onPlay: () => void
  onPickCover: () => void
  children: React.ReactNode
}) {
  const [overCover, setOverCover] = useState(false)
  const cover = useCoverSize()

  return (
    <View>
      <CollectionHeader
        kind="Lista"
        meta={`${total} ${total === 1 ? 'canción' : 'canciones'}${
          totalMs > 0 ? ` · ${formatLength(totalMs)}` : ''
        }`}
        image={
          /* La portada es el botón para cambiarla: al pasar el cursor se
             oscurece y aparece el ícono, como el avatar del perfil. */
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cambiar la portada"
            onPress={onPickCover}
            onPointerEnter={() => setOverCover(true)}
            onPointerLeave={() => setOverCover(false)}
            className="overflow-hidden rounded-lg"
          >
            <PlaylistCover covers={playlist.covers} coverPath={playlist.coverPath} size={cover} />
            {overCover ? (
              <View className="absolute inset-0 items-center justify-center bg-canvas/70">
                <IconImage size={26} color={ICON_COLOR.foreground} />
              </View>
            ) : null}
          </Pressable>
        }
        title={
          renaming ? (
            <NameField initial={playlist.name} onDone={onRenamed} />
          ) : (
            /* El nombre también se edita tocándolo, no solo desde el menú: es
               donde uno va a hacer clic cuando quiere cambiarlo. */
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cambiar el nombre de la lista"
              onPress={onRename}
              className="rounded-lg active:opacity-70"
            >
              <CollectionTitle>{playlist.name}</CollectionTitle>
            </Pressable>
          )
        }
        actions={
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={playing ? 'Pausar' : 'Reproducir la lista'}
              onPress={onPlay}
              disabled={total === 0}
              className={`h-14 w-14 items-center justify-center rounded-full ${
                total === 0 ? 'bg-muted' : 'bg-primary active:opacity-80'
              }`}
            >
              {playing ? (
                <IconPause
                  size={20}
                  color={total === 0 ? ICON_COLOR.muted : ICON_COLOR.onPrimary}
                />
              ) : (
                <IconPlay size={20} color={total === 0 ? ICON_COLOR.muted : ICON_COLOR.onPrimary} />
              )}
            </Pressable>
            <Menu items={menu} label={`Opciones de ${playlist.name}`} size={17} />
          </>
        }
      />

      {children}
    </View>
  )
}

/**
 * El nombre, mientras se edita.
 *
 * Guarda al salir del campo y no solo con Enter. Antes, salir cancelaba: uno
 * escribía el nombre nuevo, hacía clic en cualquier lado y volvía el viejo sin
 * decir nada — se sentía roto, no cauteloso. Escape sigue estando para
 * arrepentirse a propósito.
 *
 * El texto vive acá adentro y no en el padre porque es un borrador: mientras se
 * escribe no es todavía el nombre de la lista.
 */
function NameField({
  initial,
  onDone,
}: {
  initial: string
  /** `null` cancela sin guardar. */
  onDone: (name: string | null) => void
}) {
  const [draft, setDraft] = useState(initial)
  /* Enter guarda y saca el foco, y ese blur llegaría a guardar de nuevo. Una
     sola salida por edición. */
  const done = useRef(false)
  const finish = (name: string | null) => {
    if (done.current) return
    done.current = true
    onDone(name)
  }
  const trimmed = draft.trim()

  return (
    <TextInput
      value={draft}
      onChangeText={setDraft}
      autoFocus
      maxLength={60}
      accessibilityLabel="Nombre de la lista"
      // Un nombre vacío, o el mismo de antes, no es un cambio: se cancela.
      onSubmitEditing={() => finish(trimmed && trimmed !== initial ? trimmed : null)}
      onBlur={() => finish(trimmed && trimmed !== initial ? trimmed : null)}
      onKeyPress={(e) => {
        if (e.nativeEvent.key === 'Escape') finish(null)
      }}
      className="rounded-lg bg-muted px-3 py-2 text-foreground text-3xl font-bold"
    />
  )
}
