import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { contactInitial, formatMessageDate } from '../src/ui/MessageCard'
import { ChatBubble } from '../src/ui/ChatBubble'
import { SearchField } from '../src/ui/SearchField'
import { SkeletonList } from '../src/ui/Skeleton'
import { ResizableRegion } from '../src/ui/ResizableRegion'
import { AnimatedSidebarTitle, CollapsedSidebar } from '../src/ui/SidebarMotion'
import { Lyrics } from '../src/ui/Lyrics'
import { Panel } from '../src/ui/Panel'
import { Avatar } from '../src/ui/Avatar'
import { isSentBy, type Message } from '../src/models/message'
import {
  endSession,
  refreshConversations,
  selectConversation,
  useContact,
  useConversations,
  useMessages,
  useMyProfile,
  usePairId,
  useSessionError,
  useUser,
  setMyProfile,
} from '../src/state/session'
import { resetDraft, setDraft, useDraft } from '../src/state/draft'
import { sendMessage } from '../src/services/messages'
import { emailToUsername } from '../src/services/auth'
import {
  contactLabel,
  contactTitle,
  searchContacts,
  toContact,
  type ContactResult,
  type Conversation,
} from '../src/services/contacts'
import { mensajeError } from '../src/lib/mensajeError'
import { avisar } from '../src/state/aviso'
import { artworkSource } from '../src/lib/artwork'
import {
  resolveSong,
  searchMusic,
  subirCancionPropia,
  type AlbumTrack,
  type ArtistResult,
  type ArtistSong,
  type HomeItem,
  type TrackResult,
} from '../src/services/music'
import { elegirArchivoAudio } from '../src/lib/archivoAudio'
import { pickImage } from '../src/lib/pickImage'
import { useSnippetPlayer } from '../src/state/player'
import {
  registerAbrirLista,
  registerNewPlaylist,
  registerTabHandler,
  setDrawer,
  setEnChat,
  setTab,
  setTechoH,
  useKeyboardH,
  usePiso,
  useTecho,
} from '../src/state/shell'
import {
  abrirBusqueda,
  cerrarBusqueda,
  registerBusquedaHandler,
  setTermino,
  useTermino,
} from '../src/state/busqueda'
import {
  detachOrigin,
  enqueue,
  playQueue,
  registerPlaylistOpener,
  useNowPlayingView,
  usePlaybackOriginId,
  usePlaybackTrack,
  useWantPlay,
} from '../src/state/playback'
import { SearchDropdown } from '../src/ui/SearchDropdown'
import { SearchRecents } from '../src/ui/SearchRecents'
import { useColapso } from '../src/ui/useColapso'
import { BotonVidrio, Glass, HAY_VIDRIO } from '../src/ui/Glass'
import { recordarBusqueda } from '../src/state/recientes'
import { addShowcase } from '../src/services/showcases'
import { saveMyProfile } from '../src/services/profile'
import { Menu, type MenuItem } from '../src/ui/Menu'
import {
  addTrack,
  createPlaylist,
  deletePlaylist,
  listPlaylists,
  renamePlaylist,
  uploadCover,
  type Playlist,
  type PlaylistTrack,
} from '../src/services/playlists'
import { PlaylistLibrary, PlaylistRail } from '../src/ui/PlaylistLibrary'
import { PlaylistView } from '../src/ui/PlaylistView'
import { LyricsView } from '../src/ui/LyricsView'
import { SongDisc } from '../src/ui/SongDisc'
import { AlbumPanel } from '../src/ui/AlbumPanel'
import { ArtistPage } from '../src/ui/ArtistPage'
import { HomeFeed } from '../src/ui/HomeFeed'
import { NowPlayingPanel } from '../src/ui/NowPlayingPanel'
import {
  ICON_COLOR,
  IconBack,
  IconForward,
  IconCollapseLeft,
  IconCollapseRight,
  IconClose,
  IconDisc,
  IconImage,
  IconInbox,
  IconHome,
  IconLogOut,
  IconMusic,
  IconPause,
  IconPlay,
  IconPlus,
  IconQueue,
  IconSearch,
  IconSend,
  IconSliders,
  IconUser,
} from '../src/ui/icons'

const SIDEBAR_PX = 780
const DETAIL_PX = 1120
const GLOBAL_SEARCH_DEBOUNCE_MS = 250

/** Una colección de YouTube: un álbum o una lista ajena. */
type Coleccion = {
  kind: 'album' | 'playlist'
  id: string
  name: string
  artistId: string | null
}

/**
 * Qué muestra el panel del medio.
 *
 * Cada una es una parada del historial: entrar a cualquiera apila, las flechas
 * del encabezado recorren. `home` lleva su sección adentro para que salir de
 * «ver todo» sea volver, y no un botón aparte que hace lo mismo.
 */
type Vista =
  | { kind: 'home'; section: string | null }
  /** La biblioteca y el buscador ocupando el medio: solo en el teléfono. */
  | { kind: 'library' }
  | { kind: 'search' }
  | { kind: 'playlist'; id: string }
  | { kind: 'collection'; collection: Coleccion }
  | { kind: 'artist'; id: string; name: string }

export default function Home() {
  const messages = useMessages()
  const conversations = useConversations()
  const activePairId = usePairId()
  const user = useUser()
  const contact = useContact()
  const error = useSessionError()
  const { width } = useWindowDimensions()
  const router = useRouter()
  const showSidebar = width >= SIDEBAR_PX
  /** En el teléfono el contenido va de borde a borde. Ver `Panel`. */
  const suelto = !(width >= SIDEBAR_PX)
  const showDetail = width >= DETAIL_PX

  const myUid = user?.id ?? ''
  /*
   * El perfil manda; el email es el respaldo mientras carga.
   *
   * Si el usuario se cambió, el email de auth y el perfil dicen lo mismo (ver
   * `changeUsername`), pero el perfil llega después: sin este respaldo el chip
   * arrancaría vacío en cada arranque.
   */
  const myProfile = useMyProfile()
  const myUsername = myProfile?.username || emailToUsername(user?.email) || 'vos'
  const myLabel = myProfile?.displayName?.trim() || myUsername
  const contactName = contact ? contactLabel(contact) : 'contacto'
  /* El buscador de arriba es el único de la app: la lista vacía manda el
     cursor acá en vez de tener uno propio adentro. */
  const searchRef = useRef<TextInput>(null)
  const [searchResults, setSearchResults] = useState<ContactResult[]>([])
  const [searchingContacts, setSearchingContacts] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [leftWidth, setLeftWidth] = useState(340)
  const [rightWidth, setRightWidth] = useState(360)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [sending, setSending] = useState(false)
  const [composerError, setComposerError] = useState<string | null>(null)
  const draft = useDraft()
  const player = useSnippetPlayer()

  /*
   * El modo música, **prendido por defecto**.
   *
   * No es otra pantalla: es qué muestran los tres paneles. Con `music`, a la
   * izquierda están tus listas, en el medio la que abriste y a la derecha lo
   * que suena. Apagándolo aparecen las conversaciones y el detalle del mensaje.
   *
   * Arranca en música porque es lo que se usa a diario; el chat es de a ratos.
   */
  const [music, setMusic] = useState(true)
  /* La cara elegida en la barra (letra, disco) y qué suena: deciden si el
     panel del medio muestra eso en grande, al modo de Spotify. */
  const caraSonando = useNowPlayingView()
  const pistaSonando = usePlaybackTrack()
  const sonandoAhora = useWantPlay()
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null)
  const [playlistError, setPlaylistError] = useState<string | null>(null)
  /** Resultados del buscador de arriba cuando estamos en música. */
  const [trackResults, setTrackResults] = useState<TrackResult[]>([])
  const [artistResults, setArtistResults] = useState<ArtistResult[]>([])
  /** Canción que se está resolviendo, para no dejar el toque sin respuesta. */
  const [addingTrack, setAddingTrack] = useState<string | null>(null)
  /** Cambia para avisarle a la lista abierta que relea. */
  const [reloadToken, setReloadToken] = useState(0)

  /*
   * A dónde fuiste, en orden.
   *
   * El panel del medio no es una jerarquía: de una lista se salta a un álbum,
   * de ahí al artista y de ahí a otro álbum. Un breadcrumb dibujaría un árbol
   * que no existe; lo que hay de verdad es un historial, y por eso se guarda
   * como una pila con un cursor —igual que un navegador— y se recorre con las
   * flechas del encabezado.
   *
   * La lista propia se guarda por id y no por objeto: así, al renombrarla o
   * borrarla, el historial no queda con una copia vieja de algo que ya cambió.
   */
  const [stack, setStack] = useState<Vista[]>([{ kind: 'home', section: null }])
  const [at, setAt] = useState(0)
  const view = stack[at] ?? { kind: 'home', section: null }
  const canGoBack = at > 0
  const canGoForward = at < stack.length - 1

  /** Ir a algo nuevo: lo que hubiera adelante se pierde, como en cualquier navegador. */
  const go = useCallback(
    (next: Vista) => {
      setStack((s) => [...s.slice(0, at + 1), next])
      setAt(at + 1)
    },
    [at],
  )
  const goBack = useCallback(() => setAt((n) => Math.max(0, n - 1)), [])
  const goForward = useCallback(
    () => setAt((n) => Math.min(stack.length - 1, n + 1)),
    [stack.length],
  )

  /**
   * La lista abierta, buscada en la biblioteca por id.
   *
   * Si se borró mientras estaba en el historial, esto da null y el medio
   * muestra la portada: una entrada del historial no puede resucitar una lista
   * que ya no existe.
   */
  const openPlaylist =
    view.kind === 'playlist' ? (playlists?.find((p) => p.id === view.id) ?? null) : null
  const collection = view.kind === 'collection' ? view.collection : null
  const homeSection = view.kind === 'home' ? view.section : null
  const soundingPlaylistId = usePlaybackOriginId()
  /** El campo del encabezado. En el teléfono, música busca desde su pestaña. */
  /*
   * El campo del encabezado es cosa de ventana grande.
   *
   * En el teléfono el buscador es el de abajo —flotante, sobre el teclado— en
   * los dos modos: en música desde su pestaña y en chats desde la lupa del
   * encabezado. Antes en chats se quedaba arriba, y quedaban dos buscadores con
   * dos formas distintas en la misma app.
   */
  const buscadorArriba = showSidebar
  /*
   * Cuánto sube el campo de escribir para no quedar debajo de la cáscara.
   *
   * Es la cáscara **entera** —reproductor y pestañas— y no solo el
   * reproductor: con el contenedor llegando hasta el borde de abajo, medir
   * solo la tarjeta dejaba el campo escrito justo encima de las pestañas.
   */
  const cascara = usePiso()
  const colapsoPantalla = useColapso()
  /*
   * Lo que hay que dejar libre abajo del hilo.
   *
   * **No depende del teclado.** Antes valía el alto del teclado cuando estaba
   * abierto, así que al cerrarlo el hueco se desplomaba de golpe mientras todo
   * lo demás bajaba suave: ese era el parpadeo. Ahora el teclado lo resuelve el
   * traslado del bloque entero, y este número solo tiene que despejar la
   * cáscara y el campo — que no cambian.
   */
  const pisoChat = cascara

  /*
   * El campo de escribir va pegado al teclado real, no a una imitación.
   *
   * Mismo criterio que la cáscara: `useAnimatedKeyboard` da el alto en el hilo
   * de la interfaz cuadro a cuadro, así que los dos copian el mismo número y no
   * pueden desincronizarse — ni siquiera cuando arrastrás el teclado con el
   * dedo, que es donde cualquier animación propia se queda atrás.
   */
  const tecladoVivo = useAnimatedKeyboard()
  /*
   * Lo que se levanta al abrir el teclado: **el hilo entero y el campo**, en
   * bloque, como en WhatsApp.
   *
   * Se descuenta la cáscara porque el campo ya estaba apoyado sobre ella: sin
   * ese descuento, con el teclado abierto quedaría flotando el alto del
   * reproductor por encima del teclado en vez de apoyado sobre él. Y como la
   * cáscara se corre hacia abajo con el mismo teclado (ver `app/_layout.tsx`),
   * los dos movimientos se cancelan justo.
   *
   * El hilo y el campo comparten este estilo a propósito: es el mismo número,
   * así que no hay forma de que uno llegue antes que el otro.
   */
  const sobreTeclado = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.max(0, tecladoVivo.height.value - cascara) }],
  }))

  /*
   * Al abrir una conversación, el hilo arranca en el último mensaje.
   *
   * Ya no hace falta empujarlo al aparecer el teclado: el hilo **se traslada
   * entero** junto al campo, así que lo que estabas leyendo sigue exactamente
   * donde estaba, un teclado más arriba. Antes se reacomodaba el hueco de abajo
   * y había que corregir el desplazamiento a mano, con un `setTimeout` que se
   * veía llegar tarde.
   */
  const hilo = useRef<FlatList<Message>>(null)
  useEffect(() => {
    if (!activePairId) return
    const t = setTimeout(() => hilo.current?.scrollToEnd({ animated: true }), 60)
    return () => clearTimeout(t)
  }, [activePairId])
  /**
   * En el teléfono, «Chats» tiene dos niveles: la lista y la conversación.
   *
   * En escritorio los dos están a la vista al mismo tiempo —la lista a la
   * izquierda, el hilo en el medio— y esto no significa nada. En 390px entra
   * uno solo, y sin este paso la pestaña te metía directo en la última
   * conversación sin forma de volver a las demás.
   */
  const [chatAbierto, setChatAbierto] = useState(false)

  /*
   * El encabezado del teléfono **flota sobre el contenido**.
   *
   * Es la tercera pieza que `docs/DESIGN.md` lista como flotante —«la tarjeta
   * del reproductor, las pestañas, los redondeles del encabezado»— y la única
   * que seguía en el flujo: el contenido se cortaba en seco contra su borde,
   * la única línea dura de una app que funde todos los demás. Ahora corre
   * hasta el borde de arriba y se apaga contra el velo del encabezado, como en
   * Apple Music.
   *
   * Su alto se mide y se publica igual que el de la cáscara de abajo
   * (`setChromeH`): cada lista lo reserva adentro con `useTecho`. Dentro de un
   * chat el encabezado no se dibuja, y en escritorio está en el flujo; en los
   * dos casos el techo vale 0.
   */
  const arriba = useSafeAreaInsets()
  const sinHeader = suelto && !music && chatAbierto
  const headerFlota = suelto && !sinHeader
  const techo = useTecho()
  useEffect(() => {
    if (!headerFlota) setTechoH(0)
  }, [headerFlota])

  /*
   * Con una conversación abierta, la cáscara se pliega.
   *
   * Lo tiene que saber el layout, que es quien dibuja la franja de abajo. Se
   * apaga al salir de la pantalla —no solo al cerrar el chat— o volver desde
   * otra pestaña dejaría la barra escondida sin ninguna conversación a la vista.
   */
  const enChatAhora = suelto && !music && chatAbierto && !!contact
  useEffect(() => {
    setEnChat(enChatAhora)
    return () => setEnChat(false)
  }, [enChatAhora])
  /* Lo escrito vive en `state/busqueda`: el campo lo dibuja el layout, en la
     misma fila que las pestañas, y desde otro árbol. */
  const conversationQuery = useTermino()


  /** Relee la biblioteca; la lista abierta se refresca con lo que llega. */
  const loadPlaylists = useCallback(async () => {
    try {
      const mine = await listPlaylists()
      setPlaylists(mine)
      setPlaylistError(null)
      // La lista abierta sale de acá por id: no hay copia que refrescar.
    } catch {
      setPlaylistError('No se pudieron cargar tus listas.')
    }
  }, [])

  /*
   * Las pestañas del teléfono mandan qué se muestra acá.
   *
   * Cada una entra por su raíz y limpia el historial: volver a tocar «Inicio»
   * estando tres álbumes adentro te devuelve a la portada, que es lo que
   * cualquiera espera de una barra de pestañas. El perfil no pasa por acá
   * porque es una pantalla aparte, con su propia ruta.
   */
  useEffect(() => {
    registerTabHandler((tab) => {
      if (tab === 'perfil') return
      setMusic(tab !== 'chats')
      if (tab === 'chats') {
        setChatAbierto(false)
        return
      }
      /* Tocar la lupa **abre el campo**, no solo la pestaña. El buscador al pie
         solo se dibuja mientras buscás, así que sin esto entrar a «Buscar»
         mostraba el historial y ningún lugar donde escribir. Volver a tocarla
         con el teclado ya cerrado lo trae de nuevo. */
      /* La lupa abre el buscador de abajo, que es donde vive el campo. Y
         cualquier otra pestaña lo cierra y se lleva lo escrito: volver a entrar
         con el término viejo mostraría resultados de algo que ya no estabas
         buscando. */
      if (tab === 'buscar') abrirBusqueda('Buscá una canción o un artista')
      else cerrarBusqueda()
      /* Entrar a «Listas» relee la biblioteca: pudiste haber creado una desde
         otro lado. Ver el efecto de `AppState` más abajo. */
      if (tab === 'listas') void loadPlaylists()
      const raiz: Vista =
        tab === 'listas'
          ? { kind: 'library' }
          : tab === 'buscar'
            ? { kind: 'search' }
            : { kind: 'home', section: null }
      setStack([raiz])
      setAt(0)
    })
    return () => registerTabHandler(null)
  }, [loadPlaylists])

  // El panel lateral vive en el layout y no sabe crear listas; esta pantalla sí.
  useEffect(() => {
    registerNewPlaylist(() => void createAndOpen())
    return () => registerNewPlaylist(null)
  })

  /*
   * Tampoco sabe abrirlas: el panel lista los nombres y pide por id, y qué
   * significa abrir una —qué panel, qué historial— se decide acá.
   *
   * El historial se arma **entero y de una**, con índice absoluto, en vez de
   * apoyarse en `go`. `go` suma sobre el `at` que tenía al crearse, y acá
   * `setTab` acaba de mandarlo a cero en este mismo tick: el índice terminaría
   * apuntando afuera del stack recién armado. La biblioteca queda debajo a
   * propósito, para que «atrás» te deje en las listas y no fuera de la sección.
   */
  useEffect(() => {
    registerAbrirLista((id) => {
      setTab('listas')
      setStack([{ kind: 'library' }, { kind: 'playlist', id }])
      setAt(1)
    })
    return () => registerAbrirLista(null)
  })

  /*
   * El buscador de arriba busca lo que corresponde al modo.
   *
   * En música, canciones para sumar a la lista abierta —es la única forma de
   * agregar, ya no hay botón adentro de la lista—; en conversaciones, cuentas.
   * Es el mismo campo porque es el mismo gesto: buscar lo que tenés a la vista.
   */
  useEffect(() => {
    const term = conversationQuery.trim()
    if (!term) return

    const controller = new AbortController()
    const timer = setTimeout(() => {
      if (music) {
        searchMusic(term, controller.signal)
          .then(({ tracks, artists }) => {
            setTrackResults(tracks)
            setArtistResults(artists)
            setSearchError(
              tracks.length || artists.length ? null : 'No encontré esa canción ni ese artista.',
            )
            setSearchingContacts(false)
          })
          .catch((cause: unknown) => {
            if ((cause as Error).name === 'AbortError') return
            setSearchError('No se pudo buscar.')
            setSearchingContacts(false)
          })
        return
      }
      searchContacts(term, controller.signal)
        .then((contacts) => {
          setSearchResults(contacts)
          setSearchError(contacts.length ? null : 'No encontré ninguna cuenta.')
          setSearchingContacts(false)
        })
        .catch((cause: unknown) => {
          if ((cause as Error).name === 'AbortError') return
          setSearchError('No se pudieron buscar las cuentas.')
          setSearchingContacts(false)
        })
    }, GLOBAL_SEARCH_DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [conversationQuery, music])

  // Con música por defecto, la biblioteca se pide de entrada.
  useEffect(() => {
    if (playlists !== null) return
    let alive = true
    listPlaylists()
      .then((mine) => alive && setPlaylists(mine))
      .catch(() => alive && setPlaylistError('No se pudieron cargar tus listas.'))
    return () => {
      alive = false
    }
  }, [playlists])


  /*
   * Al volver a la app, se relee todo.
   *
   * La biblioteca se pedía **una sola vez** y después solo se refrescaba
   * cuando este mismo aparato la tocaba. Una lista creada desde la computadora
   * no llegaba nunca: el teléfono seguía mostrando lo que había cargado al
   * abrirse, y había que cerrar la app y volver a entrar.
   *
   * Esto no es tiempo real —para eso haría falta suscribirse a los cambios de
   * Supabase, que es otra conversación— pero cubre el caso de verdad: hacés algo
   * en la computadora y agarrás el teléfono. Al volver a primer plano, lo que
   * ves es lo que hay.
   *
   * `reloadToken` va junto porque la lista abierta lee sus canciones aparte:
   * sin él se refrescaría la biblioteca y la lista de adentro quedaría vieja.
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado !== 'active') return
      void loadPlaylists()
      setReloadToken((n) => n + 1)
    })
    return () => sub.remove()
  }, [loadPlaylists])

  // «Ver la lista», desde el menú de la barra de abajo. La barra vive en el
  // layout y no sabe mostrar listas; esta pantalla sí.
  useEffect(() => {
    registerPlaylistOpener(async (id) => {
      setMusic(true)
      const mine = playlists ?? (await listPlaylists().catch(() => []))
      setPlaylists(mine)
      if (mine.some((p) => p.id === id)) go({ kind: 'playlist', id })
    })
    return () => registerPlaylistOpener(null)
  }, [playlists, go])

  /**
   * Crea una lista y la abre, sin preguntar nada.
   *
   * Es lo que hace Spotify: el «+» no abre un formulario, crea «Mi lista #N» y
   * te deja adentro con el buscador listo. El nombre se cambia después, cuando
   * ya sabés qué terminó siendo — que es cuando uno realmente sabe cómo
   * llamarla.
   */
  async function createAndOpen() {
    const used = new Set((playlists ?? []).map((p) => p.name))
    let n = (playlists?.length ?? 0) + 1
    while (used.has(`Mi lista #${n}`)) n++

    const made = await createPlaylist(`Mi lista #${n}`).catch((e: unknown) => {
      setPlaylistError((e as Error).message)
      return null
    })
    if (!made) return
    // Se suma a mano antes de releer: la lista abierta se busca en la
    // biblioteca por id, y sin esto el medio parpadearía en la portada.
    setPlaylists((mine) => [made, ...(mine ?? [])])
    go({ kind: 'playlist', id: made.id })
    await loadPlaylists()
  }

  async function pickCover(playlist: Playlist) {
    if (!user) return
    try {
      // El selector sabe solo si abrir el diálogo del navegador o el de fotos
      // del teléfono; acá da lo mismo de dónde salió la imagen.
      const picked = await pickImage()
      if (!picked) return
      await uploadCover(user.id, playlist.id, picked.blob, picked.fileName)
      await loadPlaylists()
    } catch (e) {
      setPlaylistError((e as Error).message)
    }
  }

  /**
   * Suma al final de la lista abierta lo que se eligió arriba.
   *
   * Resolver el audio es lo que tarda: la primera vez hay que traerlo de
   * YouTube Music y dejarlo en Storage. Si ya se mandó alguna vez, es inmediato.
   */
  async function addToPlaylist(playlist: Playlist, track: TrackResult) {
    setAddingTrack(track.videoId)
    setPlaylistError(null)
    try {
      const song = await resolveSong(track)
      const ok = await addTrack(playlist.id, {
        videoId: track.videoId,
        title: track.title,
        artist: track.artist,
        artistId: track.artistId,
        artworkUrl: track.artworkUrl,
        artworkPath: song.artworkPath,
        audioPath: song.path,
        durationMs: song.durationMs || track.durationMs,
        truePeak: undefined,
      })
      if (!ok) setPlaylistError(`«${track.title}» ya está en ${playlist.name}.`)
      else {
        changeGlobalSearch('')
        setReloadToken((n) => n + 1)
        /* Sin esperar: es el conteo de la biblioteca, no parte de agregar. El
           «+» de la fila queda ocupado solo lo que tarda lo suyo. */
        void loadPlaylists()
      }
    } catch (e) {
      setPlaylistError(`No se pudo agregar: ${(e as Error).message}`)
      /* También por aviso: el cartel de arriba vive en el panel izquierdo, y
         desde el pie de sugerencias de una lista no se ve nunca. */
      avisar(`No se pudo agregar: ${(e as Error).message}`, true)
    } finally {
      setAddingTrack(null)
    }
  }

  /**
   * Sube un archivo de audio de la compu a la lista abierta.
   *
   * La primera música de la app que no sale de YouTube: el servidor la valida
   * con ffprobe, le lee etiquetas y tapa embebida, y la guarda tal cual. El
   * `videoId` se inventa con el prefijo `propia:` — es el id de fila que las
   * listas exigen único, no un video de nadie.
   */
  async function subirArchivoALista(playlist: Playlist) {
    const archivo = await elegirArchivoAudio()
    if (!archivo) return
    setAddingTrack(`propia:${archivo.name}`)
    avisar(`Subiendo «${archivo.name}»…`)
    try {
      const subida = await subirCancionPropia(archivo, archivo.name)
      const titulo = subida.title ?? archivo.name.replace(/\.[^.]+$/, '')
      const ok = await addTrack(playlist.id, {
        videoId: `propia:${subida.path.split('/').pop()?.split('.')[0] ?? archivo.name}`,
        title: titulo,
        artist: subida.artist ?? '',
        artistId: null,
        artworkUrl: '',
        artworkPath: subida.artworkPath,
        audioPath: subida.path,
        durationMs: subida.durationMs,
        truePeak: undefined,
      })
      if (!ok) avisar(`«${titulo}» ya está en ${playlist.name}.`)
      else {
        avisar(`«${titulo}» agregada a ${playlist.name}.`)
        setReloadToken((n) => n + 1)
        void loadPlaylists()
      }
    } catch (e) {
      avisar(`No se pudo subir: ${(e as Error).message}`, true)
    } finally {
      setAddingTrack(null)
    }
  }

  /**
   * Resuelve una canción de la búsqueda a algo reproducible.
   *
   * La primera vez hay que traer el audio de YouTube Music y dejarlo en
   * Storage; después es inmediato. La fila de la lista no existe —esto no se
   * guardó en ningún lado— así que se arma una al vuelo con el videoId de id.
   */
  async function resolveForPlayback(track: TrackResult): Promise<PlaylistTrack> {
    /* Lo que ya está resuelto no se vuelve a resolver: los resultados nacidos
       de una canción guardada traen su audio (ver `playlistTrackAsResult`). */
    if (track.audioPath) {
      return {
        id: `busqueda:${track.videoId}`,
        videoId: track.videoId,
        title: track.title,
        artist: track.artist,
        artistId: track.artistId,
        artworkUrl: track.artworkUrl,
        artworkPath: track.artworkPath ?? null,
        audioPath: track.audioPath,
        durationMs: track.durationMs,
        truePeak: undefined,
      }
    }
    const song = await resolveSong(track)
    return {
      id: `busqueda:${track.videoId}`,
      videoId: track.videoId,
      title: track.title,
      artist: track.artist,
      artistId: track.artistId,
      artworkUrl: track.artworkUrl,
      artworkPath: song.artworkPath,
      audioPath: song.path,
      durationMs: song.durationMs || track.durationMs,
      truePeak: undefined,
    }
  }

  /** Escuchar un resultado sin guardarlo en ninguna lista. */
  async function playSearchResult(track: TrackResult) {
    setAddingTrack(track.videoId)
    setPlaylistError(null)
    try {
      playQueue([await resolveForPlayback(track)], 0, null)
    } catch (e) {
      setPlaylistError(`No se pudo reproducir: ${(e as Error).message}`)
      avisar(`No se pudo reproducir: ${(e as Error).message}`, true)
    } finally {
      setAddingTrack(null)
    }
  }

  /** Sumar a la cola: suena cuando termine lo de ahora, sin tocar ninguna lista. */
  async function enqueueSearchResult(track: TrackResult) {
    setAddingTrack(track.videoId)
    setPlaylistError(null)
    try {
      enqueue(await resolveForPlayback(track))
    } catch (e) {
      setPlaylistError(`No se pudo encolar: ${(e as Error).message}`)
      avisar(`No se pudo encolar: ${(e as Error).message}`, true)
    } finally {
      setAddingTrack(null)
    }
  }

  /**
   * Una canción guardada, en la forma que entiende el menú.
   *
   * El álbum queda vacío porque no se guarda en la lista: por eso «Ir al
   * álbum» aparece apagado en una canción tuya y encendido en una que venís de
   * buscar. Para encenderlo habría que guardar `albumId` al agregarla.
   */
  function playlistTrackAsResult(track: PlaylistTrack): TrackResult {
    return {
      videoId: track.videoId,
      title: track.title,
      artist: track.artist,
      artistId: track.artistId,
      album: '',
      albumId: null,
      artworkUrl: track.artworkUrl,
      durationMs: track.durationMs,
      /* El audio que ya está resuelto viaja con el resultado: encolar o
         reproducir desde el menú no re-resuelve — y una canción propia
         (`propia:…`) ni podría, ese id no existe en YouTube. */
      audioPath: track.audioPath,
      artworkPath: track.artworkPath,
    }
  }

  /**
   * Una canción de álbum, en la forma que entiende el resto de la app.
   *
   * El álbum no trae el id de canal del artista ni su propio id, así que esos
   * quedan en null: es información que solo tiene la búsqueda.
   */
  function albumTrackAsResult(track: AlbumTrack, artworkUrl: string): TrackResult {
    return {
      videoId: track.videoId,
      title: track.title,
      artist: track.artist,
      artistId: collection?.artistId ?? null,
      album: '',
      albumId: null,
      artworkUrl,
      durationMs: track.durationMs,
    }
  }

  /** Una canción de la portada, en la forma que entiende el resto de la app. */
  function homeItemAsResult(item: HomeItem): TrackResult {
    return {
      videoId: item.id,
      title: item.title,
      artist: item.subtitle,
      /* Con el id del artista cuando la portada lo trae: es lo que hace que
         una escucha nacida acá cuente para las recomendaciones, y que «Ir al
         artista» funcione desde los tres puntos. */
      artistId: item.artistId ?? null,
      album: '',
      albumId: null,
      artworkUrl: item.artworkUrl,
      durationMs: 0,
    }
  }

  /** Crea una lista nueva con esa canción adentro y la abre. */
  async function startPlaylistWith(track: TrackResult) {
    const used = new Set((playlists ?? []).map((p) => p.name))
    let n = (playlists?.length ?? 0) + 1
    while (used.has(`Mi lista #${n}`)) n++
    try {
      const made = await createPlaylist(`Mi lista #${n}`)
      setPlaylists((mine) => [made, ...(mine ?? [])])
      go({ kind: 'playlist', id: made.id })
      await addToPlaylist(made, track)
    } catch (e) {
      setPlaylistError((e as Error).message)
    }
  }

  /**
   * Las opciones de los tres puntos de un resultado.
   *
   * Las listas van en un **submenú** —«Agregar a una lista ›»—, como pide la
   * HIG de menús: una fila por lista hacía crecer el menú con los datos, y con
   * varias listas las acciones fijas de abajo quedaban empujadas fuera de la
   * vista. La fila dice qué se puede hacer, una sola vez; el submenú dice
   * dónde. «Nueva lista» vive adentro, primera: es una lista más a donde ir.
   */
  function menuForTrack(track: TrackResult, omitPlaylistId?: string): MenuItem[] {
    /* La lista que estás mirando no se ofrece: la canción ya está adentro.
       Va anotado: sin el tipo, `sfSymbol` sale del `.map` como `string` a
       secas y deja de encajar en el nombre de símbolo que espera `MenuItem`. */
    const aLista: MenuItem[] = [
      {
        label: 'Nueva lista con esta canción',
        onPress: () => void startPlaylistWith(track),
        icon: <IconPlus size={15} color={ICON_COLOR.muted} />,
        sfSymbol: 'plus',
      },
      ...(playlists ?? [])
        .filter((p) => p.id !== omitPlaylistId)
        .map((p): MenuItem => ({
          label: p.name,
          onPress: () => void addToPlaylist(p, track),
          icon: <IconMusic size={15} color={ICON_COLOR.muted} />,
          sfSymbol: 'music.note.list',
        })),
    ]
    return [
      {
        label: 'Ir al artista',
        onPress: () =>
          track.artistId
            ? go({ kind: 'artist', id: track.artistId, name: track.artist })
            : undefined,
        disabled: !track.artistId,
        icon: <IconUser size={15} color={ICON_COLOR.muted} />,
        sfSymbol: 'person',
      },
      {
        label: 'Ir al álbum',
        onPress: () =>
          track.albumId
            ? go({
                kind: 'collection',
                collection: {
                  kind: 'album',
                  id: track.albumId,
                  name: track.album || 'Álbum',
                  artistId: track.artistId,
                },
              })
            : undefined,
        disabled: !track.albumId,
        icon: <IconDisc size={15} color={ICON_COLOR.muted} />,
        sfSymbol: 'opticaldisc',
      },
      {
        label: 'Agregar a la cola',
        onPress: () => void enqueueSearchResult(track),
        icon: <IconQueue size={15} color={ICON_COLOR.muted} />,
        sfSymbol: 'text.badge.plus',
      },
      {
        label: 'Agregar a una lista',
        icon: <IconPlus size={15} color={ICON_COLOR.muted} />,
        sfSymbol: 'plus',
        items: aLista,
      },
      {
        label: 'Fijar en mi perfil',
        onPress: () => void fijarEnPerfil(track),
        icon: <IconUser size={15} color={ICON_COLOR.muted} />,
        sfSymbol: 'pin',
      },
      {
        label: 'Usar su tapa de fondo',
        onPress: () => void usarDeFondo(track),
        icon: <IconImage size={15} color={ICON_COLOR.muted} />,
        sfSymbol: 'photo',
      },
    ]
  }

  /**
   * Pone la tapa de esta canción como fondo del perfil.
   *
   * Se guarda **nuestra copia** en Storage y no la URL de YouTube: las de ellos
   * vencen, y un perfil no puede quedarse sin fondo porque expiró un enlace. Por
   * eso hay que resolver la canción primero, aunque acá no vaya a sonar: es el
   * paso que deja la carátula cacheada.
   */
  async function usarDeFondo(track: TrackResult) {
    setAddingTrack(track.videoId)
    setPlaylistError(null)
    try {
      const song = await resolveSong(track)
      if (!song.artworkPath) {
        avisar('Esa canción no tiene tapa para usar de fondo.', true)
        return
      }
      setMyProfile(await saveMyProfile({ bannerPath: song.artworkPath }))
      avisar('Listo, ya es tu fondo')
    } catch (e) {
      avisar(`No se pudo usar de fondo: ${mensajeError(e)}`, true)
    } finally {
      setAddingTrack(null)
    }
  }

  /**
   * Fija una canción como vitrina del perfil.
   *
   * Hay que resolverla primero: una vitrina guarda el camino del audio para
   * poder sonar sola desde el perfil, sin depender de que la canción esté en
   * alguna lista. Es el mismo `resolveSong` que usa agregar a una lista, así que
   * la segunda vez es inmediato.
   */
  async function fijarEnPerfil(track: TrackResult) {
    if (!user) return
    setAddingTrack(track.videoId)
    setPlaylistError(null)
    try {
      const song = await resolveSong(track)
      await addShowcase(user.id, 'cancion', {
        videoId: track.videoId,
        title: track.title,
        artist: track.artist,
        artworkUrl: track.artworkUrl,
        artworkPath: song.artworkPath ?? null,
        audioPath: song.path,
        durationMs: song.durationMs || track.durationMs,
      })
      avisar('Fijado en tu perfil')
    } catch (e) {
      /* Por aviso y no por `playlistError`: ese cartel se dibuja adentro de la
         biblioteca, y desde la portada o el buscador —donde también está este
         menú— no se ve, así que el fallo pasaba en silencio. */
      avisar(`No se pudo fijar: ${mensajeError(e)}`, true)
    } finally {
      setAddingTrack(null)
    }
  }

  async function removePlaylist(playlist: Playlist) {
    /* Borrar la lista no frena la música: lo que estabas escuchando sigue,
       solo deja de tener una lista detrás. Antes se cortaba en seco, que es lo
       último que uno espera de un botón que habla de otra cosa. */
    detachOrigin(playlist.id)
    await deletePlaylist(playlist.id).catch(() => setPlaylistError('No se pudo borrar la lista.'))
    /* Se sale de la lista borrada y además se la saca del historial: volver
       atrás a algo que ya no existe mostraría la portada sin explicación. El
       cursor se corrige por las entradas que quedaron antes de donde estaba. */
    const borrada = (v: Vista) => v.kind === 'playlist' && v.id === playlist.id
    const limpio = stack.filter((v) => !borrada(v))
    const antes = stack.slice(0, at + 1).filter(borrada).length
    setStack(limpio.length ? limpio : [{ kind: 'home', section: null }])
    setAt(Math.max(0, Math.min(at - antes, limpio.length - 1)))
    await loadPlaylists()
  }

  const selected =
    messages.find((message) => message.id === selectedId) ?? messages[messages.length - 1] ?? null
  const visibleConversations = useMemo(() => {
    const query = conversationQuery.trim().toLocaleLowerCase('es')
    if (!query) return conversations
    return conversations.filter(
      (conversation) =>
        conversation.contact.username.toLocaleLowerCase('es').includes(query) ||
        contactLabel(conversation.contact).toLocaleLowerCase('es').includes(query) ||
        conversation.lastMessageText.toLocaleLowerCase('es').includes(query),
    )
  }, [conversationQuery, conversations])

  function openMessage(id: string) {
    // El panel de detalle sigue mostrando lo elegido, pero tocar un mensaje
    // abre la vista completa: es donde la pieza se ve como tal.
    if (showDetail) setSelectedId(id)
    // El reproductor del chat se apaga: el visor tiene el suyo y dos audios a
    // la vez sonarían encimados.
    player.stop()
    router.push({ pathname: '/message/[id]', params: { id } })
  }

  function openComposer(prefillCurrent: boolean) {
    resetDraft()
    if (prefillCurrent && contact) {
      setDraft({ recipient: contact })
    } else {
      setDraft({ chooseRecipient: true })
    }
    router.push('/compose')
  }

  function changeConversation(pairId: string) {
    resetDraft()
    setComposerError(null)
    selectConversation(pairId)
  }

  async function sendChatMessage() {
    if (!user || !activePairId || !contact) return
    const text = draft.text.trim()
    if (!text && !draft.song) return

    setSending(true)
    setComposerError(null)
    try {
      await sendMessage(activePairId, user.id, {
        text,
        song: draft.song ?? undefined,
      })
      resetDraft()
      setDraft({ recipient: contact })
      await refreshConversations()
    } catch (cause) {
      setComposerError(`No se pudo enviar: ${(cause as Error).message}`)
    } finally {
      setSending(false)
    }
  }

  /**
   * Lo escrito cambió: se tiran los resultados viejos.
   *
   * Se registra como el oído del store en vez de llamarse desde el campo: el
   * campo vive en el layout y solo sabe escribir el término. Y no puede
   * escribirlo desde acá adentro —`setTermino` avisa a este mismo handler— o
   * se llamarían en círculo.
   */
  const limpiarResultados = useCallback((value: string) => {
    setSearchResults([])
    setTrackResults([])
    setSearchError(null)
    setSearchingContacts(value.trim().length > 0)
  }, [])

  useEffect(() => {
    registerBusquedaHandler(limpiarResultados)
    return () => registerBusquedaHandler(null)
  }, [limpiarResultados])

  function changeGlobalSearch(value: string) {
    setTermino(value)
  }

  function chooseGlobalResult(result: ContactResult) {
    changeGlobalSearch('')
    if (result.pairId) {
      changeConversation(result.pairId)
      // En el teléfono, elegir a alguien desde el buscador abre su hilo.
      setChatAbierto(true)
      return
    }
    resetDraft()
    setDraft({
      recipient: toContact(result),
      chooseRecipient: false,
    })
    router.push('/compose')
  }

  /*
   * En el teléfono el fondo es el mismo del contenido.
   *
   * Con el negro puro del escritorio, el encabezado y la zona de las pestañas
   * quedaban como dos franjas más oscuras contra los paneles: una costura
   * visible donde no hay ninguna separación real.
   */
  return (
    <SafeAreaView
      className={`flex-1 ${suelto ? 'bg-background' : 'bg-canvas'}`}
      /* En el teléfono el margen de abajo lo pone la barra de pestañas, que
         vive en el layout. Reservarlo también acá lo contaba dos veces: entre
         el campo de escribir y el reproductor quedaba un hueco muerto del alto
         del indicador del iPhone. */
      /* Y con el encabezado flotando tampoco va el de arriba: el contenido
         tiene que llegar hasta el borde para pasar por detrás del reloj y del
         velo. El margen del reloj lo pone el propio encabezado. */
      edges={headerFlota ? [] : suelto ? ['top'] : ['top', 'bottom']}
    >
      {/* Sin margen ni hueco en ningún ancho: las columnas van de borde a
          borde y se separan por luminancia — ver `Panel`. */}
      <View className="flex-1">
        {/*
         * Dentro de una conversación, en el teléfono, la cabecera de la app se
         * va: entre las dos se comían 150px antes del primer mensaje, y el
         * buscador de arriba filtra conversaciones — algo que ahí adentro ya no
         * tiene sentido. La del chat se queda con la flecha, el avatar y el
         * nombre, que es lo que hace falta para saber con quién estás hablando.
         */}
        {sinHeader ? null : (
        <>
        {/*
         * El velo del encabezado: el fundido que pide el estándar de iOS 26.
         *
         * Del fondo hacia nada, con paradas que dibujan una curva suave — un
         * degradado lineal de dos paradas se ve como una línea que se corre,
         * que es justo lo que se está sacando. Opaco sobre el reloj, para que
         * la hora nunca pelee con una carátula, y transparente un poco más
         * abajo del encabezado, donde el contenido ya manda.
         *
         * Los colores literales salen del token `background` (#121212):
         * `LinearGradient` no lee variables CSS.
         */}
        {headerFlota ? (
          <LinearGradient
            pointerEvents="none"
            colors={[
              'rgb(18,18,18)',
              'rgba(18,18,18,0.93)',
              'rgba(18,18,18,0.72)',
              'rgba(18,18,18,0.4)',
              'rgba(18,18,18,0.13)',
              'rgba(18,18,18,0)',
            ]}
            locations={[0, 0.32, 0.56, 0.76, 0.9, 1]}
            style={{ position: 'absolute', left: 0, right: 0, top: 0, height: techo + 28, zIndex: 40 }}
          />
        ) : null}
        <View
          /* Flotando, su alto es el techo que cada lista reserva adentro. */
          onLayout={
            headerFlota
              ? (e) => setTechoH(Math.round(e.nativeEvent.layout.height))
              : undefined
          }
          className={`z-50 flex-row items-center ${
            /* El respiro vertical que antes ponía el margen del lienzo: la
               barra es el cromo de la ventana y necesita su propia franja. */
            suelto ? 'gap-2 px-1' : 'relative justify-between py-2'
          }`}
          style={
            headerFlota
              ? {
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  paddingTop: arriba.top,
                  paddingBottom: 8,
                }
              : undefined
          }
        >
          {/* En el teléfono el ícono no va pegado a la esquina: al abrir el
              panel, la tarjeta redondea justo ahí (radio 44) y la curva se lo
              comía. Corrido a la derecha queda fuera del mordisco. */}
          <View className={`z-10 flex-row items-center gap-3 ${suelto ? 'pl-4 pr-1' : 'px-3'}`}>
            {/* El ícono de la app, no un glifo genérico, y del mismo cuerpo que
                el avatar del perfil: son los dos accesos de las esquinas y
                tienen que pesar igual. Cuadrado redondeado, que es su forma
                nativa — recortarlo en círculo le come el nombre. */}
            {/* La medida va inline y no por className: en web la clase no
                llega a la imagen y se dibuja a su tamaño natural —1024px—,
                tapando la pantalla entera. Un estilo explícito no depende de
                que NativeWind procese este componente. */}
            {suelto ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Abrir el menú"
                onPress={() => setDrawer(true)}
                className="rounded-xl active:opacity-70"
              >
                <Image
                  source={require('../assets/icon.png')}
                  style={{ width: 32, height: 32, borderRadius: 10 }}
                />
              </Pressable>
            ) : (
              /* En ventana grande el ícono es **la marca y nada más**.
                 Abría el panel lateral, que en este ancho ofrece los mismos
                 destinos que ya están a la vista: quedaban dos caminos a lo
                 mismo y uno de ellos tapaba la pantalla para dártelos. */
              <Image
                source={require('../assets/icon.png')}
                style={{ width: 32, height: 32, borderRadius: 10 }}
              />
            )}
            {showSidebar ? <Text className="text-foreground text-lg font-bold">dnmusic</Text> : null}
          </View>

          {/*
           * En el teléfono el buscador va **en la fila**, no centrado sobre
           * ella. Estaba posicionado en absoluto con 80px de margen a cada
           * lado, que alcanza en una ventana y no en 390px: el avatar y el
           * botón de salir ocupan más que eso y el campo se les montaba encima.
           * En la fila, el campo toma lo que sobra y no puede tocar a nadie.
           */}
          <View
            pointerEvents="box-none"
            className={
              suelto
                ? 'min-w-0 flex-1 px-1'
                : 'absolute inset-x-0 items-center px-20'
            }
          >
            <View pointerEvents="auto" className="relative w-full max-w-xl">
              {width >= 620 ? (
                <View
                  className="flex-row items-center gap-1"
                  style={{
                    position: 'absolute',
                    right: '100%',
                    top: 2,
                    marginRight: 8,
                  }}
                >
                  {/* Las flechas recorren el historial del panel del medio;
                      inicio no vuelve a ningún lado, arranca de cero. Van
                      juntas porque son la misma idea: dónde estoy parado. */}
                  {music ? (
                    /* Atrás y adelante comparten **una** cápsula de vidrio,
                       como las flechas de historial de macOS: son la misma
                       idea —dónde estoy parado— y agruparlas deja el
                       encabezado con menos piezas sueltas. */
                    <Glass radius={22}>
                      <View className="flex-row">
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Atrás"
                          accessibilityState={{ disabled: !canGoBack }}
                          disabled={!canGoBack}
                          onPress={goBack}
                          className="h-11 w-11 items-center justify-center active:opacity-60"
                        >
                          <IconBack
                            size={19}
                            color={canGoBack ? ICON_COLOR.foreground : ICON_COLOR.muted}
                          />
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Adelante"
                          accessibilityState={{ disabled: !canGoForward }}
                          disabled={!canGoForward}
                          onPress={goForward}
                          className="h-11 w-11 items-center justify-center active:opacity-60"
                        >
                          <IconForward
                            size={19}
                            color={canGoForward ? ICON_COLOR.foreground : ICON_COLOR.muted}
                          />
                        </Pressable>
                      </View>
                    </Glass>
                  ) : null}
                  <HeaderButton
                    label="Ir al inicio"
                    onPress={() => {
                      changeGlobalSearch('')
                      setStack([{ kind: 'home', section: null }])
                      setAt(0)
                      router.replace('/')
                    }}
                    icon={<IconHome size={19} color={ICON_COLOR.foreground} />}
                  />
                </View>
              ) : null}
              {/* En el teléfono y en música el buscador es una pestaña, no un
                  campo acá arriba: en 390px competía con el logo, el avatar y
                  el botón de salir, y el desplegable de resultados —pensado
                  para flotar sobre una ventana grande— no entraba. En chats se
                  queda, porque ahí filtra la lista de conversaciones. */}
              {buscadorArriba ? (
              <SearchField
                inputRef={searchRef}
                value={conversationQuery}
                onChangeText={changeGlobalSearch}
                placeholder={
                  music
                    ? openPlaylist
                      ? `Buscá una canción para «${openPlaylist.name}»`
                      : 'Buscá una canción'
                    : width < 620
                      ? 'Buscar mensajes'
                      : 'Buscar en tus conversaciones'
                }
                loading={searchingContacts}
              />
              ) : null}
              {buscadorArriba && conversationQuery.trim() ? (
                music ? (
                  <SearchDropdown
                    visible
                    loading={searchingContacts}
                    results={trackResults}
                    error={searchError}
                    /* Tocar la fila hace lo mismo que el «+»: sumar a la lista
                       que estás mirando. Sin ninguna abierta, el destino se
                       elige desde los tres puntos. */
                    /* Tocar la fila reproduce, no guarda: escuchar es lo que
                       uno viene a hacer con un resultado. Guardar es el «+». */
                    onSelect={(track) => void playSearchResult(track)}
                    onPlay={(track) => void playSearchResult(track)}
                    artists={artistResults}
                    onOpenArtist={(a) => {
                      changeGlobalSearch('')
                      go({ kind: 'artist', id: a.id, name: a.name })
                    }}
                    pendingId={addingTrack}
                    quickAddLabel={openPlaylist ? `Agregar a ${openPlaylist.name}` : undefined}
                    onQuickAdd={
                      openPlaylist ? (track) => void addToPlaylist(openPlaylist, track) : undefined
                    }
                    menuFor={menuForTrack}
                  />
                ) : (
                  <GlobalSearchResults
                    loading={searchingContacts}
                    results={searchResults}
                    error={searchError}
                    onSelect={chooseGlobalResult}
                  />
                )
              ) : null}
              {/* Acá había un cartel con un spinner mientras se preparaba una
                  canción. Se fue: colgaba del encabezado, lejos de lo que
                  tocaste, tapando la primera fila y sin decir *cuál* canción
                  estaba cargando. Ahora la espera se muestra encima de la tapa
                  de esa canción — ver `EstadoTapa`. */}
            </View>
          </View>

          <View
            /* El mismo respiro que el ícono del otro extremo: pegado al borde
               se leía como recortado, sobre todo con la pantalla curva. */
            className={`z-10 flex-row items-center gap-2 ${suelto ? 'pl-1 pr-4' : 'ml-auto px-2'}`}
          >
            {/* El chip es la entrada al perfil: es donde uno ya mira para
                saber con qué cuenta está, así que también es donde busca
                cambiarla. En angosto queda solo el avatar. */}
            {/* En chats y en el teléfono, la lupa es la puerta al buscador de
                abajo: en música ese lugar lo ocupa la pestaña. */}
            {suelto && !music ? (
              <BotonVidrio
                label="Buscar en tus conversaciones"
                onPress={() => abrirBusqueda('Buscar en tus conversaciones')}
                radius={22}
                style={{ width: 44, height: 44 }}
              >
                <IconSearch size={17} color={ICON_COLOR.muted} />
              </BotonVidrio>
            ) : null}
            {/*
             * El avatar es **un menú**, no un botón más una fila de botones.
             *
             * Es el estándar de Apple para la cuenta: las acciones que se usan
             * poco —salir, los ajustes— viven detrás del avatar, no siempre a
             * la vista. Un «cerrar sesión» permanente en la barra es un botón
             * que se toca una vez por mes ocupando el lugar de los que se
             * tocan todo el día.
             */}
            <Menu
              label="Tu cuenta"
              items={[
                {
                  label: 'Tu perfil',
                  onPress: () => router.push('/profile'),
                  icon: <IconUser size={15} color={ICON_COLOR.muted} />,
                  sfSymbol: 'person',
                },
                {
                  label: 'Ajustes',
                  onPress: () => router.push('/ajustes'),
                  icon: <IconSliders size={15} color={ICON_COLOR.muted} />,
                  sfSymbol: 'slider.horizontal.3',
                },
                {
                  label: 'Cerrar sesión',
                  onPress: () => void endSession(),
                  destructive: true,
                  icon: <IconLogOut size={15} color={ICON_COLOR.muted} />,
                  sfSymbol: 'rectangle.portrait.and.arrow.right',
                },
              ]}
              trigger={
                <Glass
                  radius={22}
                  style={
                    width >= 620 ? { height: 44, paddingHorizontal: 6 } : { width: 44, height: 44 }
                  }
                >
                  <View className="h-full flex-row items-center justify-center gap-2">
                    <Avatar name={myLabel} path={myProfile?.avatarPath} size={32} />
                    {width >= 620 ? (
                      <Text className="text-muted-foreground text-xs pr-1.5">@{myUsername}</Text>
                    ) : null}
                  </View>
                </Glass>
              }
            />
            {/* En el teléfono este botón sobra: alternar entre música y
                conversaciones es lo que hacen las pestañas de abajo, y tenerlo
                dos veces solo compite consigo mismo. */}
            {showSidebar ? (
              <BotonVidrio
                label={music ? 'Volver a las conversaciones' : 'Tus listas'}
                onPress={() => {
                  setMusic((on) => !on)
                  // Salir de música deja el historial en la portada: al volver,
                  // se entra por donde se entra siempre y no en media navegación.
                  if (music) {
                    setStack([{ kind: 'home', section: null }])
                    setAt(0)
                  }
                  // Lo escrito buscaba otra cosa; dejarlo mostraría resultados
                  // del modo anterior bajo un campo que ya dice otra cosa.
                  changeGlobalSearch('')
                }}
                radius={22}
                style={{ width: 44, height: 44 }}
              >
                {/* El ícono dice a dónde te lleva, no dónde estás: con la música
                    de fondo permanente, marcar el modo activo no aporta nada. */}
                {music ? (
                  <IconInbox size={17} color={ICON_COLOR.muted} />
                ) : (
                  <IconMusic size={17} color={ICON_COLOR.muted} />
                )}
              </BotonVidrio>
            ) : null}
          </View>
        </View>
        </>
        )}

        <View className="min-h-0 flex-1 flex-row">
          {showSidebar ? (
            <ResizableRegion
              width={leftWidth}
              collapsed={leftCollapsed}
              minWidth={330}
              maxWidth={480}
              resizeEdge="right"
              onWidthChange={setLeftWidth}
            >
              {({ hovered }) => {
                /*
                 * La vista previa del panel contraído es **el mismo contenido**
                 * que el expandido, apagado.
                 *
                 * Antes era siempre las conversaciones: al contraer la
                 * izquierda en modo música asomaba un chat que no estaba a la
                 * vista, y el panel mentía sobre lo que había abajo.
                 */
                const panel = (vivo: boolean) =>
                  music ? (
                    /* En modo música la izquierda es la biblioteca, como en
                       Spotify: es de donde se elige qué mirar en el medio. */
                    <PlaylistLibrary
                      playlists={playlists}
                      openId={openPlaylist?.id ?? null}
                      soundingId={soundingPlaylistId}
                      showCollapse={vivo && hovered}
                      onCollapse={vivo ? () => setLeftCollapsed(true) : () => undefined}
                      onOpen={vivo ? (p) => go({ kind: 'playlist', id: p.id }) : () => undefined}
                      onCreate={vivo ? createAndOpen : async () => undefined}
                      error={playlistError}
                    />
                  ) : (
                    <ConversationSidebar
                      conversations={visibleConversations}
                      filtered={conversationQuery.trim().length > 0}
                      activePairId={activePairId}
                      hovered={vivo && hovered}
                      onCollapse={vivo ? () => setLeftCollapsed(true) : () => undefined}
                      onSelect={vivo ? changeConversation : () => undefined}
                      onNew={vivo ? () => openComposer(false) : () => undefined}
                    />
                  )

                return leftCollapsed ? (
                  <CollapsedSidebar
                    side="left"
                    hovered={hovered}
                    /* En música la franja muestra las tapas de tus listas; en
                       conversaciones no hay nada equivalente y queda el ícono. */
                    resting={music ? <PlaylistRail playlists={playlists} /> : undefined}
                    onExpand={() => setLeftCollapsed(false)}
                  />
                ) : (
                  panel(true)
                )
              }}
            </ResizableRegion>
          ) : null}

          {music && pistaSonando && (caraSonando === 'lyrics' || caraSonando === 'disc') ? (
            /* La letra o el disco **toman el panel del medio**, como en
               Spotify: es contenido para mirar, no una ficha, y el lugar para
               mirar es el grande. El panel derecho vuelve a la ficha del
               artista mientras tanto. Se sale con el mismo botón de la barra. */
            <CentroSonando cara={caraSonando} pista={pistaSonando} sonando={sonandoAhora} />
          ) : openPlaylist ? (
            <PlaylistView
              playlist={openPlaylist}
              reloadToken={reloadToken}
              onChanged={() => void loadPlaylists()}
              onPickCover={() => void pickCover(openPlaylist)}
              onRename={async (name) => {
                await renamePlaylist(openPlaylist.id, name)
                await loadPlaylists()
              }}
              onDelete={() => void removePlaylist(openPlaylist)}
              onClose={goBack}
              onSearch={() => searchRef.current?.focus()}
              /* Elegir un archivo pide un sistema de archivos a mano: la fila
                 solo existe en la web. */
              onSubirArchivo={
                Platform.OS === 'web'
                  ? () => void subirArchivoALista(openPlaylist)
                  : undefined
              }
              menuFor={(track) =>
                menuForTrack(playlistTrackAsResult(track), openPlaylist.id)
              }
              /* El pie de sugerencias usa los mismos caminos que el buscador:
                 sumar resuelve el audio y recarga; escuchar no guarda nada. */
              onAddSugerencia={(track) => void addToPlaylist(openPlaylist, track)}
              onPlaySugerencia={(track) => void playSearchResult(track)}
              pendingId={addingTrack}
            />
          ) : music && view.kind === 'search' ? (
            /*
             * El buscador como pantalla, no como desplegable.
             *
             * En el teléfono los resultados ocupan todo el alto en vez de
             * flotar sobre el contenido: el desplegable nació para colgar de un
             * campo en una ventana grande, y acá tapaba lo que quedaba de
             * pantalla sin llegar a mostrar ni cinco resultados.
             */
            <Panel className="flex-1">
              {/*
               * El campo va **abajo**, no arriba.
               *
               * Es donde lo pone Apple Music, y la razón es el pulgar: en un
               * teléfono el buscador se usa con una mano y el borde de arriba
               * es justo el punto más lejos. Con el teclado abierto sube y se
               * apoya sobre él, así lo que escribís queda siempre a la vista.
               *
               * Y de paso el contenido corre por detrás: es lo que le da algo
               * que difuminar al vidrio del campo.
               */}
              <View className="min-h-0 flex-1">
                {conversationQuery.trim() ? (
                <SearchDropdown
                  visible
                  embedded
                  loading={searchingContacts}
                  results={trackResults}
                  error={searchError}
                  /* El historial se escribe al **elegir**, no al teclear: lo
                     escrito a medias no es una búsqueda, es el camino hacia
                     una. Ver `state/recientes`. */
                  onSelect={(track) => {
                    recordarBusqueda(conversationQuery)
                    void playSearchResult(track)
                  }}
                  onPlay={(track) => {
                    recordarBusqueda(conversationQuery)
                    void playSearchResult(track)
                  }}
                  artists={artistResults}
                  onOpenArtist={(a) => {
                    recordarBusqueda(conversationQuery)
                    changeGlobalSearch('')
                    go({ kind: 'artist', id: a.id, name: a.name })
                  }}
                  pendingId={addingTrack}
                  /* Sin «+» rápido: en esta pestaña no hay una lista abierta a
                     la que sumar. El destino se elige desde los tres puntos. */
                  menuFor={menuForTrack}
                  /* El encabezado flota: los resultados arrancan debajo y
                     pasan por detrás del velo al desplazar. */
                  topInset={techo}
                />
                ) : (
                  /* Sin nada escrito, lo último que buscaste. Corre por debajo
                     del campo y se difumina a través del vidrio. */
                  <SearchRecents
                      onPick={(termino) => {
                      changeGlobalSearch(termino)
                      searchRef.current?.focus()
                    }}
                  />
                )}

              </View>
            </Panel>
          ) : music && view.kind === 'library' ? (
            /* La biblioteca como pantalla completa: es la pestaña «Listas» del
               teléfono. Antes aparecía acá por descarte —no entraba el panel
               lateral— y la app abría siempre en «Tus listas» en vez de en la
               portada. */
            <PlaylistLibrary
              playlists={playlists}
              openId={null}
              soundingId={soundingPlaylistId}
              showCollapse={false}
              onCollapse={() => undefined}
              onOpen={(p) => go({ kind: 'playlist', id: p.id })}
              onCreate={createAndOpen}
              error={playlistError}
            />
          ) : music && collection ? (
            <Panel className="flex-1">
              <ScrollView
                className="min-h-0 flex-1"
                /* El techo, como el piso: el contenido corre hasta los bordes
                   y el hueco para el encabezado se reserva adentro. */
                contentContainerStyle={{ paddingTop: techo, paddingBottom: cascara }}
                {...colapsoPantalla}
              >
                <AlbumPanel
                  albumId={collection.id}
                  kind={collection.kind}
                  onBack={goBack}
                  menuFor={(track, artwork) => menuForTrack(albumTrackAsResult(track, artwork))}
                  onPlayAll={(tracks, artwork) => {
                    const primera = tracks[0]
                    if (primera) void playSearchResult(albumTrackAsResult(primera, artwork))
                  }}
                  onPlay={(track, artwork) =>
                    void playSearchResult(albumTrackAsResult(track, artwork))
                  }
                  onAdd={(track, artwork) => {
                    const asResult = albumTrackAsResult(track, artwork)
                    if (openPlaylist) void addToPlaylist(openPlaylist, asResult)
                    else void startPlaylistWith(asResult)
                  }}
                  pendingId={addingTrack}
                />
              </ScrollView>
            </Panel>
          ) : music && view.kind === 'artist' ? (
            <Panel className="flex-1">
              <ScrollView
                className="min-h-0 flex-1"
                /* Mismo techo que el álbum: la cabecera del artista arranca
                   debajo del encabezado flotante y pasa por detrás al subir. */
                contentContainerStyle={{ paddingTop: techo, paddingBottom: cascara }}
                {...colapsoPantalla}
              >
                <ArtistPage
                  artistId={view.id}
                  onBack={goBack}
                  onPlaySong={(song: ArtistSong) => void playSearchResult(song)}
                  onOpenAlbum={(item: HomeItem) =>
                    go({
                      kind: 'collection',
                      collection: {
                        kind: 'album',
                        id: item.id,
                        name: item.title,
                        artistId: view.kind === 'artist' ? view.id : null,
                      },
                    })
                  }
                  menuForSong={menuForTrack}
                  pendingId={addingTrack}
                />
              </ScrollView>
            </Panel>
          ) : music ? (
            /* Sin lista abierta, el medio es la portada: novedades y lo que
               está sonando afuera, en vez de un cartel pidiendo que elijas. */
            <HomeFeed
              section={homeSection}
              /* Cerrar la sección es volver, no apilar otra portada: si no,
                 la flecha de atrás terminaría repitiendo la misma pantalla. */
              onOpenSection={(section) => (section ? go({ kind: 'home', section }) : goBack())}
              onOpenAlbum={(item) =>
                go({
                  kind: 'collection',
                  collection: {
                    kind: 'album',
                    id: item.id,
                    name: item.title,
                    artistId: null,
                  },
                })
              }
              onOpenPlaylist={(item) =>
                go({
                  kind: 'collection',
                  collection: {
                    kind: 'playlist',
                    id: item.id,
                    name: item.title,
                    artistId: null,
                  },
                })
              }
              onPlaySong={(item) => void playSearchResult(homeItemAsResult(item))}
              menuForSong={(item) => menuForTrack(homeItemAsResult(item))}
              pendingId={addingTrack}
            />
          ) : suelto && !chatAbierto ? (
            /* La lista de conversaciones, ocupando la pantalla. Elegir una
               abre el hilo; la flecha de la cabecera vuelve acá. */
            <View className="min-h-0 flex-1">
              <ConversationSidebar
                conversations={visibleConversations}
                filtered={conversationQuery.trim().length > 0}
                activePairId={activePairId}
                hovered={false}
                onCollapse={() => undefined}
                onSelect={(pairId) => {
                  changeConversation(pairId)
                  setChatAbierto(true)
                }}
                onNew={() => openComposer(false)}
              />
            </View>
          ) : (
            <Panel className="flex-1">
              {contact ? (
                <View className="relative min-h-0 flex-1">
                  <View className="absolute left-0 right-0 top-0 z-20 flex-row items-center justify-between px-5 py-4">
                    <View className="min-w-0 flex-row items-center gap-3">
                      {/* Solo en el teléfono: en escritorio la lista está a la
                          izquierda, siempre a la vista, y no hay a dónde volver. */}
                      {suelto ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Volver a las conversaciones"
                          onPress={() => setChatAbierto(false)}
                          className="h-9 w-9 items-center justify-center rounded-full active:bg-muted"
                        >
                          <IconBack size={19} color={ICON_COLOR.foreground} />
                        </Pressable>
                      ) : null}
                      {/*
                       * La foto y el nombre abren su perfil.
                       *
                       * Es donde uno ya mira para saber con quién está
                       * hablando, así que es donde busca saber más. Un botón
                       * aparte para eso competiría con la flecha de volver en
                       * la misma esquina.
                       */}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Ver el perfil de ${contactName}`}
                        onPress={() => router.push(`/perfil/${contact.username}`)}
                        className="min-w-0 flex-row items-center gap-3 active:opacity-70"
                      >
                        <Avatar name={contactName} path={contact.avatarPath} size={40} />
                        <View className="min-w-0 gap-0.5">
                          <Text
                            className="text-foreground text-[15px] font-semibold"
                            numberOfLines={1}
                          >
                            {contact ? contactTitle(contact) : contactName}
                          </Text>
                          <Text className="text-muted-foreground text-xs">
                            {messageCountLabel(messages.length)}
                          </Text>
                        </View>
                      </Pressable>
                    </View>
                    <Text className="text-muted-foreground text-[11px]">En línea</Text>
                  </View>

                  {error ? (
                    <View className="p-5">
                      <Text className="text-destructive text-sm leading-5">{error}</Text>
                    </View>
                  ) : (
                    <Animated.View style={[{ flex: 1, minHeight: 0 }, sobreTeclado]}>
                    <FlatList
                      ref={hilo}
                      data={messages}
                      keyExtractor={(message) => message.id}
                      className="min-h-0 flex-1"
                      /* En el teléfono la barra de desplazamiento no aporta y
                         se dibuja sobre las burbujas. */
                      showsVerticalScrollIndicator={!suelto}
                      contentContainerClassName="gap-2 p-4"
                      contentContainerStyle={{
                        flexGrow: 1,
                        justifyContent: 'flex-end',
                        paddingTop: 104,
                        /* Lo que ocupa el reproductor —o el teclado— más el
                           campo y un respiro. Sin el respiro, el último mensaje
                           queda pegado al campo y parece cortado; con más, se
                           abre un hueco muerto. */
                        paddingBottom: pisoChat + (draft.song ? 168 : 92),
                      }}
                      ListEmptyComponent={<EmptyThread contactName={contactName} />}
                      renderItem={({ item }) => (
                        <ChatBubble
                          message={item}
                          mine={isSentBy(item, myUid)}
                          selected={showDetail && selected?.id === item.id}
                          playing={player.currentId === item.id && player.playing}
                          positionMs={
                            player.currentId === item.id
                              ? player.positionMs
                              : (item.song?.startMs ?? 0)
                          }
                          onPlay={() =>
                            item.song
                              ? player
                                  .toggle(item.id, item.song)
                                  .catch((e: unknown) => avisar(mensajeError(e), true))
                              : undefined
                          }
                          onSeek={(fraction) =>
                            item.song
                              ? player
                                  .seek(item.id, item.song, fraction)
                                  .catch((e: unknown) => avisar(mensajeError(e), true))
                              : undefined
                          }
                          onPress={() => openMessage(item.id)}
                        />
                      )}
                    />
                    </Animated.View>
                  )}

                  <LinearGradient
                    pointerEvents="none"
                    colors={['rgba(18,18,18,1)', 'rgba(18,18,18,1)', 'rgba(18,18,18,0)']}
                    locations={[0, 0.62, 1]}
                    style={{
                      position: 'absolute',
                      zIndex: 10,
                      left: 0,
                      right: 0,
                      top: 0,
                      height: 124,
                    }}
                  />

                  {/* Con vidrio no va: terminaría opaco justo detrás del campo
                      y el material difuminaría un gris plano en vez del hilo.
                      Es la misma razón por la que no está detrás de las
                      pestañas — ver `docs/DESIGN.md`, sección Vidrio. */}
                  {HAY_VIDRIO ? null : (
                  <LinearGradient
                    pointerEvents="none"
                    colors={['rgba(18,18,18,0)', 'rgba(18,18,18,0.92)', 'rgba(18,18,18,1)']}
                    locations={[0, 0.48, 1]}
                    /* Arranca del piso y sube por encima del campo: si empezara
                       recién arriba del reproductor, los mensajes se leerían
                       enteros por detrás de lo que estás escribiendo. */
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: 0,
                      height: pisoChat + (draft.song ? 220 : 145),
                    }}
                  />
                  )}

                  {/*
                   * Por encima del reproductor, nunca debajo: una lista puede
                   * correr por detrás y disolverse, pero lo que estás
                   * escribiendo tenés que poder verlo.
                   *
                   * Se mueve con `translateY` atado al alto **real** del
                   * teclado, igual que la cáscara: antes era un `bottom` que
                   * saltaba a destino en un cuadro y esperaba ahí. Ver
                   * `sobreTeclado` en `app/_layout.tsx`.
                   *
                   * El layout va inline y no por `className`: NativeWind no
                   * procesa clases en componentes animados —está en
                   * `docs/DESIGN.md`— y el campo quedaría suelto arriba a la
                   * izquierda.
                   */}
                  <Animated.View
                    style={[
                      {
                        position: 'absolute',
                        left: 12,
                        right: 12,
                        zIndex: 20,
                        gap: 8,
                        bottom: cascara + 4,
                      },
                      sobreTeclado,
                    ]}
                  >
                    {draft.song ? (
                      <Glass radius={14} style={HAY_VIDRIO ? {} : { backgroundColor: 'rgb(24,24,24)' }}>
                      <View className="flex-row items-center gap-3 p-2.5">
                        {draft.song.artworkUrl ? (
                          <Image
                            source={{
                              uri:
                                artworkSource(draft.song.artworkPath, draft.song.artworkUrl, 96) ??
                                '',
                            }}
                            className="h-11 w-11 rounded-lg bg-muted"
                          />
                        ) : (
                          <View className="h-11 w-11 items-center justify-center rounded-lg bg-muted">
                            <IconMusic size={17} color={ICON_COLOR.muted} />
                          </View>
                        )}
                        <View className="min-w-0 flex-1">
                          <Text
                            className="text-foreground text-[13px] font-semibold"
                            numberOfLines={1}
                          >
                            {draft.song.title}
                          </Text>
                          <Text className="text-muted-foreground text-[11px]" numberOfLines={1}>
                            {draft.song.artist} · {Math.round(draft.song.durationMs / 1000)} s
                          </Text>
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Quitar canción"
                          onPress={() => setDraft({ song: null })}
                          className="h-9 w-9 items-center justify-center rounded-full bg-muted"
                        >
                          <IconClose size={16} color={ICON_COLOR.muted} />
                        </Pressable>
                      </View>
                      </Glass>
                    ) : null}

                    {composerError ? (
                      <Text className="px-5 pb-1 text-destructive text-xs">{composerError}</Text>
                    ) : null}

                    <View className="flex-row items-end gap-2 px-1 pb-1">
                      {/* Los tres controles en vidrio: flotan sobre el hilo,
                          que corre y se difumina por detrás. Es el caso que
                          `docs/DESIGN.md` describe para el material. */}
                      <BotonVidrio
                        label="Adjuntar canción"
                        onPress={() => {
                          setDraft({ recipient: contact })
                          router.push('/song')
                        }}
                        radius={22}
                        style={{ width: 44, height: 44 }}
                      >
                        <IconMusic size={18} color={ICON_COLOR.muted} />
                      </BotonVidrio>
                      <Glass radius={22} style={{ flex: 1 }}>
                        <TextInput
                          value={draft.text}
                          onChangeText={(text) => setDraft({ text })}
                          placeholder={`Mensaje para @${contactName}`}
                          placeholderTextColor="#777777"
                          accessibilityLabel="Mensaje"
                          multiline
                          maxLength={2000}
                          className={`max-h-28 min-h-11 min-w-0 flex-1 px-4 py-3 text-foreground text-[15px] ${
                            HAY_VIDRIO ? '' : 'bg-muted'
                          }`}
                        />
                      </Glass>
                      {/* Teñido con el acento cuando hay algo que mandar: es la
                          acción principal de la pantalla, y es el único
                          prominente que hay acá. Vacío se queda neutro. */}
                      <BotonVidrio
                        label="Enviar mensaje"
                        disabled={sending || (!draft.text.trim() && !draft.song)}
                        onPress={() => void sendChatMessage()}
                        radius={22}
                        tint={draft.text.trim() || draft.song ? ICON_COLOR.foreground : undefined}
                        style={{ width: 44, height: 44 }}
                      >
                        {sending ? (
                          <ActivityIndicator color={ICON_COLOR.onPrimary} />
                        ) : (
                          <IconSend
                            size={17}
                            color={
                              draft.text.trim() || draft.song
                                ? ICON_COLOR.onPrimary
                                : ICON_COLOR.muted
                            }
                          />
                        )}
                      </BotonVidrio>
                    </View>
                  </Animated.View>
                </View>
              ) : (
                <NoConversation onNew={() => openComposer(false)} />
              )}
            </Panel>
          )}

          {showDetail ? (
            <ResizableRegion
              width={rightWidth}
              collapsed={rightCollapsed}
              minWidth={300}
              maxWidth={520}
              resizeEdge="left"
              onWidthChange={setRightWidth}
            >
              {({ hovered }) => {
                // Mismo criterio que a la izquierda: la previa del panel
                // contraído es lo que hay realmente abajo, no una vista fija.
                const panel = (vivo: boolean) =>
                  music ? (
                    /* Al lado de una lista, lo que sirve es de quién es lo que
                       está sonando — no el detalle de un mensaje. */
                    <NowPlayingPanel
                      showCollapse={vivo && hovered}
                      onCollapse={vivo ? () => setRightCollapsed(true) : () => undefined}
                    />
                  ) : (
                    <Panel tone="lateral" className="flex-1">
                      <Detail
                        message={selected}
                        mine={selected ? isSentBy(selected, myUid) : false}
                        contactName={contactName}
                        playing={selected?.id === player.currentId && player.playing}
                        positionMs={player.positionMs}
                        showCollapse={vivo && hovered}
                        onCollapse={vivo ? () => setRightCollapsed(true) : () => undefined}
                        onPlay={
                          vivo && selected?.song
                            ? () =>
                                player
                                  .toggle(selected.id, selected.song!)
                                  .catch((e: unknown) => avisar(mensajeError(e), true))
                            : () => undefined
                        }
                      />
                    </Panel>
                  )

                return rightCollapsed ? (
                  <CollapsedSidebar
                    side="right"
                    hovered={hovered}
                    onExpand={() => setRightCollapsed(false)}
                  />
                ) : (
                  panel(true)
                )
              }}
            </ResizableRegion>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  )
}

/**
 * Un redondel del encabezado: atrás, adelante, inicio.
 *
 * Apagado sigue estando —no desaparece— para que la fila no se mueva cuando se
 * puede volver y cuando no: un botón que se corre mientras uno lo va a tocar es
 * peor que uno que no hace nada.
 */
/**
 * La letra o el disco en el panel del medio, al modo de Spotify.
 *
 * Son contenido para **mirar** —no una ficha— y el lugar para mirar es el
 * panel grande; en la columna angosta de la derecha la letra entraba apretada
 * y el disco de a ratos. Mientras esta cara está tomada, el panel derecho
 * vuelve a la ficha del artista, y se sale con el mismo botón de la barra que
 * la abrió.
 */
function CentroSonando({
  cara,
  pista,
  sonando,
}: {
  cara: 'lyrics' | 'disc'
  pista: {
    title: string
    artist: string
    durationMs: number
    artworkUrl?: string | null
    artworkPath?: string | null
  }
  sonando: boolean
}) {
  const techo = useTecho(16)
  const piso = usePiso(16)

  return (
    <Panel className="min-h-0 flex-1">
      {cara === 'lyrics' ? (
        /* Topada a un ancho de lectura y centrada, como la letra de Spotify:
           una línea de lado a lado en 1440px no se puede seguir con la vista. */
        <View
          className="min-h-0 w-full max-w-3xl flex-1 self-center px-8"
          style={{ paddingTop: techo, paddingBottom: piso }}
        >
          <LyricsView track={pista} translatable />
        </View>
      ) : (
        <View
          className="min-h-0 flex-1 items-center justify-center gap-7 px-8"
          style={{ paddingTop: techo, paddingBottom: piso }}
        >
          <SongDisc
            artworkUrl={pista.artworkUrl}
            artworkPath={pista.artworkPath}
            title={pista.title}
            playing={sonando}
            size={340}
          />
          <View className="gap-1">
            <Text className="text-foreground text-center text-xl font-bold" numberOfLines={2}>
              {pista.title}
            </Text>
            <Text className="text-muted-foreground text-center text-[14px]" numberOfLines={1}>
              {pista.artist}
            </Text>
          </View>
        </View>
      )}
    </Panel>
  )
}

function HeaderButton({
  label,
  icon,
  onPress,
  disabled = false,
}: {
  label: string
  icon: React.ReactNode
  onPress: () => void
  disabled?: boolean
}) {
  /* El mismo vidrio que sus vecinos de la fila —el perfil, la salida, la
     lupa—: eran los únicos redondeles del encabezado que seguían en gris
     plano. Sin vidrio, `BotonVidrio` ya cae solo al gris de siempre. */
  return (
    <BotonVidrio
      label={label}
      onPress={onPress}
      disabled={disabled}
      radius={22}
      style={{ width: 44, height: 44 }}
    >
      {icon}
    </BotonVidrio>
  )
}

function ConversationSidebar({
  conversations,
  filtered,
  activePairId,
  hovered,
  onCollapse,
  onSelect,
  onNew,
}: {
  conversations: Conversation[]
  /** Hay una búsqueda escrita: cambia qué decir cuando la lista está vacía. */
  filtered: boolean
  activePairId: string | null
  hovered: boolean
  onCollapse: () => void
  onSelect: (pairId: string) => void
  onNew: () => void
}) {
  /* En el teléfono esto es la pestaña «Chats» y llega hasta el borde. */
  const piso = usePiso(8)
  /* Y arriba el encabezado flota: el título arranca debajo, con el respiro
     que ya tenía (`pt-4`). En escritorio el techo es 0 y queda igual. */
  const techo = useTecho(16)
  const colapso = useColapso()

  return (
    <Panel tone="lateral" className="flex-1">
      <View className="flex-row items-center justify-between gap-4 px-4 pb-2" style={{ paddingTop: techo }}>
        <AnimatedSidebarTitle
          visible={hovered}
          label="Colapsar conversaciones"
          icon={<IconCollapseLeft size={17} color={ICON_COLOR.muted} />}
          onPress={onCollapse}
          alignIconToFirstLine
        >
          <View className="gap-0.5">
            <Text className="text-foreground text-lg font-bold" numberOfLines={1}>
              Conversaciones
            </Text>
            <Text className="text-muted-foreground text-xs" numberOfLines={1}>
              {conversations.length} {conversations.length === 1 ? 'contacto' : 'contactos'}
            </Text>
          </View>
        </AnimatedSidebarTitle>
        <View className="shrink-0 flex-row items-center">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Agregar un contacto"
            onPress={onNew}
            className="h-10 flex-row items-center justify-center gap-1.5 rounded-full bg-muted px-3 active:opacity-80"
          >
            <IconPlus size={16} color={ICON_COLOR.foreground} />
            <Text className="text-foreground text-xs font-semibold">Contacto</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(conversation) => conversation.pairId}
        contentContainerClassName="gap-1 p-2"
        contentContainerStyle={{ paddingBottom: piso }}
        {...colapso}
        ListEmptyComponent={
          <View className="items-center gap-3 px-5 py-16">
            <IconInbox size={24} color={ICON_COLOR.muted} />
            {/* Una cuenta recién creada no tiene conversaciones, y decirle que
                "no coinciden" da a entender que filtró algo que no filtró. */}
            <Text className="text-muted-foreground text-center text-sm leading-5">
              {filtered
                ? 'No hay conversaciones que coincidan.'
                : 'Todavía no tenés conversaciones. Buscá una cuenta para empezar.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: item.pairId === activePairId }}
            onPress={() => onSelect(item.pairId)}
            className={`flex-row items-center gap-3 rounded-lg p-2.5 active:opacity-80 ${
              item.pairId === activePairId ? 'bg-muted' : ''
            }`}
          >
            <Avatar name={contactLabel(item.contact)} path={item.contact.avatarPath} size={44} />
            <View className="min-w-0 flex-1 gap-0.5">
              <View className="flex-row items-center gap-2">
                <Text
                  className="min-w-0 flex-1 text-foreground text-[14px] font-semibold"
                  numberOfLines={1}
                >
                  {contactTitle(item.contact)}
                </Text>
                {item.lastMessageAt ? (
                  <Text className="text-muted-foreground text-[10px]">
                    {formatMessageDate(item.lastMessageAt)}
                  </Text>
                ) : null}
              </View>
              <View className="flex-row items-center gap-2">
                <Text className="min-w-0 flex-1 text-muted-foreground text-xs" numberOfLines={1}>
                  {item.lastMessageText.trim() || 'Canción compartida'}
                </Text>
                {item.unreadCount > 0 ? (
                  <View className="min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5">
                    <Text className="text-primary-foreground text-[10px] font-semibold">
                      {Math.min(item.unreadCount, 99)}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </Pressable>
        )}
      />
    </Panel>
  )
}

function GlobalSearchResults({
  loading,
  results,
  error,
  onSelect,
}: {
  loading: boolean
  results: ContactResult[]
  error: string | null
  onSelect: (result: ContactResult) => void
}) {
  /* Igual que los resultados de canciones: la lista termina antes del teclado
     en vez de seguir por debajo, donde no se llega. */
  const teclado = useKeyboardH()

  return (
    <View
      className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[420px] overflow-hidden rounded-xl bg-card p-2"
      style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
    >
      {loading ? (
        <SkeletonList rows={5} />
      ) : error ? (
        <Text className="px-4 py-8 text-center text-muted-foreground text-sm">{error}</Text>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: teclado }}
        >
          {results.map((result) => (
            <Pressable
              key={result.id}
              accessibilityRole="button"
              onPress={() => onSelect(result)}
              className="flex-row items-center gap-3 rounded-lg p-2.5 active:bg-muted"
            >
              <Avatar name={contactLabel(result)} path={result.avatarPath} size={40} />
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="text-foreground text-[14px] font-semibold" numberOfLines={1}>
                  {contactTitle(result)}
                </Text>
                <Text className="text-muted-foreground text-[11px]" numberOfLines={1}>
                  {result.displayName?.trim() ? `@${result.username} · ` : ''}
                  {result.pairId ? 'Abrir conversación' : 'Iniciar conversación'}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  )
}

function Detail({
  message,
  mine,
  contactName,
  playing,
  positionMs,
  showCollapse,
  onCollapse,
  onPlay,
}: {
  message: Message | null
  mine: boolean
  contactName: string
  playing: boolean
  positionMs: number
  showCollapse: boolean
  onCollapse: () => void
  onPlay: () => void
}) {
  /* Lo que tapa el reproductor flotante. Va antes del `if`: los hooks no
     pueden quedar detrás de un retorno temprano. */
  const pisoDetalle = usePiso(32)
  if (!message) {
    return (
      <View className="flex-1">
        <View className="flex-row items-center justify-between px-5 pt-4">
          <AnimatedSidebarTitle
            visible={showCollapse}
            label="Colapsar detalle"
            icon={<IconCollapseRight size={17} color={ICON_COLOR.muted} />}
            onPress={onCollapse}
          >
            <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-[0.8px]">
              Detalle
            </Text>
          </AnimatedSidebarTitle>
        </View>
        {/* Centrado en lo que se ve, descontando lo que tapa el reproductor:
            a secas, el cartel cae justo detrás de la barra. */}
        <View
          className="flex-1 items-center justify-center gap-3 p-8"
          style={{ paddingBottom: pisoDetalle }}
        >
          <View className="h-12 w-12 items-center justify-center rounded-full bg-muted">
            <IconMusic size={22} color={ICON_COLOR.muted} />
          </View>
          <Text className="text-foreground text-base font-semibold">Detalle musical</Text>
          <Text className="text-muted-foreground text-center text-sm leading-5">
            Elegí un mensaje para ver su contenido y escuchar su canción.
          </Text>
        </View>
      </View>
    )
  }

  const song = message.song
  const isSounding = playing && song !== null

  return (
    /* Igual que el panel de lo que suena: lo que tapa el reproductor se reserva
       adentro del contenido, no se deja que lo corte. Ver `usePiso`. */
    <ScrollView
      contentContainerClassName="gap-5 p-5"
      contentContainerStyle={{ paddingBottom: pisoDetalle }}
    >
      <View className="flex-row items-center justify-between">
        <AnimatedSidebarTitle
          visible={showCollapse}
          label="Colapsar detalle"
          icon={<IconCollapseRight size={17} color={ICON_COLOR.muted} />}
          onPress={onCollapse}
        >
          <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-[0.8px]">
            Detalle
          </Text>
        </AnimatedSidebarTitle>
      </View>
      <View className="flex-row items-center gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-full bg-muted">
          <Text className="text-foreground text-sm font-semibold uppercase">
            {contactInitial(contactName)}
          </Text>
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
            {mine ? `Para @${contactName}` : `De @${contactName}`}
          </Text>
          {message.createdAt ? (
            <Text className="text-muted-foreground text-xs">
              {formatMessageDate(message.createdAt, true)}
            </Text>
          ) : null}
        </View>
      </View>

      {message.text.length ? (
        <View className="rounded-xl bg-card p-4">
          <Text className="text-card-foreground text-[16px] leading-6">{message.text}</Text>
        </View>
      ) : null}

      {song ? (
        <View className="gap-4">
          {song.artworkUrl ? (
            <Image
              source={{
                uri: artworkSource(song.artworkPath, song.artworkUrl, 640) ?? '',
              }}
              className="aspect-square w-full max-w-[320px] self-center rounded-xl bg-muted"
            />
          ) : (
            <View className="aspect-square w-full max-w-[320px] self-center items-center justify-center rounded-xl bg-muted">
              <IconMusic size={32} color={ICON_COLOR.muted} />
            </View>
          )}
          <View className="flex-row items-center gap-3">
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="text-foreground text-lg font-semibold" numberOfLines={2}>
                {song.title}
              </Text>
              <Text className="text-muted-foreground text-[13px]" numberOfLines={1}>
                {song.artist} · {Math.round(song.durationMs / 1000)} s
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={playing ? 'Pausar' : 'Reproducir el fragmento'}
              onPress={onPlay}
              className="h-12 w-12 items-center justify-center rounded-full bg-primary active:opacity-80"
            >
              {playing ? (
                <IconPause size={17} color={ICON_COLOR.onPrimary} />
              ) : (
                <IconPlay size={17} color={ICON_COLOR.onPrimary} />
              )}
            </Pressable>
          </View>
          {song.lyrics?.length ? (
            isSounding ? (
              <Lyrics lines={song.lyrics} atMs={positionMs} visible={3} />
            ) : (
              <Text className="text-muted-foreground text-xs">
                Dale play y la letra sigue al fragmento.
              </Text>
            )
          ) : null}
        </View>
      ) : (
        <View className="flex-row items-center gap-2 rounded-lg bg-card px-4 py-3">
          <IconMusic size={16} color={ICON_COLOR.muted} />
          <Text className="text-muted-foreground text-xs">Sin canción adjunta</Text>
        </View>
      )}
    </ScrollView>
  )
}

function EmptyThread({ contactName }: { contactName: string }) {
  return (
    <View className="items-center justify-center gap-3 px-6 py-24">
      <View className="h-14 w-14 items-center justify-center rounded-full bg-card">
        <IconInbox size={24} color={ICON_COLOR.muted} />
      </View>
      <Text className="text-foreground text-lg font-semibold">Conversación nueva</Text>
      <Text className="max-w-xs text-center text-muted-foreground text-sm leading-5">
        Escribile el primer mensaje a {contactName}.
      </Text>
    </View>
  )
}

function NoConversation({ onNew }: { onNew: () => void }) {
  return (
    <View className="flex-1 items-center justify-center gap-4 p-8">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-card">
        <IconInbox size={27} color={ICON_COLOR.muted} />
      </View>
      <View className="items-center gap-1.5">
        <Text className="text-foreground text-lg font-semibold">Empezá una conversación</Text>
        <Text className="max-w-sm text-center text-muted-foreground text-sm leading-5">
          Buscá una cuenta y mandale un mensaje o una canción.
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onNew}
        className="flex-row items-center gap-2 rounded-full bg-primary px-6 py-3 active:opacity-80"
      >
        <IconPlus size={16} color={ICON_COLOR.onPrimary} />
        <Text className="text-primary-foreground text-xs font-semibold uppercase tracking-[1.2px]">
          Buscar contacto
        </Text>
      </Pressable>
    </View>
  )
}

function messageCountLabel(count: number): string {
  if (count === 0) return 'Conversación nueva'
  return `${count} ${count === 1 ? 'mensaje' : 'mensajes'}`
}
