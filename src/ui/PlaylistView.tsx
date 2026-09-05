import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FlatList, Pressable, Text, TextInput, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated'
import { artworkSource } from '../lib/artwork'
import {
  listTracks,
  removeTrack,
  coverUrl,
  type Playlist,
  type PlaylistTrack,
  type Visibilidad,
} from '../services/playlists'
import type { TrackResult } from '../services/music'
import { signedUrl } from '../services/music'
import { avisar } from '../state/aviso'
import { Sugerencias } from './Sugerencias'
import {
  getPlaybackState,
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
import { useJam } from '../state/jam'
import { addShowcase } from '../services/showcases'
import { getSupabase } from '../lib/supabase'
import { useColapso } from './useColapso'
import { FormError } from './Button'
import { CollectionHeader, CollectionTitle, Insignia, useAngosto, useCoverSize } from './CollectionHeader'
import { TECLADO_FISICO } from '../lib/teclado'
import { compartirLista } from '../lib/compartirLista'
import { useColorPortada } from '../lib/colorPortada'
import { SearchField } from './SearchField'
import { useConTooltip } from './Tooltip'
import { Menu, type MenuItem } from './Menu'
import { Panel } from './Panel'
import { Vacio } from './Vacio'
import { PlaylistCover } from './PlaylistCover'
import { ColaboradoresDeLista } from './ColaboradoresDeLista'
import { formatLength } from './SeekBar'
import { SkeletonList } from './Skeleton'
import { TrackColumnHeader, TrackRow } from './TrackRow'
import {
  ICON_COLOR,
  IconClose,
  IconDownload,
  IconDisk,
  IconDownloaded,
  IconGlobe,
  IconImage,
  IconMusic,
  IconPause,
  IconLock,
  IconPencil,
  IconPlay,
  IconPlus,
  IconSearch,
  IconShare,
  IconShuffle,
  IconTrash,
  IconUser,
  IconUsers,
  IconLogOut,
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
/**
 * El puente del escritorio para bajar la lista al disco. La app no importa nada
 * de `desktop/`: si no está, no estamos en la app de PC (o es una vieja sin la
 * función), y el botón no se muestra. Ver `state/actualizacion`, mismo criterio.
 */
type PuenteDescargas = {
  guardarLista: (opciones: {
    archivos: { url: string; nombre: string }[]
    carpetaSugerida?: string
  }) => Promise<{ cancelado?: boolean; carpeta?: string; guardados?: number; fallidos?: number }>
  alDescargar: (
    escuchar: (avance: { hechos: number; total: number; nombre: string }) => void,
  ) => () => void
}
function puenteDescargas(): PuenteDescargas | undefined {
  return (globalThis as { dnmusicEscritorio?: { descargas?: PuenteDescargas } }).dnmusicEscritorio
    ?.descargas
}
const HAY_DESCARGA_ESCRITORIO = puenteDescargas() != null

export function PlaylistView({
  playlist,
  reloadToken,
  onChanged,
  onPickCover,
  onRename,
  onPublicar,
  onDelete,
  onVerGente,
  onColaborar,
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
  /**
   * Abrir la hoja de la gente de una lista colaborativa.
   *
   * Es también por donde se sale de una ajena: la hoja tiene la fila de cada
   * persona con su cruz, y la tuya propia es la de irte. Un «salir» que se
   * ejecutara directo desde el menú te sacaría de un toque, sin ver de qué te
   * estás yendo ni quiénes se quedan.
   */
  onVerGente?: () => void
  onColaborar?: () => void
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
  /* Con un Jam andando, tocar una fila cambia lo que suena para todos. */
  const hayJam = useJam() != null

  /**
   * Si esta fila es la que está sonando.
   *
   * Cuando la cola salió de esta lista alcanza el índice. Pero la misma canción
   * puede estar sonando desde otro lado —se la buscó arriba, o salió de un
   * álbum— y seguir siendo *esta*: ahí se la reconoce por el video. Antes la
   * fila se quedaba muda mientras el tema sonaba, que es justamente el momento
   * en que uno mira la lista para ver dónde está parado.
   */
  /*
   * Sonando pide las dos cosas: la posición **y** que sea la misma canción.
   *
   * Con solo la posición, una cola desalineada marcaba la fila equivocada — que
   * es peor que no marcar ninguna: dice algo falso sobre lo que está pasando.
   * Pedir también el video hace que, ante la duda, no se marque nada.
   */
  const isSounding = (track: PlaylistTrack, index: number) =>
    isMine
      ? soundingIndex === index && soundingTrack?.videoId === track.videoId
      : soundingTrack?.videoId === track.videoId

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
      .then((t) => {
        if (!alive) return
        setLoaded({ playlistId: id, token, tracks: t })
        /*
         * Y se reconcilia la cola con lo que se acaba de leer.
         *
         * La fila marcada como sonando se decide por **posición**
         * (`soundingIndex === index`), así que la cola del reproductor y la
         * lista que se dibuja tienen que ser el mismo array. Al abrir la app,
         * `restorePlayback` devuelve la cola guardada de la sesión anterior con
         * el mismo origen, y si la lista cambió desde entonces las dos
         * numeraciones dejan de coincidir: se marcaba una fila y sonaba otra, y
         * tocar la marcada se leía como «tocaste la que ya suena» y solo
         * pausaba. `syncQueue` reubica el índice por id — antes solo corría al
         * borrar una canción, que es el único momento en que alguien lo llamaba.
         */
        syncQueue(id, t)
      })
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
    if (!tracks?.[at]) return
    /* En un Jam, tocar una fila va **siempre** por la cola compartida
       (`playQueue` la enruta al Jam): cambia lo que suena para todos. El resto
       de los caminos —`playAt`, o el atajo de «misma canción → pausa»— son de
       la reproducción local y acá metían al Jam en un estado que no era: el
       host tocaba una canción y no pasaba nada. */
    if (hayJam) {
      playQueue(tracks, at, { id: playlist.id, name: playlist.name })
      return
    }
    if (isMine) {
      /*
       * `playAt` indexa la cola del reproductor, no esta lista. Si en esa
       * posición hay otra canción, la cola no es esta lista por más que el
       * origen coincida: se rehace desde lo que se está viendo, que es lo que
       * la persona tocó. Sin esto, tocar una fila reproducía otra —o, si
       * caía justo en el índice actual, solo pausaba.
       */
      if (getPlaybackState().tracks[at]?.id === tracks[at].id) playAt(at)
      else playQueue(tracks, at, { id: playlist.id, name: playlist.name })
    }
    /* Ya suena esta misma canción, pero venida de otro lado: tocarla pausa o
       sigue, como en el buscador. Volver a encolar la lista la reiniciaría
       desde cero y no hay nada en la pantalla que anticipe ese salto. */
    else if (soundingTrack?.videoId === tracks[at].videoId) togglePlayback()
    else playQueue(tracks, at, { id: playlist.id, name: playlist.name })
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

  const [buscando, setBuscando] = useState(false)
  const [filtro, setFiltro] = useState('')
  const q = filtro.trim().toLowerCase()
  /* Buscar adentro de la lista: filtra por título y artista sin pedir nada
     —las canciones ya están—. El índice real se guarda aparte para que tocar
     una fila filtrada haga sonar la que es y la numere donde va. */
  const visibles = useMemo(
    () =>
      !q || !tracks
        ? (tracks ?? [])
        : tracks.filter((t) => `${t.title} ${t.artist}`.toLowerCase().includes(q)),
    [tracks, q],
  )
  const indiceReal = useMemo(() => {
    const m = new Map<string, number>()
    ;(tracks ?? []).forEach((t, i) => m.set(t.id, i))
    return m
  }, [tracks])
  function alternarBuscar() {
    /* Los dos setters, uno al lado del otro y ninguno adentro del otro.
       `setFiltro` vivía dentro del updater de `setBuscando`, y un updater
       tiene que ser puro: React puede correrlo más de una vez, y cada corrida
       repetía el efecto. Acá no hace falta el updater —esto es un manejador,
       `buscando` es el de este render— y React agrupa las dos en un solo
       re-render igual. */
    if (buscando) setFiltro('')
    setBuscando(!buscando)
  }

  /* Bajar la lista entera al disco, solo en la app de PC (`HAY_DESCARGA_ESCRITORIO`).
     null = quieta; el objeto lleva el «12 de 40» para pintar el avance. */
  const [guardando, setGuardando] = useState<{ hechos: number; total: number } | null>(null)
  async function guardarTodoEnDisco() {
    const api = puenteDescargas()
    const lista = (tracks ?? []).filter((t) => t.audioPath)
    if (!api || guardando || !lista.length) return
    setGuardando({ hechos: 0, total: lista.length })
    const dejarDeEscuchar = api.alDescargar((a) =>
      setGuardando({ hechos: a.hechos, total: a.total }),
    )
    try {
      /* Las URLs se firman acá —el renderer tiene la sesión—; una que falle no
         voltea la tanda, se saltea. El número adelante conserva el orden de la
         lista en la carpeta. */
      const firmadas = await Promise.all(
        lista.map(async (t, i) => {
          try {
            const url = await signedUrl(t.audioPath)
            return {
              url,
              nombre: `${String(i + 1).padStart(2, '0')} · ${t.artist} - ${t.title}.m4a`,
            }
          } catch {
            return null
          }
        }),
      )
      const archivos = firmadas.filter((a): a is { url: string; nombre: string } => a !== null)
      if (!archivos.length) {
        avisar('No se pudo preparar ninguna canción para bajar.', true)
        return
      }
      const r = await api.guardarLista({ archivos, carpetaSugerida: playlist.name })
      if (r.cancelado) return
      const guardados = r.guardados ?? 0
      const fallidos = r.fallidos ?? 0
      avisar(
        fallidos
          ? `Guardé ${guardados} de ${guardados + fallidos}. Algunas no se pudieron bajar.`
          : `Guardé ${guardados} ${guardados === 1 ? 'canción' : 'canciones'} en la carpeta que elegiste.`,
      )
    } catch {
      avisar('No se pudo descargar la lista.', true)
    } finally {
      dejarDeEscuchar()
      setGuardando(null)
    }
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
  /*
   * De qué imagen sale el color de la cabecera: la portada propia si la hay,
   * si no la primera tapa del mosaico. Es la misma que dibuja `PlaylistCover`,
   * así el degradado y la tapa hablan del mismo color.
   */
  const portadaUri =
    coverUrl(playlist.coverPath) ??
    (playlist.covers[0]
      ? playlist.covers[0].startsWith('http')
        ? playlist.covers[0]
        : artworkSource(playlist.covers[0], null, 240)
      : null)
  const tint = useColorPortada(portadaUri)
  const publica = playlist.visibilidad === 'publica'
  /*
   * Qué se puede hacer con esta lista, según de quién sea.
   *
   * En una colaborativa ajena, la base ya rechaza renombrar, publicar y borrar
   * —son policies de dueño— pero un `update` filtrado por RLS **no falla**:
   * afecta cero filas y vuelve sin error. Ofrecer esas filas sería un menú
   * donde tocar «Cambiar el nombre» no hace nada y tampoco avisa. Se esconden
   * acá, que es donde se sabe.
   */
  const mia = playlist.mia
  const menu: MenuItem[] = [
    ...(mia
      ? [
          {
            label: 'Cambiar la portada',
            onPress: onPickCover,
            icon: <IconImage size={15} color={ICON_COLOR.muted} />,
            sfSymbol: 'photo' as const,
          },
          {
            label: 'Cambiar el nombre',
            onPress: () => setRenaming(playlist.id),
            icon: <IconPencil size={15} color={ICON_COLOR.muted} />,
            sfSymbol: 'pencil' as const,
          },
        ]
      : []),
    ...(mia && !playlist.colaborativa && onColaborar
      ? [
          {
            label: 'Hacer colaborativa',
            onPress: onColaborar,
            icon: <IconUsers size={15} color={ICON_COLOR.muted} />,
            sfSymbol: 'person.2.badge.plus' as const,
          },
        ]
      : []),
    /* La gente, solo si es colaborativa. En una lista común no hay a quién
       mostrar, y la fila sería una promesa vacía. */
    ...(playlist.colaborativa
      ? [
          {
            label: mia ? 'Gente de la lista' : 'Quiénes la escriben',
            onPress: () => onVerGente?.(),
            icon: <IconUsers size={15} color={ICON_COLOR.muted} />,
            sfSymbol: 'person.2' as const,
          },
        ]
      : []),
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
    ...(mia
      ? [
          {
            label: publica ? 'Hacer privada' : 'Hacer pública',
            onPress: () => void onPublicar(publica ? 'privada' : 'publica'),
            icon: publica ? (
              <IconLock size={15} color={ICON_COLOR.muted} />
            ) : (
              <IconGlobe size={15} color={ICON_COLOR.muted} />
            ),
            sfSymbol: (publica ? 'lock' : 'globe') as 'lock' | 'globe',
          },
        ]
      : []),
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
    ...(mia
      ? [
          {
            label: 'Fijar en mi perfil',
            onPress: () => void fijarLista(),
            icon: <IconUser size={15} color={ICON_COLOR.muted} />,
            sfSymbol: 'pin' as const,
          },
          {
            label: 'Borrar la lista',
            onPress: onDelete,
            destructive: true,
            icon: <IconTrash size={15} color={ICON_COLOR.muted} />,
            sfSymbol: 'trash' as const,
          },
        ]
      : [
          /* En una lista ajena lo destructivo no es borrarla —no podés— sino
             irte. Va en el mismo lugar y con la misma marca, porque es la
             misma clase de decisión: la lista te desaparece de la biblioteca. */
          {
            label: 'Salir de la lista',
            onPress: () => onVerGente?.(),
            destructive: true,
            icon: <IconLogOut size={15} color={ICON_COLOR.muted} />,
            sfSymbol: 'rectangle.portrait.and.arrow.right' as const,
          },
        ]),
  ]

  return (
    <Panel className="flex-1">
      <View className="min-h-0 flex-1">
        <FlatList
          data={visibles}
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
              tint={tint}
              bleedTop={techo}
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
              onVerGente={onVerGente}
              bajado={bajado}
              onDescarga={alternarDescarga}
              onPlay={() => (total > 0 ? play(isMine ? soundingIndex : 0) : undefined)}
              onPickCover={onPickCover}
              onRename={() => setRenaming(playlist.id)}
              buscando={buscando}
              filtro={filtro}
              onBuscar={alternarBuscar}
              onFiltro={setFiltro}
              onGuardarTodo={HAY_DESCARGA_ESCRITORIO ? guardarTodoEnDisco : undefined}
              guardando={guardando}
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
            ) : q ? (
              <Vacio
                compacto
                icono={<IconSearch size={20} color={ICON_COLOR.muted} />}
                titulo="Sin resultados"
                detalle={`No encontramos «${filtro.trim()}» en esta lista.`}
              />
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
          renderItem={({ item, index }) => {
            /* El índice de la lista filtrada no sirve para tocar ni numerar:
               se traduce al de la lista entera, que es la cola de verdad. */
            const real = indiceReal.get(item.id) ?? index
            return (
            <TrackRow
              index={real}
              title={item.title}
              artist={item.artist}
              artwork={artworkSource(item.artworkPath, item.artworkUrl, 96)}
              durationMs={item.durationMs}
              sounding={isSounding(item, real)}
              playing={isSounding(item, real) && soundingPlay}
              onPlay={() => play(real)}
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
            )
          }}
        />
      </View>
    </Panel>
  )
}

/** La cabecera grande: portada, nombre y los controles de la lista. */
function Header({
  playlist,
  tint,
  bleedTop,
  renaming,
  onRenamed,
  total,
  totalMs,
  playing,
  menu,
  onVerGente,
  bajado,
  onDescarga,
  onPlay,
  onPickCover,
  onRename,
  buscando,
  filtro,
  onBuscar,
  onFiltro,
  onGuardarTodo,
  guardando,
  children,
}: {
  playlist: Playlist
  tint: string | null
  bleedTop: number
  renaming: boolean
  /** `null` cancela sin guardar. */
  onRenamed: (name: string | null) => void
  /** Empezar a editar el nombre. */
  onRename: () => void
  total: number
  totalMs: number
  playing: boolean
  menu: MenuItem[]
  onVerGente?: () => void
  /** Cuánto de la lista está en el teléfono. Ver `resumenLista`. */
  bajado: ReturnType<typeof resumenLista>
  onDescarga: () => void
  onPlay: () => void
  onPickCover: () => void
  /** El campo de búsqueda de la lista está abierto. */
  buscando: boolean
  filtro: string
  /** Abrir o cerrar la búsqueda (al cerrar, limpia el filtro). */
  onBuscar: () => void
  onFiltro: (v: string) => void
  /** Bajar la lista al disco (solo en la app de PC); sin esto no hay botón. */
  onGuardarTodo?: () => void
  guardando: { hechos: number; total: number } | null
  children: React.ReactNode
}) {
  /* El aleatorio es global —una sola cola suena a la vez— así que se lee del
     store y no viaja como prop desde la pantalla. Por su selector propio y no
     con el estado entero: la cabecera no puede redibujarse con la posición. */
  const aleatorio = useShuffle()
  const [overCover, setOverCover] = useState(false)
  const cover = useCoverSize()
  /* Los rótulos de los controles. Cortos y con la acción: el del disco no puede
     ser la etiqueta accesible, que dice «Descargando, 12 de 40» — eso está
     escrito para escucharse, no para leerse al pasar el mouse. */
  const tipPlay = useConTooltip(playing ? 'Pausar' : 'Reproducir')
  const tipAzar = useConTooltip(aleatorio ? 'Reproducir en orden' : 'Reproducir al azar')
  const tipBuscar = useConTooltip(buscando ? 'Cerrar la búsqueda' : 'Buscar en la lista')
  const tipDisco = useConTooltip(
    guardando ? `Descargando ${guardando.hechos}/${guardando.total}` : 'Bajar la lista al disco',
  )

  return (
    <View>
      <CollectionHeader
        kind="Lista"
        tint={tint}
        bleedTop={bleedTop}
        /* Publicada se dice arriba, al lado del rótulo: es qué clase de lista
           es, no un dato más de la lista. */
        insignia={
          /* Colaborativa gana sobre pública cuando es las dos: acá lo que
             cambia lo que ves —el menú, quién puede sacar canciones— es que la
             escriben entre varios, no que se pueda leer de afuera. */
          playlist.colaborativa ? (
            <Insignia icono={<IconUsers size={10} color={ICON_COLOR.muted} />}>
              {playlist.colaboradores > 0
                ? `Colaborativa · ${playlist.colaboradores + 1}`
                : 'Colaborativa'}
            </Insignia>
          ) : playlist.visibilidad === 'publica' ? (
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
              {...tipPlay.gestos}
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
              {...tipAzar.gestos}
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
            {/*
             * Descargar la lista al disco: solo en la app de PC. Mientras baja
             * muestra «12/40» en vez del ícono —un número que avanza dice que
             * pasa algo, mejor que un disco quieto—. Ver `desktop/src/descargas`.
             */}
            {onGuardarTodo ? (
              <Pressable
                {...tipDisco.gestos}
                accessibilityRole="button"
                accessibilityLabel={
                  guardando
                    ? `Descargando, ${guardando.hechos} de ${guardando.total}`
                    : 'Descargar la lista al disco'
                }
                onPress={onGuardarTodo}
                disabled={total === 0 || guardando !== null}
                className="h-11 min-w-11 items-center justify-center rounded-full px-2 active:bg-muted"
              >
                {guardando ? (
                  <Text className="text-foreground text-[11px] font-semibold tabular-nums">
                    {guardando.hechos}/{guardando.total}
                  </Text>
                ) : (
                  <IconDisk size={19} color={total === 0 ? ICON_COLOR.muted : ICON_COLOR.foreground} />
                )}
              </Pressable>
            ) : null}
            {/*
             * Buscar adentro de la lista, al lado de los otros controles de la
             * lista. Filtra las filas que ya están, sin ir al servidor —el de
             * arriba es para sumar canciones nuevas; este, para encontrar una
             * en una lista larga—. Encendido es el blanco de `primary`, apagado
             * el gris de los inactivos (`docs/DESIGN.md`).
             */}
            <BuscadorDeLista
              abierto={buscando}
              filtro={filtro}
              vacia={total === 0}
              gestos={tipBuscar.gestos}
              onAbrir={onBuscar}
              onFiltro={onFiltro}
            />
            <BotonDescarga total={total} bajado={bajado} onPress={onDescarga} />
            <Menu items={menu} label={`Opciones de ${playlist.name}`} size={17} />
            {playlist.colaborativa && onVerGente ? (
              <ColaboradoresDeLista
                playlistId={playlist.id}
                total={playlist.colaboradores + 1}
                onPress={onVerGente}
              />
            ) : null}
          </>
        }
      />

      {children}
    </View>
  )
}

/** Lo que mide plegado: el ícono con su aire, como los botones de al lado. */
const LADO_LUPA = 44
/** Lo que mide desplegado. Cómodo para escribir sin comerse la fila entera. */
const ANCHO_LUPA = 300
const ABRE_LUPA_MS = 240

/**
 * La lupa que **se despliega en su lugar**, dentro de la fila de controles.
 *
 * Antes abría un campo debajo, de golpe: aparecía una fila nueva entre los
 * controles y la tabla, y todo lo de abajo pegaba un salto. Ahora es una sola
 * pieza que cambia de ancho — el ícono no se mueve y el campo crece hacia la
 * derecha, en la misma altura que reproducir, el azar y los tres puntos.
 *
 * El ancho es fijo y no «lo que sobre»: la fila tiene los otros controles a la
 * derecha y estirarse hasta el final los empujaría de lugar en cada apertura.
 * Trescientos alcanzan para el nombre de cualquier canción.
 */
function BuscadorDeLista({
  abierto,
  filtro,
  vacia,
  gestos,
  onAbrir,
  onFiltro,
}: {
  abierto: boolean
  filtro: string
  /** La lista no tiene canciones: no hay nada que filtrar. */
  vacia: boolean
  /** Los del rótulo al pasar el cursor, mientras está plegada. */
  gestos: object
  onAbrir: () => void
  onFiltro: (v: string) => void
}) {
  const p = useDerivedValue(
    () => withTiming(abierto ? 1 : 0, { duration: ABRE_LUPA_MS, easing: Easing.out(Easing.cubic) }),
    [abierto],
  )
  /* Por `style` y no por `className`: NativeWind no procesa clases en
     componentes de Reanimated (ver la trampa de `docs/DESIGN.md`). */
  const ancho = useAnimatedStyle(() => ({
    width: LADO_LUPA + p.value * (ANCHO_LUPA - LADO_LUPA),
  }))

  return (
    <Animated.View
      style={[{ height: LADO_LUPA, borderRadius: 999, overflow: 'hidden' }, ancho]}
    >
      {abierto ? (
        <SearchField
          value={filtro}
          onChangeText={onFiltro}
          placeholder="Buscar en esta lista"
          autoFocus
          /* Al salir sin nada escrito se vuelve a plegar: abierta y vacía solo
             ocupa lugar. Con algo escrito se queda, que es lo que se mira. */
          onFocusChange={(enfocado) => {
            if (!enfocado && !filtro.trim()) onAbrir()
          }}
        />
      ) : (
        <Pressable
          {...gestos}
          accessibilityRole="button"
          accessibilityLabel="Buscar en la lista"
          onPress={onAbrir}
          disabled={vacia}
          className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
        >
          <IconSearch size={19} color={vacia ? ICON_COLOR.muted : ICON_COLOR.muted} />
        </Pressable>
      )}
    </Animated.View>
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
