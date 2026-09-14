import { BordeScrollNativo, HAY_BORDE_SCROLL_NATIVO } from '../src/ui/CollectionScrollEdge'
import { CabeceraChats, CargaChats, FilaConversacion, FilaSolicitudChat, TituloSeccionChats } from '../src/ui/ContenidoChats'
import { BotonSuperficie } from '../src/ui/BotonSuperficie'
import { IconButton } from '../src/ui/IconButton'
import type { SearchFieldHandle } from '../src/ui/SearchField.types'
import { MessageDetailBody as Detail } from '../src/ui/MessageDetailBody'
import { invitacionEnTexto } from '../src/lib/invitacionJam'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Image,
  Platform,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { formatMessageDate } from '../src/ui/MessageCard'
import { ChatBubble } from '../src/ui/ChatBubble'
import { MessageActionDialog } from '../src/ui/MessageActionDialog'
import { canModifyMessage, type MessageActionTarget } from '../src/ui/messageActions'
import { SkeletonList } from '../src/ui/Skeleton'
import { ResizableRegion } from '../src/ui/ResizableRegion'
import { CollapsedSidebar } from '../src/ui/SidebarMotion'
import { Panel } from '../src/ui/Panel'
import { CabeceraLateral, BotonLateral } from '../src/ui/CabeceraLateral'
import { BotonVolver } from '../src/ui/BotonVolver'
import { Avatar } from '../src/ui/Avatar'
import { isSentBy, type Message } from '../src/models/message'
import {
  endSession,
  openContactConversation,
  refreshConversations,
  respondToRequest,
  selectConversation,
  useCargandoConversaciones,
  useCargandoMensajes,
  useContact,
  useContactRequests,
  useConversations,
  useMessages,
  useMyProfile,
  usePairId,
  usePendientesChats,
  useSessionError,
  useUser,
} from '../src/state/session'
import { resetDraft, setDraft, useDraft } from '../src/state/draft'
import { CampoMensaje } from '../src/ui/CampoMensaje'
import { markThreadRead, sendMessage } from '../src/services/messages'
import { emailToUsername } from '../src/services/auth'
import {
  contactLabel,
  contactTitle,
  MINIMO_BUSQUEDA,
  searchContacts,
  sendContactRequest,
  toContact,
  type ContactRequest,
  type ContactResult,
  type Conversation,
} from '../src/services/contacts'
import { FilaCuenta } from '../src/ui/FilaCuenta'
import { Vacio } from '../src/ui/Vacio'
import { mensajeError } from '../src/lib/mensajeError'
import { TECLADO_FISICO } from '../src/lib/teclado'
import { alternarMeGusta, useMeGusta } from '../src/state/gustos'
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
  registerAbrirChat,
  registerAbrirArtista,
  registerAbrirLista,
  registerNewPlaylist,
  registerTabHandler,
  setDrawer,
  setEnChat,
  registerAbrirCara,
  setTab,
  setTechoH,
  usePiso,
  useTecho,
} from '../src/state/shell'
import { dejarCancionPendiente, suscribirListaCambiada } from '../src/state/listas'
import {
  abrirBusqueda,
  cerrarBusqueda,
  setTermino,
  useConsulta,
} from '../src/state/busqueda'
import {
  detachOrigin,
  enqueue,
  enqueueNext,
  canEnqueueNext,
  getPlaybackState,
  playQueue,
  registerPlaylistOpener,
  toggleView,
  useNowPlayingView,
  usePlaybackOriginId,
  usePlaybackTrack,
  useWantPlay,
} from '../src/state/playback'
import { hayJam } from '../src/state/jam'
import { SearchDropdown } from '../src/ui/SearchDropdown'
import { ScrollArea } from '../src/ui/ScrollArea'
import { ScrollAreaTecho } from '../src/ui/ScrollAreaContext'
import { SearchRecents } from '../src/ui/SearchRecents'
import { useColapso } from '../src/ui/useColapso'
import { BotonVidrio, Glass, HAY_VIDRIO } from '../src/ui/Glass'
import { recordarBusqueda } from '../src/state/recientes'
import { addShowcase } from '../src/services/showcases'
import { Menu, type MenuItem } from '../src/ui/Menu'
import { BarraLateral, CampoBusquedaLateral } from '../src/ui/BarraLateral'
import {
  addTrack,
  createPlaylist,
  deletePlaylist,
  listPlaylists,
  renamePlaylist,
  setPlaylistVisibility,
  makePlaylistCollaborative,
  uploadCover,
  type Playlist,
  type PlaylistTrack,
} from '../src/services/playlists'
import { PlaylistLibrary, PlaylistRail } from '../src/ui/PlaylistLibrary'
import { PlaylistView } from '../src/ui/PlaylistView'
import { MeGustaView, ORIGEN_GUSTOS } from '../src/ui/MeGusta'
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
  IconClose,
  IconGlobe,
  IconImage,
  IconDisc,
  IconInbox,
  IconHeart,
  IconHeartFilled,
  IconHome,
  IconLogOut,
  IconMusic,
  IconNewConversation,
  IconPlus,
  IconQueue,
  IconSearch,
  IconSend,
  IconLock,
  IconShare,
  IconSliders,
  IconTrash,
  IconUser,
  IconUsers,
} from '../src/ui/icons'
import { compartirLista } from '../src/lib/compartirLista'
import { dejarCancionACompartir } from '../src/state/compartir'
import { estadoControlWeb } from '../src/ui/estadoControl'

const SIDEBAR_PX = 780
const DETAIL_PX = 1120
/**
 * El campo de búsqueda de arriba, como hoja propia.
 *
 * Lee el término **inmediato** del store para dibujar cada tecla al toque,
 * mientras la pantalla grande mira la consulta asentada (con debounce). Así
 * teclear redibuja este campo chico y no el árbol entero de la pantalla. Ver
 * `state/busqueda`; misma idea que el campo del layout.
 */
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
  /** Todas las canciones con corazón. No es una playlist: ver `MeGustaView`. */
  | { kind: 'gustos' }
  | { kind: 'collection'; collection: Coleccion }
  | { kind: 'artist'; id: string; name: string }
  /** La grilla con todos los géneros, y la página de uno. Ver `HomeFeed`. */
  | { kind: 'generos' }
  | { kind: 'genero'; params: string; name: string }

export default function Home() {
  const messages = useMessages()
  const cargandoMensajes = useCargandoMensajes()
  const cargandoConversaciones = useCargandoConversaciones()
  const conversations = useConversations()
  const requests = useContactRequests()
  /* El globito del botón de conversaciones: solicitudes más no leídos. */
  const pendientesChats = usePendientesChats()
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
  const searchRef = useRef<SearchFieldHandle>(null)
  const [searchResults, setSearchResults] = useState<ContactResult[]>([])
  const [searchingContacts, setSearchingContacts] = useState(false)
  /** Cuenta cuya solicitud está saliendo, para mostrar la espera en su fila. */
  const [solicitando, setSolicitando] = useState<string | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [leftWidth, setLeftWidth] = useState(260)
  const [rightWidth, setRightWidth] = useState(360)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightPlegado, setRightPlegado] = useState(false)
  const [sending, setSending] = useState(false)
  const [composerError, setComposerError] = useState<string | null>(null)
  const [composerHeight, setComposerHeight] = useState(0)
  const [messageAction, setMessageAction] = useState<MessageActionTarget | null>(null)
  const editingInline = !TECLADO_FISICO && messageAction?.kind === 'edit'
  const draft = useDraft()
  const player = useSnippetPlayer()
  // Clear a dialog when its account/chat changes, before committing another frame.
  if (messageAction && (messageAction.pairId !== activePairId || messageAction.userId !== myUid)) {
    setMessageAction(null)
  }
  useEffect(() => {
    if (player.currentId && messages.some(message => message.id === player.currentId && message.deletedAt)) player.stop()
  }, [messages, player])
  const requestMessageAction = (kind: MessageActionTarget['kind'], message: Message) => {
    if (activePairId && canModifyMessage(message, myUid)) {
      setMessageAction({ kind, message, pairId: activePairId, userId: myUid })
    }
  }

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
  /*
   * Abrir el Jam o la cola desde la barra **despliega el panel derecho**.
   *
   * Esas dos caras viven ahí, y con el panel plegado a riel el toque cambiaba
   * la vista adentro de una franja de 64px: parecía que el botón no hacía
   * nada. Se deriva en vez de sincronizarse con un efecto: el pliegue que
   * eligió la persona queda guardado como deseo, la cara abierta lo destapa
   * mientras dure, y al cerrarla el panel vuelve a como estaba.
   */
  const rightCollapsed = rightPlegado && caraSonando !== 'jam' && caraSonando !== 'cola'
  const pistaSonando = usePlaybackTrack()
  const sonandoAhora = useWantPlay()
  /* Los corazones, para que el menú de una canción diga si ya está marcada.
     Se lee acá arriba y no fila por fila: es una sola suscripción para toda la
     pantalla, y la lista solo cambia cuando alguien marca algo. */
  const gustos = useMeGusta()
  /*
   * La letra o el disco **tomando el panel del medio**.
   *
   * Es una capa encima del medio, no una parada del historial: mientras está
   * puesta gana sobre lo que hubiera abajo —una lista, la portada, un chat— y
   * cualquier navegación la cierra (ver `dejarCara`). Sin eso, tocar «inicio»
   * con la letra abierta no hacía nada visible: la pila se iba al principio
   * detrás de una letra que seguía tapando todo.
   *
   * Solo en escritorio: en el teléfono estas caras viven en la pantalla del
   * reproductor (`app/playing.tsx`).
   */
  const caraCentro =
    !suelto && pistaSonando && (caraSonando === 'lyrics' || caraSonando === 'disc')
      ? caraSonando
      : null
  /** Volver de la letra o el disco al panel que había debajo. */
  const dejarCara = useCallback(() => {
    if (caraSonando === 'lyrics' || caraSonando === 'disc') toggleView(caraSonando)
  }, [caraSonando])
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
  /* Con la letra puesta hay adónde volver aunque la pila esté en su raíz: la
     flecha te saca de la letra, que es lo último que tapaste. */
  const canGoBack = !!caraCentro || at > 0
  const canGoForward = at < stack.length - 1

  /** Ir a algo nuevo: lo que hubiera adelante se pierde, como en cualquier navegador. */
  const go = useCallback(
    (next: Vista) => {
      dejarCara()
      setStack((s) => [...s.slice(0, at + 1), next])
      setAt(at + 1)
    },
    [at, dejarCara],
  )
  const goBack = useCallback(() => {
    /* Volver con la letra abierta es salir de la letra y nada más: es una capa
       sobre el medio, y retroceder además en el historial haría dos cosas con
       un toque. */
    if (caraCentro) return dejarCara()
    setAt((n) => Math.max(0, n - 1))
  }, [caraCentro, dejarCara])
  const goForward = useCallback(() => {
    dejarCara()
    setAt((n) => Math.min(stack.length - 1, n + 1))
  }, [stack.length, dejarCara])

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
  /*
   * Cuánto sube el campo de escribir para no quedar debajo de la cáscara.
   *
   * Es la cáscara **entera** —reproductor y pestañas— y no solo el
   * reproductor: con el contenedor llegando hasta el borde de abajo, medir
   * solo la tarjeta dejaba el campo escrito justo encima de las pestañas.
   */
  const cascara = usePiso()
  const colapsoPantalla = useColapso()
  const pisoChat = cascara
  // El composer sigue al teclado en UI. El hilo iOS reduce su viewport,
  // conservando la cabecera fija en vez de trasladar mensajes sobre ella.
  const tecladoVivo = useAnimatedKeyboard()
  const sobreTeclado = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.max(0, tecladoVivo.height.value - cascara) }],
  }))
  /*
   * Con teclado de verdad, el envoltorio que sigue al teclado **no va**.
   *
   * No es una micro-optimización: sin teclado en pantalla no hay nada que
   * seguir, y react-native-web le escribe `transform: matrix(1,0,0,1,0,0)` a
   * un `Animated.View` aunque esté quieto. Un ancestro con transform forma un
   * *backdrop root*, y eso dejaba al botón de enviar —que es de vidrio— sin
   * nada que difuminar: en la compu se veía gris plano. Ver `GlassAnimado`.
   *
   * Se decide con una constante que no cambia en toda la sesión, así que el
   * nodo nunca se remonta.
   */
  const Movible = TECLADO_FISICO ? View : Animated.View
  const seguirTeclado = TECLADO_FISICO ? null : sobreTeclado
  const espacioTeclado = useAnimatedStyle(() => ({
    marginBottom: Math.max(0, tecladoVivo.height.value - cascara),
  }))
  const ajusteHilo = Platform.OS === 'ios' ? espacioTeclado : seguirTeclado
  const espacioComposer = Platform.OS === 'ios' && composerHeight > 0
    ? composerHeight + 12
    : (draft.song ? 168 : 92)

  // Cuando el teclado cambia el viewport, sólo seguimos el último mensaje
  // si la persona ya estaba allí; leer mensajes anteriores conserva su lugar.
  const hilo = useRef<FlatList<Message>>(null)
  const altoContenidoHilo = useRef(0)
  /**
   * El hilo que ya se llevó al final.
   *
   * Antes esto era un `setTimeout` de 60 ms colgado del id de la conversación, y
   * ahí estaba el problema: a los 60 ms de cambiar de hilo **los mensajes todavía
   * no llegaron** —`selectConversation` deja la lista vacía y la llena el
   * tiempo real—, así que `scrollToEnd` corría sobre una lista vacía y no hacía
   * nada. Cuando aparecían los mensajes, el hilo se quedaba donde cayera: a
   * mitad de la conversación, con las últimas burbujas debajo del campo de
   * escribir. Se veía como si el chat estuviera cortado.
   *
   * Ahora se ubica cuando el contenido **se midió** —`onContentSizeChange`— y una
   * sola vez por conversación: los mensajes que lleguen después no te arrastran
   * si estabas leyendo para arriba.
   */
  const pegadoAlFinal = useRef(true)
  const hiloYaAnimo = useRef(false)
  useEffect(() => {
    pegadoAlFinal.current = true
    hiloYaAnimo.current = false
  }, [activePairId])

  /*
   * Se llama en **cada** medición del contenido, no una sola vez por hilo.
   *
   * Ubicar el hilo una vez no alcanza y se comprobó midiéndolo: al abrir una
   * conversación de 36 mensajes, `onContentSizeChange` dispara cuatro veces
   * —las burbujas se miden, las carátulas cargan, el alto sigue creciendo— y el
   * `scrollToEnd` de la primera queda a 2000px del final. Cada crecimiento
   * posterior aleja más el fondo, así que hay que volver a pegarse.
   */
  const ubicarHiloAlFinal = useCallback(
    (_ancho: number, alto: number) => {
      altoContenidoHilo.current = alto
      if (!pegadoAlFinal.current || messages.length === 0) return
      /*
       * `scrollToOffset` con el alto que trae el evento, y no `scrollToEnd`.
       *
       * `scrollToEnd` calcula el destino con la longitud que la FlatList tiene
       * anotada adentro, y acá esa cuenta se queda corta: medido, dejaba el
       * hilo **siempre** a 542px del final —el mismo número en cada corrida, no
       * una carrera— porque el relleno de abajo del `contentContainer` (el
       * hueco reservado para el campo de escribir) no entra en esa longitud.
       *
       * El alto que llega por parámetro sí es el del contenido completo. Pedir
       * ese offset se pasa de largo a propósito: la plataforma recorta al
       * máximo desplazable, que es exactamente el final.
       *
       * La primera baja se anima —es la que se ve al entrar— y las correcciones
       * de mientras se acomoda van instantáneas, para no reemplazar esa
       * animación con otra a mitad de camino.
       */
      const animar = !hiloYaAnimo.current
      hiloYaAnimo.current = true
      hilo.current?.scrollToOffset({ offset: alto, animated: animar })
    },
    [messages.length],
  )

  /**
   * Despegarse es cosa del dedo, no del propio scroll.
   *
   * Solo se mira la posición cuando **soltaste** el hilo: el `scrollToEnd` de
   * acá arriba pasa por posiciones lejísimos del final mientras anima, y si
   * `onScroll` decidiera, se despegaría a sí mismo a mitad de camino y no
   * llegaría nunca. Leyendo para arriba, los mensajes nuevos ya no te arrastran
   * —lo mismo que hace WhatsApp—, y volver al fondo te vuelve a enganchar.
   */
  const alSoltarHilo = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
    pegadoAlFinal.current =
      contentSize.height - layoutMeasurement.height - contentOffset.y < 80
  }, [])
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
  const sinHeader = !suelto || (!music && chatAbierto) || (Platform.OS === 'ios' && music && (view.kind === 'playlist' || view.kind === 'library'))
  const headerFlota = suelto && !sinHeader
  const techo = useTecho()
  useEffect(() => {
    if (!headerFlota) setTechoH(suelto ? 0 : TECLADO_FISICO ? 48 : 60)
  }, [headerFlota, suelto])

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

  /*
   * Lo que estás mirando ahora **es** el hilo, y no algo que lo tapa.
   *
   * En escritorio alcanza con estar en conversaciones con una elegida; en el
   * teléfono hace falta además haber entrado (`chatAbierto`), porque la lista
   * de conversaciones y el hilo comparten la pantalla. Y en los dos casos, la
   * letra puesta descalifica: tapa el panel entero.
   */
  const mirandoElHilo =
    !music && !!contact && !!activePairId && !caraCentro && (suelto ? chatAbierto : true)

  /*
   * Mirar la conversación es leerla.
   *
   * El globito de «sin leer» sale de `read_at`, y hasta acá lo único que lo
   * marcaba era la pantalla de **un** mensaje —la del teléfono—: en la ventana
   * grande se leían los tres mensajes nuevos y el número seguía ahí, tanto en
   * la fila de la conversación como en la campanita de arriba.
   *
   * Se marca cuando hay algo por marcar y no en cada render: `messages` cambia
   * también por el evento de realtime que devuelve el `read_at` recién puesto,
   * y sin esta guardia eso volvería a disparar el update en un ciclo. Al llegar
   * ese evento ya no queda ninguno sin leer y el efecto se queda quieto.
   *
   * Después se relee la bandeja: el conteo lo cuenta el servidor, no nosotros.
   */
  useEffect(() => {
    if (!mirandoElHilo || !activePairId) return
    if (!messages.some((m) => !isSentBy(m, myUid) && !m.readAt)) return
    markThreadRead(activePairId)
      .then(refreshConversations)
      .catch(() => {})
  }, [mirandoElHilo, activePairId, messages, myUid])
  /* Lo escrito vive en `state/busqueda`: el campo lo dibuja el layout, en la
     misma fila que las pestañas, y desde otro árbol. */
  /* La pantalla mira la consulta **asentada**, no lo que se teclea: así una
     tecla no la re-renderiza entera. El campo de arriba, que sí necesita lo
     inmediato, es su propia hoja (`CampoBusquedaArriba`). */
  const conversationQuery = useConsulta()


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

  /*
   * Poner una cara de la música, venga de donde venga.
   *
   * La barra del reproductor y el menú de la canción piden por acá en vez de
   * alternar la vista ellos mismos: estando en conversaciones el panel de la
   * derecha es el detalle del mensaje, así que la cara no tenía dónde
   * dibujarse y el botón no hacía nada. Se entra a música —que es donde la
   * cara se ve— y recién ahí se alterna.
   *
   * Alternar y no abrir: volver a tocar «Jam» con el Jam puesto lo cierra,
   * que es lo que ya hacía el botón y lo que espera cualquiera.
   */
  useEffect(() => {
    registerAbrirCara((cara) => {
      setMusic(true)
      toggleView(cara)
    })
    return () => registerAbrirCara(null)
  })

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
      /* Se relee la biblioteca porque este puente es justo el momento en que
         puede estar vieja: la lista que se pide abrir puede acabar de nacer en
         la hoja de crear, o de aparecer al entrar por un link de colaborar. Sin
         esto, la de atrás no la muestra hasta el próximo refresco. */
      void loadPlaylists()
    })
    return () => registerAbrirLista(null)
  })

  /*
   * Ir a un artista desde «Sonando», que es una hoja apilada sobre esta
   * pantalla y no sabe de paneles. Se entra a música y se apila la ficha sobre
   * lo que hubiera: volver atrás te deja donde estabas antes de abrir la hoja.
   */
  useEffect(() => {
    registerAbrirArtista((id, name) => {
      setMusic(true)
      go({ kind: 'artist', id, name })
    })
    return () => registerAbrirArtista(null)
  })

  /*
   * Abrir una conversación desde una notificación push.
   *
   * `setTab('chats')` primero: su handler resetea `chatAbierto`, así que el
   * abrir viene después y gana. Si la bandeja todavía no cargó —la app nació
   * del toque—, el pairId queda anotado y el efecto de abajo lo abre cuando
   * las conversaciones llegan.
   */
  const changeConversation = useCallback((pairId: string) => {
    /* Abrir una conversación es viajar al chat, y ahí la letra deja de ser lo
       que estabas mirando: el medio vuelve a ser el hilo. */
    dejarCara()
    resetDraft()
    setComposerError(null)
    selectConversation(pairId)
  }, [dejarCara])

  const chatPorAbrir = useRef<string | null>(null)
  useEffect(() => {
    registerAbrirChat((pairId) => {
      setTab('chats')
      setChatAbierto(true)

      if (conversations.some((c) => c.pairId === pairId)) {
        chatPorAbrir.current = null
        changeConversation(pairId)
        return
      }

      /*
       * La bandeja en memoria todavía no conoce esa conversación.
       *
       * No es un caso raro, es **el caso normal** de una notificación: el push
       * llega porque acaba de entrar un mensaje, así que la lista que tenemos es
       * justo la de antes de ese mensaje. Y `selectConversation` busca el hilo
       * en esa lista: si no está, no hace nada **y no avisa** (ver
       * `state/session`). El resultado era abrir el panel del chat con la
       * conversación anterior adentro — el «me dejó donde estaba» de siempre.
       *
       * Se pide la bandeja de nuevo y el efecto de abajo entra apenas llega.
       */
      chatPorAbrir.current = pairId
      void refreshConversations()
    })
    return () => registerAbrirChat(null)
  })

  useEffect(() => {
    const pendiente = chatPorAbrir.current
    if (!pendiente) return
    if (!conversations.some((c) => c.pairId === pendiente)) return
    chatPorAbrir.current = null
    changeConversation(pendiente)
    setChatAbierto(true)
  }, [conversations, changeConversation])

  /*
   * El buscador de arriba busca lo que corresponde al modo.
   *
   * En música, canciones para sumar a la lista abierta —es la única forma de
   * agregar, ya no hay botón adentro de la lista—; en conversaciones, cuentas.
   * Es el mismo campo porque es el mismo gesto: buscar lo que tenés a la vista.
   */
  useEffect(() => {
    const term = conversationQuery.trim()
    /* Vacío no se busca. Apagar los resultados es cosa del campo —pasa cuando
       alguien borra, que es un evento— y no de este efecto: tocar estado acá
       encadena renders de más. */
    if (!term) return

    /* `conversationQuery` ya llega con el debounce del store, así que acá no
       hace falta otro reloj: apenas la mano frena, se busca. */
    const controller = new AbortController()
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
    } else {
      searchContacts(term, controller.signal)
        .then((contacts) => {
          setSearchResults(contacts)
          /* Tres mensajes distintos para tres situaciones distintas: no
             escribiste lo suficiente, no hay nadie así, o encontré. */
          setSearchError(
            contacts.length
              ? null
              : term.trim().length < MINIMO_BUSQUEDA
                ? `Escribí al menos ${MINIMO_BUSQUEDA} letras del usuario o del nombre.`
                : 'No encontré ninguna cuenta.',
          )
          setSearchingContacts(false)
        })
        .catch((cause: unknown) => {
          if ((cause as Error).name === 'AbortError') return
          setSearchError('No se pudieron buscar las cuentas.')
          setSearchingContacts(false)
        })
    }

    return () => controller.abort()
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

  /*
   * Una hoja escribió una lista —«Agregar música», «Agregar a una lista»— y
   * avisa por `state/listas`. Es el mismo par de relecturas que al volver a
   * primer plano: la biblioteca, por el conteo, y la lista abierta, por sus
   * canciones. Sin esto la hoja se cerraba sobre una lista que seguía vieja.
   */
  useEffect(
    () =>
      suscribirListaCambiada(() => {
        void loadPlaylists()
        setReloadToken((n) => n + 1)
      }),
    [loadPlaylists],
  )

  // «Ver la lista», desde el menú de la barra de abajo. La barra vive en el
  // layout y no sabe mostrar listas; esta pantalla sí.
  useEffect(() => {
    registerPlaylistOpener(async (id) => {
      setMusic(true)
      /* «Tus me gusta» suena con este id de origen sin ser una lista: su
         pantalla es la colección de corazones, no una playlist. */
      if (id === ORIGEN_GUSTOS) {
        go({ kind: 'gustos' })
        return
      }
      /* Un álbum o lista ajena puesto como cola: el origen lleva el tipo y el
         id de navegación; el nombre vive en el origin de la cola que suena. */
      if (id.startsWith('coleccion:')) {
        const [, tipo, ...resto] = id.split(':')
        go({
          kind: 'collection',
          collection: {
            kind: tipo === 'playlist' ? 'playlist' : 'album',
            id: resto.join(':'),
            name: getPlaybackState().origin?.name ?? '',
            artistId: null,
          },
        })
        return
      }
      let mine = playlists ?? (await listPlaylists().catch(() => []))
      /*
       * Una lista que no está en la copia de acá puede ser nueva, no ajena.
       *
       * La copia se llena al montar esta pantalla y no se entera de lo que pasa
       * en otras: al volver de «Traer de Spotify» la lista recién creada no
       * figuraba, así que no se abría **y** la biblioteca seguía mostrando las
       * de antes. Antes de darla por inexistente se relee una vez.
       */
      if (!mine.some((p) => p.id === id)) mine = await listPlaylists().catch(() => mine)
      setPlaylists(mine)
      if (mine.some((p) => p.id === id)) go({ kind: 'playlist', id })
    })
    return () => registerPlaylistOpener(null)
  }, [playlists, go])

  /** El primer «Mi lista #N» que no choque con uno que ya tengas. */
  function nombreSugerido() {
    const used = new Set((playlists ?? []).map((p) => p.name))
    let n = (playlists?.length ?? 0) + 1
    while (used.has(`Mi lista #${n}`)) n++
    return `Mi lista #${n}`
  }

  /**
   * El «+» abre la hoja de crear, no crea nada.
   *
   * Antes creaba «Mi lista #N» y te dejaba adentro, sin preguntar — era lo que
   * hacía Spotify entonces y tenía su razón: el nombre se sabe después, cuando
   * ya viste en qué terminó. Eso vale mientras haya una sola clase de lista.
   *
   * Con las colaborativas hay una decisión que no es el nombre —a quién dejás
   * entrar— y que no se arregla igual de fácil después. Así que el «+» pregunta,
   * y de paso la lista **nace con el nombre puesto**: antes, arrepentirse a
   * mitad de camino dejaba una «Mi lista #4» vacía en la biblioteca para
   * siempre, porque la fila ya estaba creada antes de que decidieras nada.
   *
   * El nombre sugerido se calcula acá y viaja en la ruta: la biblioteca ya está
   * en memoria, y pedirla de nuevo desde la hoja sería un viaje a la red para
   * escribir un número.
   */
  async function createAndOpen() {
    router.push({ pathname: '/lista/nueva', params: { sugerido: nombreSugerido() } })
  }

  async function hacerColaborativa(playlist: Playlist) {
    if (!playlist.mia) return
    try {
      await makePlaylistCollaborative(playlist.id)
      await loadPlaylists()
      router.push({
        pathname: '/lista/personas',
        params: { id: playlist.id, nombre: playlist.name },
      })
    } catch (e) {
      avisar(mensajeError(e), true)
    }
  }


  async function pickCover(playlist: Playlist) {
    if (!user) return
    try {
      // El selector sabe solo si abrir el diálogo del navegador o el de fotos
      // del teléfono; acá da lo mismo de dónde salió la imagen.
      const picked = await pickImage()
      if (!picked) return
      await uploadCover(user.id, playlist.id, picked.blob, picked.fileName, picked.mime)
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
      if (!ok) avisar(`«${track.title}» ya está en ${playlist.name}.`)
      else {
        changeGlobalSearch('')
        setReloadToken((n) => n + 1)
        /* Sin esperar: es el conteo de la biblioteca, no parte de agregar. El
           «+» de la fila queda ocupado solo lo que tarda lo suyo. */
        void loadPlaylists()
      }
    } catch (e) {
      /* Solo por aviso: el cartel de `playlistError` vive pegado al título de
         la biblioteca, y agregar se hace desde el buscador de arriba o desde el
         pie de sugerencias — dos lugares desde donde ese rincón ni se mira.
         Además el motivo lo trae el servicio, y ahí no cabe. */
      avisar(`No se pudo agregar: ${mensajeError(e)}`, true)
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

  /**
   * Escuchar un resultado sin guardarlo en ninguna lista.
   *
   * El fallo va **solo por aviso**, como el de fijar en el perfil. Antes iba
   * también a `playlistError`, que se dibuja pegado al título de la biblioteca:
   * un cartel de una línea entra ahí, pero el de reproducir trae el motivo de
   * cada cliente de YouTube y son seis renglones que empujaban «Tus listas»
   * fuera del panel. Y encima se decía dos veces, arriba y abajo.
   */
  async function playSearchResult(track: TrackResult) {
    setAddingTrack(track.videoId)
    try {
      playQueue([await resolveForPlayback(track)], 0, null)
    } catch (e) {
      avisar(`No se pudo reproducir: ${mensajeError(e)}`, true)
    } finally {
      setAddingTrack(null)
    }
  }

  /** Sumar a la cola: suena cuando termine lo de ahora, sin tocar ninguna lista. */
  async function enqueueSearchResult(track: TrackResult, siguiente = false) {
    setAddingTrack(track.videoId)
    try {
      const resolved = await resolveForPlayback(track)
      if (siguiente) enqueueNext(resolved)
      else enqueue(resolved)
    } catch (e) {
      // Solo por aviso, por lo mismo que `playSearchResult`.
      avisar(`No se pudo encolar: ${mensajeError(e)}`, true)
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

  /**
   * Poner un álbum (o una lista ajena) como **cola completa**, desde la fila
   * elegida.
   *
   * Antes «reproducir el álbum» resolvía la primera canción y la mandaba
   * suelta: sonaba una y después venía la radio — el disco nunca seguía. Ahora
   * el álbum entero entra a la cola con el audio en blanco, y el motor lo
   * resuelve canción por canción (la que suena y la que sigue), igual que las
   * candidatas de la radio. El orden y el aleatorio son los de cualquier cola.
   *
   * En un Jam se cae al gesto de siempre —resolver la elegida y tocarla para
   * todos—: la cola compartida exige el audio resuelto y resolver un disco
   * entero antes de poder tocarlo sería esperar minutos.
   */
  function playAlbum(tracks: AlbumTrack[], artwork: string, at: number) {
    if (!collection) return
    const elegida = tracks[at]
    if (!elegida) return
    if (hayJam()) {
      void playSearchResult(albumTrackAsResult(elegida, artwork))
      return
    }
    const cola: PlaylistTrack[] = tracks.map((t) => ({
      id: `coleccion:${t.videoId}`,
      videoId: t.videoId,
      title: t.title,
      artist: t.artist,
      artistId: collection.artistId ?? null,
      artworkUrl: artwork,
      artworkPath: null,
      /* Sin audio a propósito: se resuelve al sonar, como la radio. */
      audioPath: '',
      durationMs: t.durationMs,
      truePeak: undefined,
    }))
    playQueue(cola, at, {
      id: `coleccion:${collection.kind}:${collection.id}`,
      name: collection.name,
    })
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
  /**
   * Lo que ofrece una lista **desde la biblioteca**, para el click derecho.
   *
   * Es el mismo conjunto que el de los tres puntos de la lista abierta, menos
   * lo que allá depende de estar adentro: renombrar (que se edita en la propia
   * cabecera) y «cerrar la lista», que desde el costado no significa nada. A
   * cambio entra «Abrir», que es lo que uno quiere de una fila del costado.
   *
   * Todo lo demás ya existía acá y solo pasa a tomar la lista por parámetro en
   * vez de la abierta — de ahí que no haga falta cablear nada nuevo.
   */
  function menuForPlaylist(p: Playlist): MenuItem[] {
    const publica = p.visibilidad === 'publica'
    /*
     * La anatomía del menú de Apple Music: arriba las acciones rápidas —abrir,
     * publicar o compartir—, después lo que le cambia la cara a la lista,
     * después la gente, y al final lo que la borra.
     */
    return [
      {
        label: 'Abrir',
        rapida: true,
        onPress: () => go({ kind: 'playlist', id: p.id }),
        icon: <IconMusic size={15} color={ICON_COLOR.muted} />,
        sfSymbol: 'music.note.list',
      },
      /*
       * Publicar y compartir, en ese orden. La fila dice a qué estado te lleva
       * —«Hacer pública» cuando es privada—, no en cuál estás. «Compartir»
       * aparece **solo si ya es pública**: un link a algo que nadie más puede
       * abrir es un link roto.
       */
      ...(p.mia && !publica
        ? [
            {
              label: 'Hacer pública',
              rapida: true,
              onPress: async () => {
                await setPlaylistVisibility(p.id, 'publica')
                await loadPlaylists()
                avisar('Lista pública. Ya podés compartir el link.')
              },
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
              onPress: () => void compartirLista(p.id, p.name),
              icon: <IconShare size={15} color={ICON_COLOR.muted} />,
              sfSymbol: 'square.and.arrow.up' as const,
            },
          ]
        : []),
      ...(p.mia
        ? [
            {
              label: 'Cambiar la portada',
              onPress: () => void pickCover(p),
              icon: <IconImage size={15} color={ICON_COLOR.muted} />,
              sfSymbol: 'photo' as const,
            },
          ]
        : []),
      ...(p.mia && publica
        ? [
            {
              label: 'Hacer privada',
              subtitle: 'El link deja de andar',
              onPress: async () => {
                await setPlaylistVisibility(p.id, 'privada')
                await loadPlaylists()
                avisar('Lista privada de nuevo. El link dejó de andar.')
              },
              icon: <IconLock size={15} color={ICON_COLOR.muted} />,
              sfSymbol: 'lock' as const,
            },
          ]
        : []),
      ...(p.mia && !p.colaborativa
        ? [
            {
              label: 'Hacer colaborativa',
              subtitle: 'Armala con otras personas',
              separadorAntes: true,
              onPress: () => void hacerColaborativa(p),
              icon: <IconUsers size={15} color={ICON_COLOR.muted} />,
              sfSymbol: 'person.2.badge.plus' as const,
            },
          ]
        : []),
      ...(p.colaborativa
        ? [
            {
              label: p.mia ? 'Gente de la lista' : 'Quiénes la escriben',
              subtitle: `${p.colaboradores + 1} ${p.colaboradores + 1 === 1 ? 'persona' : 'personas'}`,
              separadorAntes: true,
              onPress: () =>
                router.push({
                  pathname: '/lista/personas',
                  params: { id: p.id, nombre: p.name },
                }),
              icon: <IconUsers size={15} color={ICON_COLOR.muted} />,
              sfSymbol: 'person.2' as const,
            },
          ]
        : []),
      /* Elegir un archivo pide un sistema de archivos a mano: solo en la web. */
      ...(Platform.OS === 'web' && p.mia
        ? [
            {
              label: 'Agregar un archivo de audio',
              separadorAntes: true,
              onPress: () => void subirArchivoALista(p),
              icon: <IconPlus size={15} color={ICON_COLOR.muted} />,
              sfSymbol: 'square.and.arrow.down' as const,
            },
          ]
        : []),
      ...(p.mia
        ? [
            {
              label: 'Borrar la lista',
              onPress: () => void removePlaylist(p),
              destructive: true,
              icon: <IconTrash size={15} color={ICON_COLOR.muted} />,
              sfSymbol: 'trash' as const,
            },
          ]
        : []),
    ]
  }

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
    const gustada = gustos.some((g) => g.videoId === track.videoId)
    /*
     * La anatomía del menú de una canción en Apple Music: arriba las tres
     * acciones rápidas —el corazón, encolar, compartir—, después dónde
     * guardarla, después a dónde te lleva (con el nombre del disco y del
     * artista debajo, para no tener que abrir para saber), y al final lo que
     * la deja en tu perfil. Quien la muestre en una lista le suma abajo lo que
     * solo se puede hacer desde adentro: bajarla, quitarla.
     */
    return [
      /*
       * El corazón, primero de todo.
       *
       * Estaba solo en los dos reproductores —la píldora de escritorio y la
       * pantalla «Sonando»—, así que marcar algo obligaba a ponerlo a sonar
       * antes. Acá alcanza con verlo en una lista, en el buscador o en el top
       * de un artista, que es donde uno se encuentra las canciones.
       *
       * La fila dice a qué estado te lleva, como el resto del menú, y el ícono
       * repite el mismo lenguaje que el botón: relleno es marcado.
       */
      {
        label: gustada ? 'Quitar de me gusta' : 'Me gusta',
        rapida: true,
        selected: gustada || undefined,
        onPress: () => void alternarGusto(track, gustada),
        icon: gustada ? (
          <IconHeartFilled size={15} color={ICON_COLOR.foreground} />
        ) : (
          <IconHeart size={15} color={ICON_COLOR.muted} />
        ),
        sfSymbol: gustada ? 'heart.fill' : 'heart',
      },
      {
        label: 'Poner a continuación',
        onPress: () => void enqueueSearchResult(track, true),
        disabled: !canEnqueueNext(),
        subtitle: canEnqueueNext() ? undefined : 'El orden del Jam es compartido',
        icon: <IconQueue size={15} color={ICON_COLOR.muted} />,
        sfSymbol: 'text.line.first.and.arrowtriangle.forward',
      },
      {
        label: 'Agregar a la cola',
        rapida: true,
        onPress: () => void enqueueSearchResult(track),
        icon: <IconQueue size={15} color={ICON_COLOR.muted} />,
        sfSymbol: 'text.badge.plus',
      },
      /*
       * Las dos formas de pasar una canción, en este orden.
       *
       * Una sola fila: **Compartir** abre la hoja, y ahí se elige. Antes eran
       * dos —el link y «Compartir historia»— y la segunda armaba una imagen
       * que nadie había visto: si salía rota, te enterabas en Instagram. La
       * hoja muestra la tarjeta antes de mandarla y ofrece las dos formas en
       * el mismo lugar, que es lo que son. Ver `app/compartir.tsx`.
       */
      {
        label: 'Compartir',
        rapida: true,
        onPress: () => {
          dejarCancionACompartir(playlistTrackDeResultado(track))
          router.push('/compartir')
        },
        icon: <IconShare size={15} color={ICON_COLOR.muted} />,
        sfSymbol: 'square.and.arrow.up',
      },
      /*
       * Dónde guardarla. En el teléfono abre **la hoja** de elegir lista —con
       * buscador, tapas y «Nueva lista» primera, como en Apple Music—; en la
       * compu sigue siendo un submenú, que con el mouse es más rápido y la
       * HIG de menús lo pide así. Ver `app/lista/elegir`.
       */
      suelto
        ? {
            label: 'Agregar a una lista',
            onPress: () => {
              dejarCancionPendiente(track)
              router.push('/lista/elegir')
            },
            icon: <IconPlus size={15} color={ICON_COLOR.muted} />,
            sfSymbol: 'text.badge.plus',
          }
        : {
            label: 'Agregar a una lista',
            icon: <IconPlus size={15} color={ICON_COLOR.muted} />,
            sfSymbol: 'plus',
            items: aLista,
          },
      {
        label: 'Ir al álbum',
        subtitle: track.album || undefined,
        separadorAntes: true,
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
        label: 'Ir al artista',
        subtitle: track.artist || undefined,
        onPress: () =>
          track.artistId
            ? go({ kind: 'artist', id: track.artistId, name: track.artist })
            : undefined,
        disabled: !track.artistId,
        icon: <IconUser size={15} color={ICON_COLOR.muted} />,
        sfSymbol: 'music.microphone',
      },
      {
        label: 'Fijar en mi perfil',
        separadorAntes: true,
        onPress: () => void fijarEnPerfil(track),
        icon: <IconUser size={15} color={ICON_COLOR.muted} />,
        sfSymbol: 'pin',
      },
    ]
  }

  /**
   * El corazón desde el menú de una canción cualquiera.
   *
   * Marcar **necesita el audio resuelto**: «Tus me gusta» tiene que poder sonar
   * sin volver a preguntarle nada a YouTube, así que la fila guarda el camino
   * del archivo igual que una canción de lista. Un resultado del buscador
   * todavía no lo tiene, y por eso acá se resuelve antes — es el mismo viaje
   * que hacen agregar a una lista y fijar en el perfil, así que la segunda vez
   * es inmediato.
   *
   * Quitar no resuelve nada: para borrar alcanza con el `videoId`, y hacerle
   * dar ese viaje a alguien que solo quiere sacar un corazón sería cobrarle
   * una espera por arrepentirse.
   */
  async function alternarGusto(track: TrackResult, gustada: boolean) {
    if (gustada) {
      alternarMeGusta(playlistTrackDeResultado(track))
      return
    }
    setAddingTrack(track.videoId)
    try {
      alternarMeGusta(await resolveForPlayback(track))
    } catch (e) {
      avisar(`No se pudo marcar: ${mensajeError(e)}`, true)
    } finally {
      setAddingTrack(null)
    }
  }

  /**
   * Un resultado en la forma que espera el store de me gusta, **sin resolver**.
   *
   * Sirve solo para desmarcar, que mira el `videoId` y nada más. El `audioPath`
   * vacío nunca llega a la base: quitar borra por id.
   */
  function playlistTrackDeResultado(track: TrackResult): PlaylistTrack {
    return {
      id: `gusto:${track.videoId}`,
      videoId: track.videoId,
      title: track.title,
      artist: track.artist,
      artistId: track.artistId,
      artworkUrl: track.artworkUrl,
      /* La tapa de una canción guardada vive en Storage, no en `artworkUrl`:
         una fila de lista trae la ruta y el link puede venir vacío. Ponerlo en
         `null` acá era perder la carátula en el viaje de ida y vuelta, y la
         tarjeta de compartir salía con el recuadro negro. */
      artworkPath: track.artworkPath ?? null,
      audioPath: track.audioPath ?? '',
      durationMs: track.durationMs,
      truePeak: undefined,
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

  /*
   * Volver arrastrando desde el borde izquierdo, como en toda app de iOS.
   *
   * El historial del panel del medio no es del navegador —es la pila de
   * `Vista`— así que el gesto nativo de pop no existe y había que reponerlo:
   * navegar a un álbum y no poder volver arrastrando se siente roto en un
   * iPhone. Es el gesto **de borde** (los primeros 28px), igual que el del
   * sistema: empezar más adentro no lo dispara, así los carruseles y la barra
   * de posición siguen siendo dueños de su arrastre horizontal.
   *
   * Adentro de un chat, volver es cerrar el hilo — la misma flecha de la
   * cabecera, en gesto.
   */
  const volverPorGesto = useCallback(() => {
    if (!music && chatAbierto) {
      setChatAbierto(false)
      return
    }
    if (at > 0) goBack()
  }, [music, chatAbierto, at, goBack])

  /* Hay a dónde volver: sin esto el gesto arrastraría el panel para devolverlo
     al mismo lugar, que se lee como que la app se trabó. */
  const puedeVolverGesto = (!music && chatAbierto) || at > 0

  /*
   * Cuánto corrió el panel, en píxeles. Es lo que hacía falta para que el
   * gesto **se vea**: antes solo se miraba el final del arrastre y el cambio
   * era un salto seco — el dedo no movía nada.
   */
  const arrastreX = useSharedValue(0)

  /*
   * El pop de iOS, con los números del original.
   *
   * Están tomados de `forHorizontalIOS` de react-navigation (el interpolador
   * que usa el stack de iOS): la que se va viaja hasta el ancho de la pantalla,
   * y la que queda debajo entra desde **-30% del ancho** — ese desfasaje es lo
   * que da la sensación de profundidad, y sin él la pantalla nueva aparecería
   * de golpe ya puesta.
   *
   * Acá no hay dos pantallas montadas —el historial del panel del medio es una
   * pila de `Vista`, no rutas— así que se hace en dos tiempos sobre el mismo
   * panel: sale hacia la derecha, se cambia el contenido y el nuevo entra desde
   * el parallax. Visto de afuera es el mismo movimiento.
   */
  const gestoVolver = useMemo(
    () =>
      Gesture.Pan()
        .enabled(suelto && puedeVolverGesto)
        .hitSlop({ left: 0, width: 28 })
        .activeOffsetX(20)
        .failOffsetY([-20, 20])
        .onUpdate((e) => {
          /* El panel sigue al dedo. Hacia la izquierda no va: volver es un
             movimiento en un solo sentido, y dejarlo ir para el otro lado
             despegaría el panel de su lugar sin que eso signifique nada. */
          arrastreX.value = Math.max(0, e.translationX)
        })
        .onEnd((e) => {
          const suelta = e.translationX > 60 || e.velocityX > 800
          if (!suelta) {
            // No alcanzó: vuelve a su lugar, sin rebote.
            arrastreX.value = withSpring(0, { damping: 26, stiffness: 240, mass: 0.8, overshootClamping: true })
            return
          }
          arrastreX.value = withTiming(
            width,
            { duration: 180, easing: Easing.out(Easing.cubic) },
            (fin) => {
              'worklet'
              if (!fin) return
              runOnJS(volverPorGesto)()
              // Y el que queda entra desde el parallax, como el de abajo en iOS.
              arrastreX.value = -width * 0.3
              arrastreX.value = withTiming(0, { duration: 240, easing: Easing.out(Easing.cubic) })
            },
          )
        }),
    [suelto, puedeVolverGesto, volverPorGesto, arrastreX, width],
  )

  const estiloArrastre = useAnimatedStyle(() => ({
    transform: [{ translateX: arrastreX.value }],
    /* La sombra del filo solo mientras se mueve: es lo que lee al panel como
       una tarjeta corriéndose sobre lo que hay detrás. Quieta no describe
       nada —y sobre negro, `docs/DESIGN.md` avisa que una sombra suelta no se
       ve o ensucia—. */
    boxShadow: arrastreX.value === 0 ? 'none' : '-8px 0 24px rgba(0,0,0,0.5)',
  }))

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

  /*
   * Las cuentas del buscador que **no** están ya arriba como conversación.
   *
   * En el teléfono las dos listas se ven juntas —las conversaciones filtradas
   * y, debajo, «Más gente»— y una cuenta con la que ya te escribís aparecería
   * dos veces. En escritorio el desplegable va solo y no descuenta nada.
   */
  const cuentasNuevas = useMemo(() => {
    const pares = new Set(visibleConversations.map((c) => c.pairId))
    return searchResults.filter((r) => !(r.pairId && pares.has(r.pairId)))
  }, [searchResults, visibleConversations])

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


  async function responderSolicitud(solicitud: ContactRequest, aceptar: boolean) {
    try {
      const pairId = await respondToRequest(solicitud, aceptar)
      if (pairId) {
        avisar(`Ahora vos y ${contactLabel(solicitud)} son contactos`)
        // En el teléfono aceptar abre el hilo, listo para el primer mensaje.
        setChatAbierto(true)
      }
    } catch (cause) {
      avisar(mensajeError(cause), true)
    }
  }

  /**
   * El «+» de una cuenta en los resultados: la solicitud sale ahí mismo.
   *
   * Antes el único camino era pasar por «Nuevo mensaje» solo para apretar
   * «Enviar solicitud»: la búsqueda ya sabía el estado (`solicitud`) pero no
   * ofrecía la acción. Si las solicitudes se cruzaron —o ya eran contactos—,
   * la base los junta en el mismo gesto y se abre la conversación directa.
   */
  async function solicitarContacto(cuenta: ContactResult) {
    setSolicitando(cuenta.id)
    try {
      const estado = await sendContactRequest(cuenta.id)
      if (estado === 'enviada') {
        avisar(`Solicitud enviada a @${cuenta.username}`)
        // La fila pasa a decirlo sin esperar otra búsqueda.
        setSearchResults((resultados) =>
          resultados.map((r) => (r.id === cuenta.id ? { ...r, solicitud: 'enviada' } : r)),
        )
        await refreshConversations()
        return
      }
      /* 'aceptada' o 'contactos': ya son contactos — directo a escribirle. */
      avisar(`Ahora vos y ${contactLabel(cuenta)} son contactos`)
      const pairId = await openContactConversation(toContact(cuenta))
      await refreshConversations()
      changeGlobalSearch('')
      changeConversation(pairId)
      setChatAbierto(true)
    } catch (cause) {
      avisar(mensajeError(cause), true)
    } finally {
      setSolicitando(null)
    }
  }

  /** El tilde de una cuenta que ya te había pedido: aceptar desde la búsqueda. */
  async function aceptarDeBusqueda(cuenta: ContactResult) {
    setSolicitando(cuenta.id)
    try {
      const pairId = await respondToRequest(toContact(cuenta), true)
      if (pairId) {
        avisar(`Ahora vos y ${contactLabel(cuenta)} son contactos`)
        changeGlobalSearch('')
        changeConversation(pairId)
        setChatAbierto(true)
      }
    } catch (cause) {
      avisar(mensajeError(cause), true)
    } finally {
      setSolicitando(null)
    }
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

  function changeGlobalSearch(value: string) {
    setTermino(value)
    /*
     * Lo que pasa al escribir se decide **acá**, en el evento, y no en un
     * efecto: es la respuesta a un gesto concreto.
     *
     * Con algo escrito, «buscando» se enciende ya —el campo muestra su rueda
     * desde la primera tecla, aunque la consulta todavía no se haya asentado—.
     * Al vaciar, los resultados se apagan en el acto: son de una búsqueda que
     * ya no existe. Volver a poner el mismo valor no redibuja nada, así que
     * esto no es un setState por tecla.
     */
    if (value.trim()) {
      setSearchingContacts(true)
      return
    }
    setTrackResults([])
    setArtistResults([])
    setSearchResults([])
    setSearchError(null)
    setSearchingContacts(false)
  }

  /**
   * Lo que se teclea en el buscador de la barra lateral.
   *
   * Es el gesto de Música en la Mac: la primera letra lleva al panel del
   * medio a la pantalla de resultados —que es la misma que usa el teléfono—
   * y las siguientes solo cambian la consulta. Vaciar no vuelve solo: uno se
   * va de la búsqueda navegando, como de cualquier otra parada del historial.
   * En conversaciones no hay pantalla que empujar: la lista se filtra sola.
   */
  function buscarDesdeLateral(value: string) {
    changeGlobalSearch(value)
    if (music && value.trim() && view.kind !== 'search') go({ kind: 'search' })
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

  function cambiarModo() {
    dejarCara()
    setMusic(on => !on)
    if (music) {
      setStack([{ kind: 'home', section: null }])
      setAt(0)
    }
    changeGlobalSearch('')
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
      edges={headerFlota || (Platform.OS === 'ios' && suelto && music && (view.kind === 'playlist' || view.kind === 'library')) ? [] : suelto ? ['top'] : ['top', 'bottom']}
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
        {headerFlota && !HAY_BORDE_SCROLL_NATIVO ? (
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
          collapsable={false}
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
          {headerFlota ? <BordeScrollNativo key={music ? view.kind : 'social'} /> : null}
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
              <BotonSuperficie
                accessibilityRole="button"
                accessibilityLabel="Abrir el menú"
                onPress={() => setDrawer(true)}
                className="rounded-xl active:opacity-70"
              >
                <Image
                  source={require('../assets/icon.png')}
                  style={{ width: 32, height: 32, borderRadius: 10 }}
                />
              </BotonSuperficie>
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
            {showSidebar ? <Text className="text-foreground text-title3 font-bold">dnmusic</Text> : null}
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
            {/*
             * En la compu el campo ya no vive acá: está arriba de la barra
             * lateral, como en Música para Mac, y los resultados toman el panel
             * del medio. El encabezado queda para lo que es del contenido —las
             * flechas del historial y el inicio—, centrado sobre la ventana.
             */}
            <View pointerEvents="auto" className="flex-row items-center justify-center">
              {width >= 620 ? (
                <View className="flex-row items-center gap-1">
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
                        <IconButton label="Atrás" symbol="chevron.left" onPress={goBack} disabled={!canGoBack} icon={<IconBack
                            size={19}
                            color={canGoBack ? ICON_COLOR.foreground : ICON_COLOR.muted}
                          />} />
                        <IconButton label="Adelante" symbol="chevron.right" onPress={goForward} disabled={!canGoForward} icon={<IconForward
                            size={19}
                            color={canGoForward ? ICON_COLOR.foreground : ICON_COLOR.muted}
                          />} />
                      </View>
                    </Glass>
                  ) : null}
                  <HeaderButton
                    label="Ir al inicio"
                    onPress={() => {
                      /* Antes de nada, salir de la letra o el disco: si no, el
                         botón mandaba la pila al inicio detrás de una cara que
                         seguía tapando el panel y parecía que no hacía nada. */
                      dejarCara()
                      changeGlobalSearch('')
                      setStack([{ kind: 'home', section: null }])
                      setAt(0)
                      router.replace('/')
                    }}
                    icon={<IconHome size={19} color={ICON_COLOR.foreground} />}
                  />
                </View>
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
                  label: 'Configuración',
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
                      <Text className="text-muted-foreground text-caption1 pr-1.5">@{myUsername}</Text>
                    ) : null}
                  </View>
                </Glass>
              }
            />
            {/* En el teléfono este botón sobra: alternar entre música y
                conversaciones es lo que hacen las pestañas de abajo, y tenerlo
                dos veces solo compite consigo mismo. */}
            {showSidebar ? (
              /*
               * El globito va **afuera** del botón, no adentro.
               *
               * `BotonVidrio` es un `Glass` con `overflow: 'hidden'` —lo
               * necesita para que el vidrio respete el borde redondeado— así
               * que cualquier hijo posicionado fuera de los 44×44 se recorta:
               * el número aparecía cortado contra el filo del círculo en vez de
               * asomar por encima. Sale del botón, se apoya sobre él desde este
               * contenedor, y no toma toques para que el círculo entero siga
               * siendo el blanco.
               */
              <View>
              <BotonVidrio
                label={music ? 'Volver a las conversaciones' : 'Tus listas'}
                onPress={cambiarModo}
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
              {/* El globito de la pestaña Chats del teléfono, acá: sin él, en
                  escritorio una solicitud no se veía desde el modo música.
                  Mismo blanco de acento, número oscuro. El borde del color del
                  fondo lo despega del filo del botón, como en iOS. */}
              {music && pendientesChats > 0 ? (
                <View
                  pointerEvents="none"
                  className="absolute -right-1.5 -top-1 min-w-[18px] items-center justify-center rounded-full border-2 border-background bg-primary px-1"
                >
                  <Text className="text-primary-foreground text-caption2 font-bold">
                    {Math.min(pendientesChats, 99)}
                  </Text>
                </View>
              ) : null}
              </View>
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
              minWidth={220}
              maxWidth={360}
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
                const nada = () => undefined
                const panel = (vivo: boolean) =>
                  music ? (
                    /*
                     * En modo música la izquierda es **la navegación**, como
                     * la barra lateral de Música en la Mac: a dónde ir —la
                     * portada, los chats, la biblioteca, cada lista— y al pie
                     * la configuración y la cuenta. Ver `BarraLateral`.
                     */
                    <BarraLateral
                      playlists={playlists}
                      openId={openPlaylist?.id ?? null}
                      seccion={
                        view.kind === 'home'
                          ? 'inicio'
                          : view.kind === 'gustos'
                            ? 'gustos'
                            : view.kind === 'library'
                              ? 'listas'
                              : 'otra'
                      }
                      soundingId={soundingPlaylistId}
                      pendientesChats={pendientesChats}
                      nombre={myLabel}
                      usuario={myUsername}
                      avatarPath={myProfile?.avatarPath}
                      showCollapse={vivo && hovered}
                      onCollapse={vivo ? () => setLeftCollapsed(true) : nada}
                      onBuscar={vivo ? buscarDesdeLateral : nada}
                      inputRef={vivo ? searchRef : undefined}
                      placeholderBusqueda={
                        openPlaylist ? `Buscar para «${openPlaylist.name}»` : 'Buscar canciones y artistas'
                      }
                      buscando={searchingContacts}
                      onInicio={vivo ? () => setTab('inicio') : nada}
                      onChats={
                        vivo
                          ? () => {
                              /* Lo mismo que el botón del encabezado: cambiar
                                 de modo es navegar, y la letra no puede quedar
                                 tapando el modo al que acabás de entrar. */
                              dejarCara()
                              setMusic(false)
                              setStack([{ kind: 'home', section: null }])
                              setAt(0)
                              changeGlobalSearch('')
                            }
                          : nada
                      }
                      onGustos={vivo ? () => go({ kind: 'gustos' }) : nada}
                      onListas={vivo ? () => go({ kind: 'library' }) : nada}
                      onImportar={vivo ? () => router.push('/importar') : nada}
                      onNuevaLista={vivo ? createAndOpen : async () => undefined}
                      onOpen={vivo ? (p) => go({ kind: 'playlist', id: p.id }) : nada}
                      onConfiguracion={vivo ? () => router.push('/ajustes') : nada}
                      onPerfil={vivo ? () => router.push('/profile') : nada}
                      onSalir={vivo ? () => void endSession() : nada}
                      /* Como el resto: en la vista previa del panel plegado no
                         se ofrece nada, que es lo que hace `vivo`. */
                      menuFor={vivo ? menuForPlaylist : undefined}
                      error={playlistError}
                    />
                  ) : (
                    <ConversationSidebar
                      conversations={visibleConversations}
                      requests={requests}
                      cargando={cargandoConversaciones}
                      onRespond={(solicitud, aceptar) => void responderSolicitud(solicitud, aceptar)}
                      filtered={conversationQuery.trim().length > 0}
                      consulta={conversationQuery}
                      errorBusqueda={searchError}
                      activePairId={activePairId}
                      hovered={vivo && hovered}
                      onCollapse={vivo ? () => setLeftCollapsed(true) : () => undefined}
                      onSelect={vivo ? changeConversation : () => undefined}
                      onNew={vivo ? () => openComposer(false) : () => undefined}
                      /* El buscador va arriba de la lista, como en Mensajes:
                         filtra lo que tenés y, debajo, la gente nueva que
                         coincide. Antes colgaba del encabezado con un
                         desplegable propio. */
                      onBuscar={vivo ? buscarDesdeLateral : nada}
                      inputRef={vivo ? searchRef : undefined}
                      buscando={searchingContacts}
                      cuentas={cuentasNuevas}
                      buscandoCuentas={searchingContacts}
                      solicitando={solicitando}
                      onAbrirCuenta={vivo ? chooseGlobalResult : undefined}
                      onVerPerfilCuenta={vivo ? cuenta => router.push({ pathname: '/perfil/[usuario]', params: { usuario: cuenta.username } }) : undefined}
                      onSolicitar={(cuenta) => void solicitarContacto(cuenta)}
                      onAceptarCuenta={(cuenta) => void aceptarDeBusqueda(cuenta)}
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

          {/* El gesto de volver envuelve el panel del medio, solo activo en el
              teléfono (`enabled(suelto)`): en escritorio el borde izquierdo es
              de la biblioteca. */}
          <GestureDetector gesture={gestoVolver}>
          {/* El panel del medio se mueve con el gesto de volver: la sombra al
              filo izquierdo lo lee como una tarjeta que se corre sobre lo que
              hay detrás, que es lo que hace el stack de iOS. */}
          {/*
           * Los estilos van por `style` y **no** por `className`: NativeWind no
           * procesa clases en componentes de Reanimated, y no avisa —solo deja
           * de aplicarlas— (ver la trampa documentada en `docs/DESIGN.md`).
           * Con `flex-1` en la clase, el panel del medio dejaba de estirarse y
           * los tres paneles no llegaban al borde: quedaba una franja negra
           * muerta a la derecha, con el reproductor centrado sobre la ventana y
           * el contenido corrido a la izquierda.
           */}
          <Animated.View style={[{ flex: 1, minHeight: 0 }, estiloArrastre]}>
          <ScrollAreaTecho.Provider value={music ? techo : 0}>
          {!suelto ? (
            <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 40 }}>
              {music || (caraCentro && pistaSonando) ? <LinearGradient pointerEvents="none" colors={['rgba(18,18,18,0.94)', 'rgba(18,18,18,0.65)', 'rgba(18,18,18,0)']}
                locations={[0, 0.5, 1]} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 76 }} /> : null}
              <View pointerEvents="box-none" className="flex-row items-center gap-1 px-3 py-2">
                <BotonLateral label="Atrás" disabled={music && !canGoBack}
                  onPress={music ? goBack : cambiarModo}
                  icono={<IconBack size={18} color={ICON_COLOR.foreground} />} />
                {music ? <BotonLateral label="Adelante" disabled={!canGoForward} onPress={goForward}
                  icono={<IconForward size={18} color={ICON_COLOR.foreground} />} /> : null}
              </View>
            </View>
          ) : null}
          {caraCentro && pistaSonando ? (
            /*
             * La letra o el disco **toman el panel del medio**, como en
             * Spotify: es contenido para mirar, no una ficha, y el lugar para
             * mirar es el grande. El panel derecho vuelve a la ficha del
             * artista mientras tanto. Se sale con el mismo botón de la barra o
             * navegando a cualquier lado.
             *
             * También sobre el chat, y no solo en modo música: la barra del
             * reproductor está siempre, así que el botón de la letra está
             * siempre — y en una conversación no hacía nada. Prender la letra
             * es pedir mirarla; leer el chat es tocar la conversación, que la
             * cierra por `dejarCara`.
             */
            <CentroSonando cara={caraCentro} pista={pistaSonando} sonando={sonandoAhora} />
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
              onPublicar={async (visibilidad) => {
                await setPlaylistVisibility(openPlaylist.id, visibilidad)
                await loadPlaylists()
                avisar(
                  visibilidad === 'publica'
                    ? 'Lista pública. Ya podés compartir el link.'
                    : 'Lista privada de nuevo. El link dejó de andar.',
                )
              }}
              onDelete={() => void removePlaylist(openPlaylist)}
              onColaborar={() => void hacerColaborativa(openPlaylist)}
              onVerGente={() =>
                router.push({
                  pathname: '/lista/personas',
                  params: { id: openPlaylist.id, nombre: openPlaylist.name },
                })
              }
              onClose={goBack}
              onSearch={() => searchRef.current?.focus()}
              /* «+ Agregar música»: la hoja de elegir varias, como en Apple
                 Music. En la compu se abre como ventana centrada (ver `Hoja`). */
              onAgregar={() =>
                router.push({
                  pathname: '/lista/agregar',
                  params: { id: openPlaylist.id, nombre: openPlaylist.name },
                })
              }
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
              onBack={() => canGoBack ? goBack() : setTab('inicio')}
              soundingId={soundingPlaylistId}
              showCollapse={false}
              onCollapse={() => undefined}
              onOpen={(p) => go({ kind: 'playlist', id: p.id })}
              onCreate={createAndOpen}
              onOpenGustos={() => go({ kind: 'gustos' })}
              onImportar={() => router.push('/importar')}
              menuFor={menuForPlaylist}
              error={playlistError}
            />
          ) : music && view.kind === 'gustos' ? (
            /* Todas las canciones con corazón. Las opciones de cada fila son
               las de cualquier canción; «quitar» lo agrega la vista, porque
               quitar de acá ES desmarcar. */
            <MeGustaView
              onSearch={() => searchRef.current?.focus()}
              menuFor={(t) => menuForTrack(playlistTrackAsResult(t))}
            />
          ) : music && collection ? (
            <Panel className="flex-1">
              <ScrollArea
                className="min-h-0 flex-1"
                /* El techo, como el piso: el contenido corre hasta los bordes
                   y el hueco para el encabezado se reserva adentro. */
                contentContainerStyle={{ paddingTop: techo, paddingBottom: cascara }}
                {...colapsoPantalla}
              >
                <AlbumPanel
                  albumId={collection.id}
                  kind={collection.kind}
                  onBack={() => canGoBack ? goBack() : setTab('inicio')}
                  menuFor={(track, artwork) => menuForTrack(albumTrackAsResult(track, artwork))}
                  /* El disco entero como cola, no la primera suelta: es la
                     misma promesa que una playlist. Ver `playAlbum`. */
                  onPlayAll={(tracks, artwork) => playAlbum(tracks, artwork, 0)}
                  onPlay={(track, artwork, tracks, at) => playAlbum(tracks, artwork, at)}
                  onAdd={(track, artwork) => {
                    const asResult = albumTrackAsResult(track, artwork)
                    if (openPlaylist) void addToPlaylist(openPlaylist, asResult)
                    else void startPlaylistWith(asResult)
                  }}
                  pendingId={addingTrack}
                />
              </ScrollArea>
            </Panel>
          ) : music && view.kind === 'artist' ? (
            <Panel className="flex-1">
              <ScrollArea
                className="min-h-0 flex-1"
                /* Mismo techo que el álbum: la cabecera del artista arranca
                   debajo del encabezado flotante y pasa por detrás al subir. */
                contentContainerStyle={{ paddingTop: techo, paddingBottom: cascara }}
                {...colapsoPantalla}
              >
                <ArtistPage
                  artistId={view.id}
                  onBack={() => canGoBack ? goBack() : setTab('inicio')}
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
              </ScrollArea>
            </Panel>
          ) : music ? (
            /* Sin lista abierta, el medio es la portada: novedades y lo que
               está sonando afuera, en vez de un cartel pidiendo que elijas. */
            <HomeFeed
              section={homeSection}
              /* Los géneros son paradas del historial, como una sección: la
                 grilla entera y la página de cada uno. */
              genero={view.kind === 'genero' ? { params: view.params, name: view.name } : null}
              generosAbiertos={view.kind === 'generos'}
              onOpenGenero={(g) => go({ kind: 'genero', params: g.params, name: g.name })}
              onOpenGeneros={() => go({ kind: 'generos' })}
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
              onOpenArtist={(id, name) => go({ kind: 'artist', id, name })}
              onOpenGustos={() => go({ kind: 'gustos' })}
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
                requests={requests}
                cargando={cargandoConversaciones}
                onRespond={(solicitud, aceptar) => void responderSolicitud(solicitud, aceptar)}
                filtered={conversationQuery.trim().length > 0}
                consulta={conversationQuery}
                errorBusqueda={searchError}
                activePairId={activePairId}
                hovered={false}
                onCollapse={() => undefined}
                onSelect={(pairId) => {
                  changeConversation(pairId)
                  setChatAbierto(true)
                }}
                onNew={() => openComposer(false)}
                /* En el teléfono no hay desplegable: las cuentas que coinciden
                   se muestran acá abajo, con su acción en la fila. */
                cuentas={cuentasNuevas}
                buscandoCuentas={searchingContacts}
                solicitando={solicitando}
                onAbrirCuenta={chooseGlobalResult}
                onVerPerfilCuenta={cuenta => router.push({ pathname: '/perfil/[usuario]', params: { usuario: cuenta.username } })}
                onSolicitar={(cuenta) => void solicitarContacto(cuenta)}
                onAceptarCuenta={(cuenta) => void aceptarDeBusqueda(cuenta)}
              />
            </View>
          ) : (
            <Panel className="flex-1">
              {contact ? (
                <View className="relative min-h-0 flex-1">
                  <View className="flex-row items-center justify-between bg-background px-5 py-3" style={!suelto ? { paddingTop: TECLADO_FISICO ? 56 : 68 } : undefined}>
                    <View className="min-w-0 flex-1 flex-row items-center gap-3">
                      {/* Solo en el teléfono: en escritorio la lista está a la
                          izquierda, siempre a la vista, y no hay a dónde volver. */}
                      {suelto ? (
                        <BotonVolver
                          label="Volver a las conversaciones"
                          onPress={() => setChatAbierto(false)}
                        />
                      ) : null}
                      {/*
                       * La foto y el nombre abren su perfil.
                       *
                       * Es donde uno ya mira para saber con quién está
                       * hablando, así que es donde busca saber más. Un botón
                       * aparte para eso competiría con la flecha de volver en
                       * la misma esquina.
                       */}
                      <BotonSuperficie
                        {...estadoControlWeb('none')}
                        accessibilityRole="button"
                        accessibilityLabel={`Ver el perfil de ${contactName}`}
                        onPress={() => router.push(`/perfil/${contact.username}`)}
                        className="min-h-11 min-w-0 flex-1 flex-row items-center gap-3 active:opacity-70"
                      >
                        <Avatar name={contactName} path={contact.avatarPath} size={40} />
                        <View className="min-w-0 flex-1 gap-0.5">
                          <Text
                            className="text-foreground text-subheadline font-semibold"
                            numberOfLines={1}
                          >
                            {contact ? contactTitle(contact) : contactName}
                          </Text>
                          <Text className="text-muted-foreground text-caption1">
                            {cargandoMensajes ? 'Cargando…' : messageCountLabel(messages.length)}
                          </Text>
                        </View>
                      </BotonSuperficie>
                    </View>
                  </View>

                  {error ? (
                    <View className="p-5">
                      <Text className="text-destructive text-subheadline">{error}</Text>
                    </View>
                  ) : (
                    <Movible style={[{ flex: 1, minHeight: 0, overflow: 'hidden' }, ajusteHilo]}>
                    <FlatList
                      ref={hilo}
                      onLayout={Platform.OS === 'ios' ? () => {
                        if (pegadoAlFinal.current && altoContenidoHilo.current > 0) {
                          hilo.current?.scrollToOffset({ offset: altoContenidoHilo.current, animated: false })
                        }
                      } : undefined}
                      data={messages}
                      keyExtractor={(message) => message.id}
                      /* Cada vez que la lista cambia de alto: es donde se
                         vuelve a pegar al final mientras se acomoda, y donde
                         un mensaje nuevo baja el hilo si lo estabas mirando.
                         Ver `ubicarHiloAlFinal`. */
                      onContentSizeChange={ubicarHiloAlFinal}
                      onScrollEndDrag={alSoltarHilo}
                      onMomentumScrollEnd={alSoltarHilo}
                      className="min-h-0 flex-1"
                      /* En el teléfono la barra de desplazamiento no aporta y
                         se dibuja sobre las burbujas. */
                      showsVerticalScrollIndicator={!suelto}
                      contentContainerClassName="p-4"
                      contentContainerStyle={{
                        flexGrow: 1,
                        justifyContent: 'flex-end',
                        paddingTop: 16,
                        /* Lo que ocupa el reproductor —o el teclado— más el
                           campo y un respiro. Sin el respiro, el último mensaje
                           queda pegado al campo y parece cortado; con más, se
                           abre un hueco muerto. */
                        paddingBottom: pisoChat + espacioComposer,
                      }}
                      ListEmptyComponent={
                        /* Cargando no es lo mismo que vacío: mientras el hilo
                           viene, el esqueleto dice «esto se está llenando». Antes
                           se leía «Conversación nueva» sobre un chat que sí tenía
                           mensajes, y era lo que se veía vacío. */
                        cargandoMensajes ? (
                          <View className="px-4 py-6">
                            <SkeletonList rows={4} />
                          </View>
                        ) : (
                          <EmptyThread contactName={contactName} />
                        )
                      }
                      renderItem={({ item, index: messageIndex }) => (
                        <ChatBubble
                          message={item}
                          previous={messages[messageIndex - 1]}
                          next={messages[messageIndex + 1]}
                          onDetails={() => showDetail ? setSelectedId(item.id) : openMessage(item.id)}
                          mine={isSentBy(item, myUid)}
                          userId={myUid}
                          onEdit={() => requestMessageAction('edit', item)}
                          onDelete={() => requestMessageAction('delete', item)}
                          selected={showDetail && selected?.id === item.id}
                          playing={player.currentId === item.id && player.playing}
                          sonando={player.currentId === item.id}
                          positionMs={
                            player.currentId === item.id
                              ? player.positionMs
                              : (item.song?.startMs ?? 0)
                          }
                          posicionSV={player.posicionSV}
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
                    {/* El velo pertenece al hilo: la cabecera queda fuera y legible. */}
                    <LinearGradient
                      pointerEvents="none"
                      colors={['rgba(18,18,18,0.92)', 'rgba(18,18,18,0)']}
                      style={{ position: 'absolute', zIndex: 10, left: 0, right: 0, top: 0, height: 24 }}
                    />
                    </Movible>
                  )}

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
                      height: pisoChat + espacioComposer + 52,
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
                  <Movible
                    onLayout={Platform.OS === 'ios' ? (event) => {
                      const height = Math.ceil(event.nativeEvent.layout.height)
                      setComposerHeight(previous => previous === height ? previous : height)
                    } : undefined}
                    style={[
                      {
                        position: 'absolute',
                        left: 12,
                        right: 12,
                        zIndex: 20,
                        gap: 8,
                        bottom: cascara + 4,
                      },
                      seguirTeclado,
                    ]}
                  >
                    {editingInline && messageAction ? <MessageActionDialog inline
                      key={`edit:${messageAction.pairId}:${messageAction.message.id}`}
                      target={messageAction} onClose={() => setMessageAction(null)} /> : <>
                    {draft.song ? (
                      <Glass radius={14} style={HAY_VIDRIO ? {} : { backgroundColor: 'rgb(24,24,24)' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, minHeight: 64 }}>
                        {draft.song.artworkPath || draft.song.artworkUrl ? (
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
                            className="text-foreground text-footnote font-semibold"
                            numberOfLines={1}
                          >
                            {draft.song.title}
                          </Text>
                          <Text className="text-muted-foreground text-caption2" numberOfLines={1}>
                            {draft.song.artist} · {Math.round(draft.song.durationMs / 1000)} s
                          </Text>
                        </View>
                        <IconButton label="Quitar canción" symbol="xmark" lado={44} size={17} onPress={() => setDraft({ song: null })} icon={<IconClose size={16} color={ICON_COLOR.muted} />} />
                      </View>
                      </Glass>
                    ) : null}

                    {composerError ? (
                      <Text className="px-5 pb-1 text-destructive text-caption1">{composerError}</Text>
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
                        <CampoMensaje
                          value={draft.text}
                          onChangeText={(text) => setDraft({ text })}
                          placeholder={`Mensaje para @${contactName}`}
                          accessibilityLabel="Mensaje"
                          maxLength={2000}
                          /*
                           * Enter manda, Shift+Enter hace un renglón — como
                           * cualquier chat de escritorio. El campo es multilínea
                           * porque los mensajes largos existen, pero eso dejaba
                           * el único camino para mandar en la flechita: se
                           * escribía, se apretaba Enter y aparecía un renglón
                           * en blanco.
                           *
                           * `preventDefault` frena las dos cosas de una: el
                           * salto de línea del navegador y el `onSubmitEditing`
                           * que react-native-web dispararía después (mira
                           * `isDefaultPrevented` justo al salir de acá).
                           *
                           * Solo con teclado de verdad: en un teléfono esa
                           * tecla es la de nueva línea. Ver `TECLADO_FISICO`.
                           */
                          onKeyPress={(e) => {
                            if (!TECLADO_FISICO) return
                            const tecla = e.nativeEvent as unknown as {
                              key?: string
                              shiftKey?: boolean
                            }
                            if (tecla.key !== 'Enter' || tecla.shiftKey) return
                            e.preventDefault()
                            if (sending || (!draft.text.trim() && !draft.song)) return
                            void sendChatMessage()
                          }}
                          className={`max-h-28 min-h-11 min-w-0 flex-1 px-4 py-3 text-foreground text-subheadline ${
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
                    </>}
                  </Movible>
                </View>
              ) : (
                <NoConversation onNew={() => openComposer(false)} />
              )}
            </Panel>
          )}
          </ScrollAreaTecho.Provider>
          </Animated.View>
          </GestureDetector>

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
                      onCollapse={
                        vivo
                          ? () => {
                              setRightPlegado(true)
                              /*
                               * Plegar con el Jam o la cola abiertos también
                               * cierra la cara: son las que destapan el panel
                               * por derivación, y dejarlas abiertas haría que
                               * el botón de plegar no plegara nada.
                               */
                              if (caraSonando === 'jam' || caraSonando === 'cola') {
                                toggleView(caraSonando)
                              }
                            }
                          : () => undefined
                      }
                    />
                  ) : (
                    <Panel tone="lateral" className="flex-1">
                      <Detail
                        message={selected}
                        mine={selected ? isSentBy(selected, myUid) : false}
                        contactName={contactName}
                        playing={selected?.id === player.currentId && player.playing}
                        sonando={selected?.id === player.currentId}
                        positionMs={player.positionMs}
                        posicionSV={player.posicionSV}
                        showCollapse={vivo && hovered}
                        onCollapse={vivo ? () => setRightPlegado(true) : () => undefined}
                        onPlay={
                          vivo && selected?.song
                            ? () =>
                                player
                                  .toggle(selected.id, selected.song!)
                                  .catch((e: unknown) => avisar(mensajeError(e), true))
                            : () => undefined
                        }
                        onSeek={(fraccion) => {
                          if (!vivo || !selected?.song) return
                          player
                            .seek(selected.id, selected.song, fraccion)
                            .catch((e: unknown) => avisar(mensajeError(e), true))
                        }}
                      />
                    </Panel>
                  )

                return rightCollapsed ? (
                  <CollapsedSidebar
                    side="right"
                    hovered={hovered}
                    onExpand={() => setRightPlegado(false)}
                  />
                ) : (
                  panel(true)
                )
              }}
            </ResizableRegion>
          ) : null}
        </View>
      </View>
      {messageAction && !editingInline ? <MessageActionDialog key={`${messageAction.kind}:${messageAction.message.id}`}
        target={messageAction} onClose={() => setMessageAction(null)} /> : null}
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
        /*
         * La misma letra que en el teléfono, `xl`: acá la letra **es** el
         * panel, igual que allá es la pantalla, así que es la misma pieza y no
         * una variante de escritorio. De eso sale el karaoke, el desenfoque de
         * las líneas lejanas y la línea que suena arriba del medio.
         *
         * La columna sigue topada a un ancho de lectura y centrada dentro del
         * panel —una línea de lado a lado en 1440px no se puede seguir con la
         * vista—, pero el texto adentro va a la izquierda: es la forma que
         * toma Apple Music en la Mac y en el iPad.
         */
        <View
          className="min-h-0 w-full max-w-3xl flex-1 self-center px-8"
          style={{ paddingTop: techo, paddingBottom: piso }}
        >
          {/* #121212 es `background`, el fondo del panel: es contra eso que
              se apagan los bordes de la letra. */}
          <LyricsView track={pista} translatable size="xl" fondo="18,18,18" />
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
            <Text className="text-foreground text-center text-title3 font-bold" numberOfLines={2}>
              {pista.title}
            </Text>
            <Text className="text-muted-foreground text-center text-subheadline" numberOfLines={1}>
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
  requests,
  cargando = false,
  filtered,
  consulta = '',
  errorBusqueda = null,
  activePairId,
  onCollapse,
  onSelect,
  onRespond,
  onNew,
  cuentas = [],
  buscandoCuentas = false,
  solicitando = null,
  onAbrirCuenta,
  onVerPerfilCuenta,
  onSolicitar,
  onAceptarCuenta,
  onBuscar,
  inputRef,
  buscando = false,
}: {
  conversations: Conversation[]
  /** Solicitudes que esperan respuesta; con alguna, la sección va arriba. */
  requests: ContactRequest[]
  /** La bandeja todavía viene: esqueleto en vez de «no hay conversaciones». */
  cargando?: boolean
  /** Hay una búsqueda escrita: cambia qué decir cuando la lista está vacía. */
  filtered: boolean
  consulta?: string
  errorBusqueda?: string | null
  activePairId: string | null
  hovered: boolean
  onCollapse: () => void
  onSelect: (pairId: string) => void
  onRespond: (solicitud: ContactRequest, aceptar: boolean) => void
  onNew: () => void
  /**
   * Las cuentas que coinciden con la búsqueda, debajo de las conversaciones.
   *
   * En escritorio y teléfono comparten la lista con las conversaciones.
   */
  cuentas?: ContactResult[]
  buscandoCuentas?: boolean
  /** Cuenta cuya solicitud está saliendo, para la espera en su fila. */
  solicitando?: string | null
  onAbrirCuenta?: (cuenta: ContactResult) => void
  onVerPerfilCuenta?: (cuenta: ContactResult) => void
  onSolicitar?: (cuenta: ContactResult) => void
  onAceptarCuenta?: (cuenta: ContactResult) => void
  /**
   * El buscador arriba de la lista, solo en la compu: en el teléfono el campo
   * lo dibuja la cáscara, abajo, y acá no va otro.
   */
  onBuscar?: (termino: string) => void
  inputRef?: RefObject<SearchFieldHandle | null>
  buscando?: boolean
}) {
  /* En el teléfono esto es la pestaña «Chats» y llega hasta el borde. */
  const piso = usePiso(8)
  /* Y arriba el encabezado flota: el título arranca debajo, con el respiro
     que ya tenía (`pt-4`). En escritorio el techo es 0 y queda igual. */
  const techo = useTecho(16)
  const colapso = useColapso()
  const compacto = !!onBuscar && TECLADO_FISICO
  const consultaNormalizada = consulta.trim().toLocaleLowerCase('es')
  const solicitudesVisibles = filtered
    ? requests.filter((r) => `${r.username} ${contactTitle(r)}`.toLocaleLowerCase('es').includes(consultaNormalizada))
    : requests
  const solicitudesIds = new Set(solicitudesVisibles.map((r) => r.id))
  const cuentasVisibles = cuentas.filter((c) => !solicitudesIds.has(c.id))
  const carga = (texto: string) => <CargaChats texto={texto} />

  return (
    <Panel tone="lateral" className="flex-1">
      {onBuscar ? (
        <View className="gap-1 pb-2">
          <CabeceraLateral titulo="Chats">
            <BotonLateral label="Nueva conversación" onPress={onNew}
              icono={<IconNewConversation size={16} color={ICON_COLOR.foreground} />} />
            <BotonLateral label="Colapsar conversaciones" onPress={onCollapse}
              icono={<IconCollapseLeft size={15} color={ICON_COLOR.muted} />} />
          </CabeceraLateral>
          <View className="px-2">
          <CampoBusquedaLateral
            onBuscar={onBuscar}
            inputRef={inputRef}
            placeholder="Buscar contactos"
            buscando={buscando}
          />
          </View>
        </View>
      ) : (
        <CabeceraChats cantidad={conversations.length} techo={techo} onNew={onNew} />
      )}

      <FlatList
        renderScrollComponent={onBuscar ? (props) => <ScrollArea {...props} /> : undefined}
        style={{ flex: 1, minHeight: 0 }}
        data={conversations}
        keyExtractor={(conversation) => conversation.pairId}
        contentContainerClassName="gap-1 p-2"
        contentContainerStyle={{ paddingBottom: piso }}
        {...colapso}
        /* Las solicitudes van arriba de las conversaciones y dentro de la
           misma lista: son lo que pide atención primero, pero desplazan con
           el resto en vez de comerse el alto de la bandeja. */
        ListHeaderComponent={
          solicitudesVisibles.length ? (
            <View className="gap-1 pb-2">
              <TituloSeccionChats texto="Solicitudes" />
              {solicitudesVisibles.map((solicitud) => (
                <FilaSolicitudChat key={solicitud.id}
                  nombre={contactTitle(solicitud)} etiqueta={contactLabel(solicitud)} avatarPath={solicitud.avatarPath}
                  compacto={compacto} onAceptar={() => onRespond(solicitud, true)} onRechazar={() => onRespond(solicitud, false)} />
              ))}
            </View>
          ) : null
        }
        ListEmptyComponent={
          filtered && (cuentasVisibles.length || buscandoCuentas || solicitudesVisibles.length) ? null : cargando ? (
            carga('Cargando conversaciones…')
          ) : (
            <Vacio
              compacto={compacto}
              icono={<IconInbox size={compacto ? 18 : 22} color={ICON_COLOR.muted} />}
              titulo={filtered ? 'Buscar contactos' : 'Todavía no hay conversaciones'}
              detalle={filtered
                ? errorBusqueda ?? 'No hay conversaciones ni cuentas que coincidan.'
                : 'Buscá una cuenta para empezar a conversar.'}
              accion={filtered ? undefined : { rotulo: 'Buscar contacto', onPress: onNew }}
            />
          )
        }

        /* Las cuentas que coinciden, después de tus conversaciones: dentro de
           la misma lista —como las solicitudes— para desplazar con el resto. */
        ListFooterComponent={
          filtered && onAbrirCuenta && (cuentasVisibles.length || buscandoCuentas || (errorBusqueda && conversations.length > 0)) ? (
            <View className="gap-1 pt-2">
              <TituloSeccionChats texto={cuentasVisibles.length ? 'Personas' : 'Búsqueda de contactos'} />
              {buscandoCuentas ? (
                carga('Buscando contactos…')
              ) : (
                cuentasVisibles.map((cuenta) => (
                  <FilaCuenta
                    key={cuenta.id}
                    cuenta={cuenta}
                    density={compacto ? 'compact' : 'regular'}
                    busy={solicitando === cuenta.id}
                    onAbrir={() => onAbrirCuenta(cuenta)}
                    onVerPerfil={onVerPerfilCuenta ? () => onVerPerfilCuenta(cuenta) : undefined}
                    rotuloAbrir="Escribir"
                    onSolicitar={onSolicitar ? () => onSolicitar(cuenta) : undefined}
                    onAceptar={onAceptarCuenta ? () => onAceptarCuenta(cuenta) : undefined}
                  />
                ))
              )}
              {!buscandoCuentas && errorBusqueda && !cuentasVisibles.length ? (
                <Text accessibilityLiveRegion="polite" className="px-2 py-3 text-muted-foreground text-caption1">{errorBusqueda}</Text>
              ) : null}
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <FilaConversacion nombre={contactTitle(item.contact)} nombreAvatar={contactLabel(item.contact)} avatarPath={item.contact.avatarPath}
            detalle={filtered ? `@${item.contact.username} · Contacto` : invitacionEnTexto(item.lastMessageText) ? 'Invitación a Jam' : item.lastMessageText.trim() || 'Canción compartida'}
            fecha={item.lastMessageAt ? formatMessageDate(item.lastMessageAt) : undefined}
            noLeidos={item.unreadCount} selected={item.pairId === activePairId} compacto={compacto}
            onPress={() => onSelect(item.pairId)} />
        )}
      />
    </Panel>
  )
}

function EmptyThread({ contactName }: { contactName: string }) {
  return (
    <View className="justify-center py-8">
      <Vacio
        icono={<IconInbox size={22} color={ICON_COLOR.muted} />}
        titulo="Conversación nueva"
        detalle={`Escribile el primer mensaje a ${contactName}.`}
      />
    </View>
  )
}

function NoConversation({ onNew }: { onNew: () => void }) {
  return (
    <View className="flex-1 justify-center">
      <Vacio
        icono={<IconInbox size={24} color={ICON_COLOR.muted} />}
        titulo="Empezá una conversación"
        detalle="Buscá una cuenta y mandale un mensaje o una canción."
        accion={{ rotulo: 'Buscar contacto', onPress: onNew }}
      />
    </View>
  )
}

function messageCountLabel(count: number): string {
  if (count === 0) return 'Conversación nueva'
  return `${count} ${count === 1 ? 'mensaje' : 'mensajes'}`
}
