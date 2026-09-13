import { BotonSuperficie } from './BotonSuperficie'
import { NativeMediaRow } from '../../modules/media-controls'
import { IconButton } from './IconButton'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FlatList, Text, View } from 'react-native'
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
  syncQueue,
  togglePlayback,
  usePlaybackTrack,
  useManualPlaying,
  usePlaybackIndex,
  usePlaybackOriginId,
  useWantPlay,
} from '../state/playback'
import { usePiso, useTecho } from '../state/shell'
import { useJam } from '../state/jam'
import { addShowcase } from '../services/showcases'
import { getSupabase } from '../lib/supabase'
import { useColapso } from './useColapso'
import { FormError } from './Button'
import { CollectionHeader, Insignia, useAngosto, useCoverSize } from './CollectionHeader'
import { AccionesNombreLista, HojaNombreLista, TituloNombreLista, useNombreInline, useRenombrarLista, type EdicionNombreLista } from './RenombrarLista'
import { compartirLista } from '../lib/compartirLista'
import { useColorPortada } from '../lib/colorPortada'
import { BuscadorColeccion, CampoBusquedaColeccion, useBusquedaColeccion } from './BusquedaColeccion'
import { useConTooltip } from './Tooltip'
import { Menu, type MenuItem } from './Menu'
import { entradaDeTrack, menuDescarga, menuDescargasLista, type DescargaUI } from './descargasControl'
import { Panel } from './Panel'
import { ScrollArea } from './ScrollArea'
import { Vacio } from './Vacio'
import { PlaylistCover } from './PlaylistCover'
import { ColaboradoresDeLista } from './ColaboradoresDeLista'
import { formatLength } from './SeekBar'
import { SkeletonList } from './Skeleton'
import { TrackColumnHeader, TrackRow } from './TrackRow'
import { BotonMeGusta } from './BotonMeGusta'
import { BotonAleatorio } from './Transport'
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
  IconTrash,
  IconUser,
  IconUsers,
  IconLogOut,
  IconMinus,
} from './icons'
import {
  descargar,
  descargarLista,
  HAY_DESCARGAS,
  resumenLista,
  useDescargas,
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
  onAgregar,
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
   * Abrir la hoja de «Agregar música»: elegir varias canciones para esta lista.
   *
   * Es la fila «+ Agregar música» al pie de las canciones y la acción de la
   * lista vacía, como en Apple Music. La abre la pantalla porque es una ruta.
   */
  onAgregar?: () => void
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
  const editorNombre = useRenombrarLista(playlist.id, playlist.name, onRename)

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
    ...(HAY_DESCARGAS ? (() => {
      const entrada = entradaDeTrack(track, descargas)
      return entrada && !entrada.descarga.temporal ? menuDescarga(entrada) : [{
        label: 'Descargar para escuchar sin conexión', separadorAntes: true,
        onPress: () => descargar(track), icon: <IconDownload size={16} color={ICON_COLOR.muted} />,
        sfSymbol: 'arrow.down.circle' as const,
      }]
    })() : []),
    {
      label: 'Quitar de la lista',
      onPress: () => void drop(track.id),
      destructive: true,
      icon: <IconMinus size={15} color={ICON_COLOR.muted} />,
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

  const { abierto: buscando, filtro, setFiltro, alternar: alternarBuscar } = useBusquedaColeccion(playlist.id)
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
        avisar('No se pudo preparar ninguna canción para exportar.', true)
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
      avisar('No se pudo exportar la lista.', true)
    } finally {
      dejarDeEscuchar()
      setGuardando(null)
    }
  }

  const total = tracks?.length ?? 0
  const bajado = resumenLista(tracks ?? [], descargas)

  // Descargar nunca borra: pausa, reintento y retirada viven en opciones explícitas.
  const opcionesDescarga = menuDescargasLista(tracks ?? [], descargas)
  function descargarParaOffline() {
    descargarLista(tracks ?? [])
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
    ...(HAY_DESCARGA_ESCRITORIO ? [{
      label: 'Exportar', subtitle: guardando ? `${guardando.hechos} de ${guardando.total}` : 'Guardar archivos en una carpeta',
      disabled: !!guardando || !total, sfSymbol: 'square.and.arrow.up' as const,
      icon: <IconDisk size={16} color={ICON_COLOR.muted} />, onPress: () => void guardarTodoEnDisco(),
    }] : []),

    /*
     * La anatomía del menú de Apple Music: arriba las acciones rápidas —sumar
     * música, publicar o compartir, la gente—, después lo que le cambia la cara
     * a la lista, después lo que la deja en el perfil o la cierra, y al final lo
     * que la borra (o te saca de ella).
     */
    ...(onAgregar
      ? [
          {
            label: 'Agregar música',
            rapida: true,
            onPress: onAgregar,
            icon: <IconPlus size={15} color={ICON_COLOR.muted} />,
            sfSymbol: 'plus' as const,
          },
        ]
      : []),
    /*
     * Publicar y compartir. La fila dice a qué estado te lleva —«Hacer
     * pública» cuando es privada—, no en cuál estás. «Compartir» aparece
     * **solo si ya es pública**: un link a algo que nadie más puede abrir es un
     * link roto, y ofrecerlo antes empujaría a mandarlo sin haber publicado.
     */
    ...(mia && !publica
      ? [
          {
            label: 'Hacer pública',
            rapida: true,
            onPress: () => void onPublicar('publica'),
            icon: <IconGlobe size={15} color={ICON_COLOR.muted} />,
            sfSymbol: 'globe' as const,
          },
        ]
      : []),
    ...(publica
      ? [
          {
            label: 'Compartir',
            rapida: true,
            onPress: () => void compartirLista(playlist.id, playlist.name),
            icon: <IconShare size={15} color={ICON_COLOR.muted} />,
            sfSymbol: 'square.and.arrow.up' as const,
          },
        ]
      : []),
    /* La gente, o volverla colaborativa. En una lista común y ajena no hay
       nada que mostrar, y la fila sería una promesa vacía. */
    ...(playlist.colaborativa && onVerGente
      ? [
          {
            label: 'Gente',
            rapida: true,
            onPress: onVerGente,
            icon: <IconUsers size={15} color={ICON_COLOR.muted} />,
            sfSymbol: 'person.2' as const,
          },
        ]
      : mia && onColaborar
        ? [
            {
              label: 'Colaborar',
              rapida: true,
              onPress: onColaborar,
              icon: <IconUsers size={15} color={ICON_COLOR.muted} />,
              sfSymbol: 'person.2.badge.plus' as const,
            },
          ]
        : []),
    ...(mia
      ? [
          {
            label: 'Cambiar el nombre',
            onPress: editorNombre.abrir,
            icon: <IconPencil size={15} color={ICON_COLOR.muted} />,
            sfSymbol: 'pencil' as const,
          },
          {
            label: 'Cambiar la portada',
            onPress: onPickCover,
            icon: <IconImage size={15} color={ICON_COLOR.muted} />,
            sfSymbol: 'photo' as const,
          },
        ]
      : []),
    ...(mia && publica
      ? [
          {
            label: 'Hacer privada',
            subtitle: 'El link deja de andar',
            onPress: () => void onPublicar('privada'),
            icon: <IconLock size={15} color={ICON_COLOR.muted} />,
            sfSymbol: 'lock' as const,
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
            icon: <IconDisk size={15} color={ICON_COLOR.muted} />,
            sfSymbol: 'square.and.arrow.down' as const,
          },
        ]
      : []),
    ...(mia
      ? [
          {
            label: 'Fijar en mi perfil',
            separadorAntes: true,
            onPress: () => void fijarLista(),
            icon: <IconUser size={15} color={ICON_COLOR.muted} />,
            sfSymbol: 'pin' as const,
          },
        ]
      : []),
    {
      label: 'Cerrar la lista',
      separadorAntes: !mia,
      onPress: onClose,
      icon: <IconClose size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'xmark',
    },
    ...(mia
      ? [
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
          renderScrollComponent={(props) => (
            <ScrollArea {...props} stableIndicator contentKey={`${playlist.id}:${visibles.length}`} />
          )}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          data={visibles}
          keyExtractor={(t) => t.id}
          initialNumToRender={18}
          maxToRenderPerBatch={24}
          updateCellsBatchingPeriod={32}
          windowSize={9}
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
              editorNombre={editorNombre}
              total={total}
              totalMs={tracks?.reduce((sum, t) => sum + t.durationMs, 0) ?? playlist.totalMs}
              playing={isMine && soundingPlay}
              menu={menu}
              onVerGente={onVerGente}
              bajado={bajado}
              onDescarga={descargarParaOffline}
              opcionesDescarga={opcionesDescarga}
              onPlay={() => (total > 0 ? play(isMine ? soundingIndex : 0) : undefined)}
              onPickCover={onPickCover}
              buscando={buscando}
              filtro={filtro}
              onBuscar={alternarBuscar}
              onFiltro={setFiltro}
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
            tracks?.length ? (
              <>
                {/*
                 * «+ Agregar música», al pie de las canciones: es la fila de
                 * Apple Music, y va acá porque es donde uno está mirando
                 * cuando se le acabó la lista. Con el resumen debajo —cuántas
                 * son y cuánto duran—, que antes solo vivía en la cabecera.
                 */}
                {onAgregar ? (
                  <FilaAgregarMusica onPress={onAgregar} total={total} totalMs={tracks.reduce((s, t) => s + t.durationMs, 0)} />
                ) : null}
                {onAddSugerencia && onPlaySugerencia ? (
                  <Sugerencias
                    playlistId={playlist.id}
                    enLista={tracks}
                    onAdd={onAddSugerencia}
                    onPlay={onPlaySugerencia}
                    pendingId={pendingId}
                  />
                ) : null}
              </>
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
                detalle={`Todavía no hay nada en «${playlist.name}». Buscá canciones y sumalas.`}
                accion={
                  onAgregar
                    ? { rotulo: 'Agregar música', onPress: onAgregar }
                    : onSearch
                      ? { rotulo: 'Buscá una canción', onPress: onSearch }
                      : undefined
                }
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
              gusto={<BotonMeGusta track={item} size={18} lado={44} />}
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
                  <MarcaDescarga descarga={entradaDeTrack(item, descargas)?.descarga} />
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

/**
 * La fila «+ Agregar música» al pie de la lista, con el resumen debajo.
 *
 * Es la de Apple Music: un cuadrado con el más, el rótulo, y abajo en gris
 * «9 canciones, 40 minutos». El cuadrado es `muted` —un escalón de luminancia,
 * como el ícono de una fila de Ajustes— y no el blanco del acento: la acción
 * principal de la pantalla sigue siendo reproducir.
 */
function FilaAgregarMusica({
  onPress,
  total,
  totalMs,
}: {
  onPress: () => void
  total: number
  totalMs: number
}) {
  const suelto = useAngosto()
  return (
    <View className={`pt-2 ${suelto ? 'px-3' : 'px-6'}`}>
      {NativeMediaRow ? <NativeMediaRow title="Agregar música" subtitle="A esta lista" symbol="plus" label="Agregar música a la lista"
        onActivate={onPress} style={{ height: 68, width: '100%' }} /> : (
      <BotonSuperficie
        accessibilityRole="button"
        accessibilityLabel="Agregar música a la lista"
        onPress={onPress}
        className="flex-row items-center gap-3 rounded-lg px-2 py-2 active:bg-muted"
      >
        <View
          className="items-center justify-center rounded bg-muted"
          style={{ width: suelto ? 52 : 40, height: suelto ? 52 : 40 }}
        >
          <IconPlus size={suelto ? 22 : 18} color={ICON_COLOR.foreground} />
        </View>
        <Text className={`text-foreground ${suelto ? 'text-callout' : 'text-subheadline'}`}>
          Agregar música
        </Text>
      </BotonSuperficie>
      )}
      <Text className="px-2 pt-3 text-muted-foreground text-footnote">
        {total} {total === 1 ? 'canción' : 'canciones'}
        {totalMs > 0 ? `, ${formatLength(totalMs)}` : ''}
      </Text>
    </View>
  )
}

/** La cabecera grande: portada, nombre y los controles de la lista. */
function Header({
  playlist,
  tint,
  bleedTop,
  editorNombre,
  total,
  totalMs,
  playing,
  menu,
  onVerGente,
  bajado,
  onDescarga,
  opcionesDescarga,
  onPlay,
  onPickCover,
  buscando,
  filtro,
  onBuscar,
  onFiltro,
  children,
}: {
  playlist: Playlist
  tint: string | null
  bleedTop: number
  editorNombre: EdicionNombreLista
  total: number
  totalMs: number
  playing: boolean
  menu: MenuItem[]
  onVerGente?: () => void
  /** Cuánto de la lista está en el teléfono. Ver `resumenLista`. */
  bajado: ReturnType<typeof resumenLista>
  onDescarga: () => void
  opcionesDescarga: MenuItem[]
  onPlay: () => void
  onPickCover: () => void
  /** El campo de búsqueda de la lista está abierto. */
  buscando: boolean
  filtro: string
  /** Abrir o cerrar la búsqueda (al cerrar, limpia el filtro). */
  onBuscar: () => void
  onFiltro: (v: string) => void
  children: React.ReactNode
}) {
  /* El aleatorio es global —una sola cola suena a la vez— así que se lee del
     store y no viaja como prop desde la pantalla. Por su selector propio y no
     con el estado entero: la cabecera no puede redibujarse con la posición. */
  const [overCover, setOverCover] = useState(false)
  const cover = useCoverSize()
  const inline = useNombreInline()
  /* Los rótulos de los controles nombran su acción al pasar el cursor. */
  const tipBuscar = useConTooltip(buscando ? 'Cerrar la búsqueda' : 'Buscar en la lista')


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
          <BotonSuperficie
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
          </BotonSuperficie>
        }
        title={<TituloNombreLista nombre={playlist.name} editor={editorNombre} />}
        actions={inline && editorNombre.borrador ? <AccionesNombreLista editor={editorNombre} /> :
          <>
            <IconButton label={playing ? 'Pausar' : 'Reproducir la lista'} symbol={playing ? 'pause.fill' : 'play.fill'} onPress={onPlay} disabled={total === 0} lado={56} size={20} variant="primary" icon={playing ? (
                <IconPause
                  size={20}
                  color={total === 0 ? ICON_COLOR.muted : ICON_COLOR.onPrimary}
                />
              ) : (
                <IconPlay size={20} color={total === 0 ? ICON_COLOR.muted : ICON_COLOR.onPrimary} />
              )} />
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
            <BotonAleatorio size={19} lado={44} disabled={total === 0} />
            {/*
             * Buscar adentro de la lista, al lado de los otros controles de la
             * lista. Filtra las filas que ya están, sin ir al servidor —el de
             * arriba es para sumar canciones nuevas; este, para encontrar una
             * en una lista larga—. Encendido es el blanco de `primary`, apagado
             * el gris de los inactivos (`docs/DESIGN.md`).
             */}
            <BuscadorColeccion
              contexto="lista"
              abierto={buscando}
              filtro={filtro}
              vacia={total === 0}
              gestos={tipBuscar.gestos}
              onAbrir={onBuscar}
              onFiltro={onFiltro}
            />
            <BotonDescarga total={total} bajado={bajado} onPress={onDescarga} opciones={opcionesDescarga} />
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

      <CampoBusquedaColeccion
        contexto="lista"
        abierto={buscando}
        filtro={filtro}
        onFiltro={onFiltro}
        onCerrar={onBuscar}
      />
      <HojaNombreLista editor={editorNombre} />
      {children}
    </View>
  )
}

/** Primera descarga directa; las siguientes acciones se eligen sin borrar al tocar. */
function BotonDescarga({ total, bajado, onPress, opciones }: {
  total: number; bajado: ReturnType<typeof resumenLista>; onPress: () => void; opciones: MenuItem[]
}) {
  if (!HAY_DESCARGAS) return null
  const completa = total > 0 && bajado.listas === total
  const enCurso = bajado.bajando > 0
  const contenido = enCurso
    ? <Text className="text-foreground text-caption2 font-semibold tabular-nums">{Math.round(bajado.progreso * 100)}%</Text>
    : completa ? <IconDownloaded size={19} color={ICON_COLOR.foreground} /> : <IconDownload size={19} color={ICON_COLOR.muted} />
  const gestionar = opciones.some(o => o.label !== 'Descargar para escuchar sin conexión')
  if (gestionar) return <Menu label="Opciones de descarga de la lista" items={opciones}
    trigger={<View className="h-11 w-11 items-center justify-center">{contenido}</View>} />
  return <IconButton label="Descargar para escuchar sin conexión" symbol="arrow.down.circle"
    disabled={total === 0} onPress={onPress} icon={contenido} size={19} muted />
}

/**
 * La marca de «esta la tenés bajada», al final de la fila.
 *
 * Es de solo mirar: lo que se puede hacer con ella está en el menú de la propia
 * canción. Un control más en la fila competiría con los tres puntos por el mismo
 * rincón, y en el teléfono ese rincón ya está justo.
 */
function MarcaDescarga({ descarga }: { descarga: DescargaUI | undefined }) {
  if (!HAY_DESCARGAS || !descarga) return null

  return (
    <View className="mr-1">
      {descarga.estado === 'lista' ? (
        <IconDownloaded size={13} color={ICON_COLOR.muted} />
      ) : descarga.estado === 'bajando' ? (
        <Text className="text-muted-foreground text-caption2 tabular-nums">
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
