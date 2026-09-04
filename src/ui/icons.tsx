import {
  Album,
  AlignJustify,
  Camera,
  Heading,
  LayoutGrid,
  Minus,
  MoveDiagonal2,
  Palette,
  Quote,
  SeparatorHorizontal,
  Type,
  ArrowLeft,
  ArrowRight,
  AtSign,
  AudioWaveform,
  Ban,
  Check,
  CircleCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Disc3,
  Download,
  HardDrive,
  Heart,
  SlidersHorizontal,
  Eye,
  Focus,
  RotateCcw,
  RotateCw,
  EyeOff,
  ExternalLink,
  Globe,
  House,
  Inbox,
  Languages,
  ListMusic,
  LockKeyhole,
  LogOut,
  MessageSquareText,
  Scissors,
  MicVocal,
  Ellipsis,
  ImagePlus,
  MonitorSmartphone,
  Music,
  Pause,
  Pencil,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  ListPlus,
  Repeat,
  Repeat1,
  Search,
  Send,
  Share2,
  Shuffle,
  Trash2,
  UsersRound,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  SkipBack,
  SkipForward,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react-native'

/**
 * Los íconos de la app, en un solo lugar.
 *
 * Se usa **Lucide**: trazo fino y geométrico, que es lo que pide un sistema
 * monocromo donde no hay color para diferenciar. Antes había glifos de texto
 * (▶, ✕, ♪) y un par de formas dibujadas con Views: se veían distintos según la
 * fuente del sistema, no escalaban parejo y no había forma de darles un grosor
 * de trazo consistente.
 *
 * Todo pasa por acá para que el tamaño y el grosor sean los mismos en toda la
 * app, y para que cambiar de familia de íconos algún día sea tocar un archivo.
 */

/** Grosor de trazo del sistema. 1.75 es el punto donde se lee sin engordar. */
const STROKE = 1.75

export type IconProps = {
  size?: number
  color?: string
  /** Grosor de trazo; solo tocarlo en casos puntuales. */
  strokeWidth?: number
}

function make(Component: typeof Search) {
  return function Icon({ size = 18, color = '#FFFFFF', strokeWidth = STROKE }: IconProps) {
    return <Component size={size} color={color} strokeWidth={strokeWidth} />
  }
}

/**
 * Como `make`, pero con la figura **rellena**.
 *
 * Es para los controles de transporte: play, pausa y los saltos van sólidos en
 * Apple Music y en Spotify — el contorno fino se lee como estado apagado, y el
 * botón que más se toca de la app no puede parecer apagado. El resto del
 * sistema sigue a trazo, que es lo que pide el monocromo.
 */
function makeFilled(Component: typeof Search) {
  return function Icon({ size = 18, color = '#FFFFFF', strokeWidth = STROKE }: IconProps) {
    return <Component size={size} color={color} fill={color} strokeWidth={strokeWidth} />
  }
}

export const IconSearch = make(Search)
export const IconClose = make(X)
export const IconPlay = makeFilled(Play)
export const IconPause = makeFilled(Pause)
export const IconMusic = make(Music)
export const IconDispositivo = make(MonitorSmartphone)
export const IconCheck = make(Check)
export const IconChevronUp = make(ChevronUp)
export const IconChevronDown = make(ChevronDown)
export const IconChevronLeft = make(ChevronLeft)
export const IconChevronRight = make(ChevronRight)
export const IconBack = make(ArrowLeft)
export const IconForward = make(ArrowRight)
export const IconExternal = make(ExternalLink)
export const IconWave = make(AudioWaveform)
export const IconDisc = make(Disc3)
export const IconHeart = make(Heart)
/* El corazón marcado va relleno, como el play: el contorno fino se lee como
   apagado, y un me gusta puesto no puede parecer apagado. */
export const IconHeartFilled = makeFilled(Heart)
export const IconLyrics = make(MicVocal)
export const IconMessage = make(MessageSquareText)
/** Recortar un fragmento de una canción. */
export const IconScissors = make(Scissors)
export const IconLanguages = make(Languages)
export const IconLogOut = make(LogOut)
export const IconPlus = make(Plus)
export const IconAt = make(AtSign)
export const IconEye = make(Eye)
export const IconEyeOff = make(EyeOff)
export const IconHome = make(House)
export const IconInbox = make(Inbox)
export const IconGlobe = make(Globe)
export const IconLock = make(LockKeyhole)
export const IconSend = make(Send)
export const IconPrevious = makeFilled(SkipBack)
export const IconNext = makeFilled(SkipForward)
export const IconMore = make(Ellipsis)
export const IconImage = make(ImagePlus)
export const IconPencil = make(Pencil)
export const IconShuffle = make(Shuffle)
export const IconRepeat = make(Repeat)
/** Repetir **esta** canción. El «1» es lo único que distingue un modo del otro. */
export const IconRepeatOne = make(Repeat1)
/** Ajustes: las perillas, no un engranaje — acá no se configura un sistema. */
export const IconSliders = make(SlidersHorizontal)
export const IconClock = make(Clock)
export const IconTrash = make(Trash2)
export const IconDownload = make(Download)
/** Bajada del todo. El círculo lleno es lo que distingue «está» de «bajala». */
export const IconDownloaded = make(CircleCheck)
export const IconDisk = make(HardDrive)
export const IconWifi = make(Wifi)
/** Sin conexión: el vacío que no es culpa de nadie. Ver `Vacio`. */
export const IconWifiOff = make(WifiOff)
export const IconQueue = make(ListPlus)
export const IconCola = make(ListMusic)
export const IconVolume = make(Volume2)
export const IconVolumeOff = make(VolumeX)
export const IconBan = make(Ban)
export const IconSparkles = make(Sparkles)
export const IconUser = make(UserRound)
export const IconUsers = make(UsersRound)
export const IconShare = make(Share2)
/** La manija de reordenar: las tres líneas que se agarran para arrastrar una fila. */
export const IconManija = make(AlignJustify)
/* Las piezas del editor del mosaico: qué se agrega y cómo se viste. */
export const IconMinus = make(Minus)
export const IconPalette = make(Palette)
export const IconHeading = make(Heading)
export const IconType = make(Type)
export const IconCamera = make(Camera)
export const IconEspacio = make(SeparatorHorizontal)
export const IconAlbum = make(Album)
export const IconQuote = make(Quote)
export const IconGrilla = make(LayoutGrid)
export const IconRedimensionar = make(MoveDiagonal2)
/* Encuadrar: el visor con las esquinas, no una tijera — no se recorta nada. */
export const IconEncuadre = make(Focus)
export const IconGirarIzq = make(RotateCcw)
export const IconGirarDer = make(RotateCw)
export const IconCollapseLeft = make(PanelLeftClose)
export const IconExpandLeft = make(PanelLeftOpen)
export const IconCollapseRight = make(PanelRightClose)
export const IconExpandRight = make(PanelRightOpen)

/** Grises del sistema, para pasarle color a los íconos sin repetir literales. */
export const ICON_COLOR = {
  foreground: '#FFFFFF',
  muted: '#B3B3B3',
  /** Sobre superficies claras, como el botón primario. */
  onPrimary: '#121212',
} as const
