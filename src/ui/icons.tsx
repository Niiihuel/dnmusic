import {
  Album, AlignJustify, ArrowUpCircle, AtSign, AudioWaveform, Ban, Camera, Check,
  ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleCheck, Clipboard, Clock,
  Disc3, Download, Ellipsis, ExternalLink, Eye, EyeOff, Focus, Globe, HardDrive,
  Heading, Heart, House, ImagePlus, Inbox, Languages, LayoutGrid, ListMusic,
  ListPlus, LockKeyhole, LogOut, MessageCirclePlus, MessageSquareText, MicVocal,
  Minus, MonitorSmartphone, MousePointer2, MoveDiagonal2, Music, Newspaper, Palette,
  PanelLeftClose, PanelRightClose, PanelRightOpen, Pause, Pencil, Play, Plus,
  Repeat, Repeat1, RotateCcw, RotateCw, Search, Send, SeparatorHorizontal, Share2,
  Shuffle, SkipBack, SkipForward, SlidersHorizontal, Sparkles, Trash2, Type,
  UserRound, UsersRound, Volume2, VolumeX, Wifi, WifiOff, X,
} from 'lucide-react-native'

/** Tamaño y trazo comunes a los íconos de la app. */
const STROKE = 1.75

export type IconProps = {
  size?: number
  color?: string
  strokeWidth?: number
}

function make(Component: typeof Search) {
  return function Icon({ size = 18, color = '#FFFFFF', strokeWidth = STROKE }: IconProps) {
    return <Component size={size} color={color} strokeWidth={strokeWidth} />
  }
}

/** Transporte y estados activos usan figuras rellenas. */
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
export const IconBack = make(ChevronLeft)
export const IconForward = make(ChevronRight)
export const IconExternal = make(ExternalLink)

export const IconCopiar = make(Clipboard)
export const IconWave = make(AudioWaveform)
export const IconDisc = make(Disc3)
export const IconHeart = make(Heart)
export const IconHeartFilled = makeFilled(Heart)
export const IconLyrics = make(MicVocal)
export const IconMessage = make(MessageSquareText)
export const IconNewConversation = make(MessageCirclePlus)

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
export const IconRepeatOne = make(Repeat1)
export const IconSliders = make(SlidersHorizontal)
export const IconClock = make(Clock)
export const IconTrash = make(Trash2)
export const IconDownload = make(Download)
export const IconDownloaded = make(CircleCheck)
export const IconDisk = make(HardDrive)
export const IconWifi = make(Wifi)
export const IconWifiOff = make(WifiOff)
export const IconQueue = make(ListPlus)
export const IconCola = make(ListMusic)
export const IconVolume = make(Volume2)
export const IconVolumeOff = make(VolumeX)
export const IconBan = make(Ban)
export const IconSparkles = make(Sparkles)
export const IconUpdate = make(ArrowUpCircle)
export const IconNovedades = make(Newspaper)
export const IconCursor = make(MousePointer2)
export const IconUser = make(UserRound)
export const IconUsers = make(UsersRound)
export const IconShare = make(Share2)
export const IconManija = make(AlignJustify)
export const IconMinus = make(Minus)
export const IconPalette = make(Palette)
export const IconHeading = make(Heading)
export const IconType = make(Type)
export const IconCamera = make(Camera)
export const IconEspacio = make(SeparatorHorizontal)
export const IconAlbum = make(Album)

export const IconGrilla = make(LayoutGrid)
export const IconRedimensionar = make(MoveDiagonal2)
export const IconEncuadre = make(Focus)
export const IconGirarIzq = make(RotateCcw)
export const IconGirarDer = make(RotateCw)
export const IconCollapseLeft = make(PanelLeftClose)

export const IconCollapseRight = make(PanelRightClose)
export const IconExpandRight = make(PanelRightOpen)

export const ICON_COLOR = {
  foreground: '#FFFFFF',
  muted: '#B3B3B3',
  onPrimary: '#121212',
} as const
