import { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, Pressable, Text, TextInput, View } from 'react-native'
import { artworkSource } from '../lib/artwork'
import {
  listTracks,
  removeTrack,
  type Playlist,
  type PlaylistTrack,
  type Visibilidad,
} from '../services/playlists'
import type { TrackResult } from '../services/music'
import { Sugerencias } from './Sugerencias'
import {
  playAt,
  playQueue,
  toggleShuffle,
  syncQueue,
  togglePlayback,
  usePlaybackTrack,
  useManualPlaying,
  usePlaybackIndex,
  usePlaybackOriginId,
  useShuffle,
  useWantPlay,
} from '../state/playback'
import { usePiso, useTecho } from '../state/shell'
import { addShowcase } from '../services/showcases'
import { getSupabase } from '../lib/supabase'
import { useColapso } from './useColapso'
import { FormError } from './Button'
import { CollectionHeader, CollectionTitle, Insignia, useAngosto, useCoverSize } from './CollectionHeader'
import { TECLADO_FISICO } from '../lib/teclado'
import { compartirLista } from '../lib/compartirLista'
import { Menu, type MenuItem } from './Menu'
import { Panel } from './Panel'
import { Vacio } from './Vacio'
import { PlaylistCover } from './PlaylistCover'
import { formatLength } from './SeekBar'
import { SkeletonList } from './Skeleton'
import { TrackColumnHeader, TrackRow } from './TrackRow'
import {
  ICON_COLOR,
  IconClose,
  IconDownload,
  IconDownloaded,
  IconGlobe,
  IconImage,
  IconMusic,
  IconPause,
  IconLock,
  IconPencil,
  IconPlay,
  IconPlus,
  IconShare,
  IconShuffle,
  IconTrash,
  IconUser,
} from './icons'
import {
  descargar,
  descargarLista,
  HAY_DESCARGAS,
  quitarDescarga,
  quitarLista,
  resumenLista,
  useDescargas,
  type Descarga,
} from '../state/descargas'

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
  onPublicar,
  onDelete,
  onClose,
  onSearch,
  onSubirArchivo,
  menuFor,
  onAddSugerencia,
  onPlaySugerencia,
  pendingId = null,
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
  /**
   * Publicar la lista o volver a guardarla.
   *
   * Lo hace la pantalla y no esta pieza porque después hay que releer la
   * biblioteca: la marca de «pública» viaja en el objeto `playlist`, y sin
   * recargar el menú seguiría ofreciendo lo que ya se hizo.
   */
  onPublicar: (visibilidad: Visibilidad) => Promise<void>
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
   * Subir un archivo de audio de la compu a esta lista. Solo viene en la web
   * de escritorio: sin esto, la fila del menú no existe.
   */
  onSubirArchivo?: () => void
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
  /**
   * Sumar una sugerencia del pie a esta lista, y escucharla sin sumar.
   *
   * Los implementa la pantalla porque resolver el audio y encolar son cosas
   * que la lista no sabe hacer — son los mismos caminos que usa el buscador.
   * Sin estos dos, la sección de sugerencias no se dibuja.
   */
  onAddSugerencia?: (track: TrackResult) => void
  onPlaySugerencia?: (track: TrackResult) => void
  /** Canción que se está resolviendo, para mostrarla ocupada en el pie. */
  pendingId?: string | null
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
  /*
   * Mientras se relee la misma lista, **se sigue mostrando lo que había**.
   *
   * `fresh` decide si hay que volver a pedir; qué mostrar lo decide solo el id.
   * Antes las dos cosas iban juntas, y agregar una canción —que sube el token—
   * tiraba las filas cargadas: la lista entera volvía al esqueleto y el pie de
   * sugerencias se desmontaba, perdía su tanda y pedía otra de cero. Por una
   * canción sumada, segundos de esqueleto en dos lugares.
   */
  const tracks = loaded?.playlistId === playlist.id ? loaded.tracks : null
  const [error, setError] = useState<string | null>(null)
  /** Fila bajo el cursor: es lo que destapa los íconos, como en Spotify. */
  const [hovered, setHovered] = useState<string | null>(null)
  /**
   * Qué lista se está renombrando, no un simple «sí o no».
   *
   * Guarda el id porque la cabecera no se desmonta al cambiar de lista: con un
   * booleano, empezar a renombrar una y saltar a otra dejaba el campo abierto
   * sobre la segunda **con el nombre de la primera adentro** —el borrador vive
   * en el campo y `initial` cambiando no lo resetea— y confirmar le ponía a la
   * lista B el nombre de la A.
   */
  const [renaming, setRenaming] = useState<string | null>(null)

  /*
   * Lo que hay bajado, para toda la pantalla.
   *
   * Se lee el índice entero una vez acá y se reparte, en vez de que cada fila se
   * suscriba por su cuenta: el progreso de una descarga cambia cinco veces por
   * segundo y despertaría a las cincuenta filas de la lista igual, pero
   * suscribiéndose cincuenta veces al mismo store.
   */
  const { items: descargas } = useDescargas()

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
    /*
     * Bajar o quitar del teléfono, una canción sola.
     *
     * Es la misma acción que el botón de la cabecera pero por tema, porque no
     * siempre se quiere la lista entera: alcanza con los cuatro que uno va a
     * escuchar en el avión. Va en el menú y no como un control fijo en la fila
     * —donde ya están los tres puntos y el indicador— porque es algo que se hace
     * una vez y después se olvida.
     */
    ...(HAY_DESCARGAS
      ? [
          descargas[track.audioPath]
            ? {
                label: 'Quitar la descarga',
                onPress: () => quitarDescarga(track.audioPath),
                sfSymbol: 'arrow.down.circle.fill' as const,
              }
            : {
                label: 'Descargar',
                onPress: () => descargar(track),
                sfSymbol: 'arrow.down.circle' as const,
              },
        ]
      : []),
    {
      label: 'Quitar de la lista',
      onPress: () => void drop(track.id),
      destructive: true,
      sfSymbol: 'minus.circle' as const,
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
  const bajado = resumenLista(tracks ?? [], descargas)

  /**
   * El botón de la cabecera: baja la lista entera, o la saca del teléfono.
   *
   * Es un interruptor y no dos botones, como en Spotify. Con algo a medio bajar,
   * apagarlo cancela **y borra lo que ya había** — que suena drástico pero es lo
   * correcto: el estado del botón dice «esta lista está en el teléfono», y dejar
   * media lista bajada haría que dijera algo que no es cierto. Y volver a bajarla
   * es tocar el mismo botón.
   */
  function alternarDescarga() {
    const lista = tracks ?? []
    if (!lista.length) return
    if (bajado.listas === lista.length || bajado.bajando > 0) quitarLista(lista)
    else descargarLista(lista)
  }
  const piso = usePiso(16)
  /* El encabezado del teléfono flota: la cabecera de la lista arranca debajo
     y pasa por detrás del velo al desplazar. En escritorio vale 0. */
  const techo = useTecho()
  const colapso = useColapso()
  const publica = playlist.visibilidad === 'publica'
  const menu: MenuItem[] = [
    {
      label: 'Cambiar la portada',
      onPress: onPickCover,
      icon: <IconImage size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'photo',
    },
    {
      label: 'Cambiar el nombre',
      onPress: () => setRenaming(playlist.id),
      icon: <IconPencil size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'pencil',
    },
    /*
     * Publicar y compartir, en ese orden y juntas.
     *
     * La fila dice a qué estado te lleva —«Hacer pública» cuando es privada—,
     * no en cuál estás: es el mismo criterio que el resto del menú, donde cada
     * fila nombra lo que va a pasar al tocarla.
     *
     * «Compartir el link» aparece **solo si ya es pública**. Un link a algo
     * que nadie más puede abrir es un link roto, y ofrecerlo antes empujaría a
     * mandarlo sin haber publicado.
     */
    {
      label: publica ? 'Hacer privada' : 'Hacer pública',
      onPress: () => void onPublicar(publica ? 'privada' : 'publica'),
      icon: publica ? (
        <IconLock size={15} color={ICON_COLOR.muted} />
      ) : (
        <IconGlobe size={15} color={ICON_COLOR.muted} />
      ),
      sfSymbol: publica ? 'lock' : 'globe',
    },
    ...(publica
      ? [
          {
            label: 'Compartir el link',
            onPress: () => void compartirLista(playlist.id, playlist.name),
            icon: <IconShare size={15} color={ICON_COLOR.muted} />,
            sfSymbol: 'square.and.arrow.up' as const,
          },
        ]
      : []),
    /* Solo llega en la web de escritorio, donde hay archivos que elegir: en el
       teléfono la fila no aparece. Ver `subirArchivoALista` en la pantalla. */
    ...(onSubirArchivo
      ? [
          {
            label: 'Agregar un archivo de audio',
            onPress: onSubirArchivo,
            icon: <IconPlus size={15} color={ICON_COLOR.muted} />,
            sfSymbol: 'square.and.arrow.down' as const,
          },
        ]
      : []),
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
             detrás del material. Arriba, lo mismo con el encabezado. */
          contentContainerStyle={{ paddingTop: techo, paddingBottom: piso }}
          {...colapso}
          ListHeaderComponent={
            <Header
              playlist={playlist}
              renaming={renaming === playlist.id}
              onRenamed={async (next) => {
                setRenaming(null)
                if (next !== null)
                  await onRename(next).catch(() => setError('No se pudo renombrar.'))
              }}
              total={total}
              totalMs={tracks?.reduce((sum, t) => sum + t.durationMs, 0) ?? playlist.totalMs}
              playing={isMine && soundingPlay}
              menu={menu}
              bajado={bajado}
              onDescarga={alternarDescarga}
              onPlay={() => (total > 0 ? play(isMine ? soundingIndex : 0) : undefined)}
              onPickCover={onPickCover}
              onRename={() => setRenaming(playlist.id)}
            >
              {error ? (
                <View className="px-6 pb-3">
                  <FormError message={error} />
                </View>
              ) : null}

              {total > 0 ? <TrackColumnHeader /> : null}
            </Header>
          }
          /*
           * Las sugerencias van como pie de la misma FlatList, no como un
           * bloque aparte debajo: así llegan con el scroll natural de la
           * lista, después de la última canción — que es donde las pone
           * Spotify y donde uno ya está mirando cuando se le acabó lo suyo.
           */
          ListFooterComponent={
            tracks?.length && onAddSugerencia && onPlaySugerencia ? (
              <Sugerencias
                playlistId={playlist.id}
                enLista={tracks}
                onAdd={onAddSugerencia}
                onPlay={onPlaySugerencia}
                pendingId={pendingId}
              />
            ) : null
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
              <Vacio
                compacto
                icono={<IconMusic size={20} color={ICON_COLOR.muted} />}
                titulo="La lista está vacía"
                detalle={`Todavía no hay nada en «${playlist.name}». Buscá una canción y sumala.`}
                accion={onSearch ? { rotulo: 'Buscá una canción', onPress: onSearch } : undefined}
              />
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
                <>
                  <MarcaDescarga descarga={descargas[item.audioPath]} />
                  <Menu
                    items={opcionesDe(item)}
                    label={`Opciones de ${item.title}`}
                    size={14}
                  />
                </>
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
  bajado,
  onDescarga,
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
  /** Cuánto de la lista está en el teléfono. Ver `resumenLista`. */
  bajado: ReturnType<typeof resumenLista>
  onDescarga: () => void
  onPlay: () => void
  onPickCover: () => void
  children: React.ReactNode
}) {
  /* El aleatorio es global —una sola cola suena a la vez— así que se lee del
     store y no viaja como prop desde la pantalla. Por su selector propio y no
     con el estado entero: la cabecera no puede redibujarse con la posición. */
  const aleatorio = useShuffle()
  const [overCover, setOverCover] = useState(false)
  const cover = useCoverSize()

  return (
    <View>
      <CollectionHeader
        kind="Lista"
        /* Publicada se dice arriba, al lado del rótulo: es qué clase de lista
           es, no un dato más de la lista. */
        insignia={
          playlist.visibilidad === 'publica' ? (
            <Insignia icono={<IconGlobe size={10} color={ICON_COLOR.muted} />}>Pública</Insignia>
          ) : undefined
        }
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
            /* Con clave: cambiar de lista con el campo abierto tiene que
               empezar un borrador nuevo, no seguir el de la anterior. */
            <NameField key={playlist.id} initial={playlist.name} onDone={onRenamed} />
          ) : (
            <TituloEditable name={playlist.name} onRename={onRename} />
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
            {/*
             * Lineal o aleatorio, al lado de reproducir.
             *
             * Va acá y no escondido en el menú porque es una decisión que se
             * toma **al poner la lista**, no una preferencia que se configura una
             * vez: hay listas que uno quiere en su orden —un disco, algo armado
             * para escuchar seguido— y otras que solo tienen sentido barajadas.
             *
             * Se marca por luminancia y no por color: encendido es el blanco de
             * `primary`, que en este sistema **es** el acento (`docs/DESIGN.md`).
             * Apagado queda en gris, como cualquier control inactivo.
             */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={aleatorio ? 'Reproducir en orden' : 'Reproducir al azar'}
              accessibilityState={{ selected: aleatorio }}
              onPress={toggleShuffle}
              disabled={total === 0}
              className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
            >
              <IconShuffle
                size={19}
                color={
                  total === 0
                    ? ICON_COLOR.muted
                    : aleatorio
                      ? ICON_COLOR.foreground
                      : ICON_COLOR.muted
                }
              />
            </Pressable>
            <BotonDescarga total={total} bajado={bajado} onPress={onDescarga} />
            <Menu items={menu} label={`Opciones de ${playlist.name}`} size={17} />
          </>
        }
      />

      {children}
    </View>
  )
}

/**
 * Bajar la lista al teléfono, o sacarla.
 *
 * Va al lado de reproducir y del aleatorio porque es del mismo orden de cosa:
 * algo que se decide sobre **esta** lista, mirándola. Escondido en el menú de
 * los tres puntos nadie lo encontraría, y es la única forma de que la música
 * funcione sin señal.
 *
 * Mientras baja muestra el porcentaje en vez de un ícono. Una rueda girando dice
 * «esperá» sin decir cuánto, y bajar un disco entero con datos móviles puede ser
 * un rato largo — el número es lo que deja decidir si vale la pena esperar.
 *
 * El estado se marca por luminancia, como todo el resto: bajada es el blanco de
 * `primary`, sin bajar es el gris de los controles inactivos. Ver `docs/DESIGN.md`.
 */
function BotonDescarga({
  total,
  bajado,
  onPress,
}: {
  total: number
  bajado: ReturnType<typeof resumenLista>
  onPress: () => void
}) {
  if (!HAY_DESCARGAS) return null

  const completa = total > 0 && bajado.listas === total
  const enCurso = bajado.bajando > 0
  const vacia = total === 0

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        enCurso
          ? `Descargando, ${Math.round(bajado.progreso * 100)} por ciento. Tocá para cancelar`
          : completa
            ? 'Quitar la descarga'
            : 'Descargar la lista'
      }
      accessibilityState={{ selected: completa }}
      onPress={onPress}
      disabled={vacia}
      className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
    >
      {enCurso ? (
        <Text className="text-foreground text-[11px] font-semibold tabular-nums">
          {Math.round(bajado.progreso * 100)}%
        </Text>
      ) : completa ? (
        <IconDownloaded size={19} color={ICON_COLOR.foreground} />
      ) : (
        <IconDownload size={19} color={ICON_COLOR.muted} />
      )}
    </Pressable>
  )
}

/**
 * La marca de «esta la tenés bajada», al final de la fila.
 *
 * Es de solo mirar: lo que se puede hacer con ella está en el menú de la propia
 * canción. Un control más en la fila competiría con los tres puntos por el mismo
 * rincón, y en el teléfono ese rincón ya está justo.
 */
function MarcaDescarga({ descarga }: { descarga: Descarga | undefined }) {
  if (!HAY_DESCARGAS || !descarga) return null

  return (
    <View className="mr-1">
      {descarga.estado === 'lista' ? (
        <IconDownloaded size={13} color={ICON_COLOR.muted} />
      ) : descarga.estado === 'bajando' ? (
        <Text className="text-muted-foreground text-[10px] tabular-nums">
          {Math.round(descarga.progreso * 100)}%
        </Text>
      ) : (
        /* En espera: el ícono a media luz dice «va a bajar» sin fingir progreso
           con un 0% que se queda quieto. */
        <View style={{ opacity: 0.5 }}>
          <IconDownload size={13} color={ICON_COLOR.muted} />
        </View>
      )}
    </View>
  )
}

/**
 * El nombre en reposo, que además es el botón para cambiarlo.
 *
 * Es donde uno va a hacer clic cuando quiere renombrar, así que ahí tiene que
 * poder hacerlo — el menú de los tres puntos es el otro camino, no el único.
 * Pero un texto que reacciona al clic sin avisar es una función escondida: bajo
 * el cursor aparece el lápiz y el nombre baja de brillo, que es lo mismo que ya
 * hace la portada de al lado.
 *
 * El lápiz **ocupa su lugar siempre**, transparente cuando no hay cursor: si
 * apareciera de la nada, el título se correría justo cuando lo vas a apuntar.
 */
function TituloEditable({ name, onRename }: { name: string; onRename: () => void }) {
  const [over, setOver] = useState(false)
  const angosto = useAngosto()

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Cambiar el nombre de ${name}`}
      onPress={onRename}
      onPointerEnter={() => setOver(true)}
      onPointerLeave={() => setOver(false)}
      className={`flex-row items-center gap-2 rounded-lg active:opacity-70 ${
        angosto ? 'justify-center' : ''
      }`}
      style={{ opacity: over ? 0.75 : 1 }}
    >
      <View className="min-w-0 shrink">
        <CollectionTitle>{name}</CollectionTitle>
      </View>
      <View style={{ opacity: over ? 1 : 0 }}>
        <IconPencil size={angosto ? 15 : 18} color={ICON_COLOR.muted} />
      </View>
    </Pressable>
  )
}

/**
 * El nombre, mientras se edita.
 *
 * **Sale con el mismo cuerpo y la misma alineación que el título que
 * reemplaza**: entrar a renombrar no puede cambiarle el tamaño a lo que estás
 * mirando ni moverlo de lugar. Por eso el margen negativo — el campo tiene su
 * relleno para que el fondo respire, y sin corrimiento el texto arrancaría
 * doce píxeles a la derecha de donde estaba.
 *
 * El texto **arranca seleccionado**: nueve de cada diez veces renombrar es
 * cambiar el nombre entero, no corregirle una letra, y sin esto había que
 * borrarlo a mano antes de escribir. Para corregir una letra alcanza con hacer
 * clic donde va el cursor, que es lo que uno hace igual.
 *
 * Guarda al salir del campo y no solo con Enter. Antes, salir cancelaba: uno
 * escribía el nombre nuevo, hacía clic en cualquier lado y volvía el viejo sin
 * decir nada — se sentía roto, no cauteloso. Escape sigue estando para
 * arrepentirse a propósito, y el pie lo dice en vez de que haya que adivinarlo.
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
  const angosto = useAngosto()
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
  const guardar = () => finish(trimmed && trimmed !== initial ? trimmed : null)

  return (
    <View className={angosto ? 'w-full items-center gap-1' : 'gap-1'}>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        autoFocus
        selectTextOnFocus
        maxLength={60}
        accessibilityLabel="Nombre de la lista"
        // Un nombre vacío, o el mismo de antes, no es un cambio: se cancela.
        onSubmitEditing={guardar}
        onBlur={guardar}
        onKeyPress={(e) => {
          if (e.nativeEvent.key === 'Escape') finish(null)
        }}
        className={`self-stretch rounded-lg bg-muted text-foreground font-bold ${
          angosto ? 'px-3 py-1 text-center text-2xl' : 'px-3 py-0.5 text-4xl'
        }`}
        // El anillo de foco del navegador ya lo apaga `global.css` para todo
        // campo de texto; acá solo queda correr el relleno.
        style={angosto ? null : { marginLeft: -12 }}
      />
      <Text className={`text-muted-foreground text-[11px] ${angosto ? 'text-center' : ''}`}>
        {TECLADO_FISICO ? 'Enter para guardar · Esc para cancelar' : 'Tocá afuera para guardar'}
      </Text>
    </View>
  )
}
