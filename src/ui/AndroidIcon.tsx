import { RNHostView } from '@expo/ui/jetpack-compose'
import { Info, Pin, Package, UserPlus, UserX, HeartOff } from 'lucide-react-native'
import type { ComponentType } from 'react'
import { View } from 'react-native'
import * as Icons from './icons'

const symbols: Record<string, ComponentType<Icons.IconProps>> = {
  'xmark': Icons.IconClose, 'xmark.circle': Icons.IconClose,
  'checkmark': Icons.IconCheck, 'checkmark.circle': Icons.IconCheck,
  'chevron.left': Icons.IconChevronLeft, 'chevron.right': Icons.IconChevronRight,
  'chevron.up': Icons.IconChevronUp, 'chevron.down': Icons.IconChevronDown,
  'arrow.left': Icons.IconBack, 'arrow.right': Icons.IconForward,
  'play.fill': Icons.IconPlay, 'pause.fill': Icons.IconPause,
  'music.note': Icons.IconMusic, 'music.note.list': Icons.IconMusic,
  'magnifyingglass': Icons.IconSearch, 'plus': Icons.IconPlus,
  'heart': Icons.IconHeart, 'heart.fill': Icons.IconHeartFilled,
  'house': Icons.IconHome, 'house.fill': Icons.IconHome,
  'bubble.left.and.bubble.right': Icons.IconMessage, 'bubble.left': Icons.IconMessage,
  'person.crop.circle': Icons.IconUser, 'person.crop.circle.fill': Icons.IconUser,
  'person': Icons.IconUser, 'person.fill': Icons.IconUser,
  'ellipsis': Icons.IconMore, 'square.and.arrow.up': Icons.IconShare,
  'square.and.pencil': Icons.IconPencil, 'pencil': Icons.IconPencil,
  'trash': Icons.IconTrash, 'eye': Icons.IconEye, 'eye.slash': Icons.IconEyeOff,
  'sparkles': Icons.IconSparkles, 'shuffle': Icons.IconShuffle,
  'repeat': Icons.IconRepeat, 'repeat.1': Icons.IconRepeatOne,
  'arrow.counterclockwise': Icons.IconGirarIzq,
  'arrow.down.circle': Icons.IconDownload,
  'arrow.uturn.backward': Icons.IconGirarIzq,
  'backward.end.fill': Icons.IconPrevious,
  'forward.end': Icons.IconNext,
  'forward.end.fill': Icons.IconNext,
  'camera': Icons.IconCamera,
  'character.bubble': Icons.IconLanguages,
  'checkmark.circle.fill': Icons.IconDownloaded,
  'chevron.up.chevron.down': Icons.IconChevronDown,
  'circle.slash': Icons.IconBan,
  'clock': Icons.IconClock,
  'crop': Icons.IconEncuadre,
  'doc.on.doc': Icons.IconCopiar,
  'gearshape': Icons.IconSliders,
  'globe': Icons.IconGlobe,
  'heart.slash': HeartOff,
  'info.circle': Info,
  'iphone': Icons.IconDispositivo,
  'laptopcomputer.and.iphone': Icons.IconDispositivo,
  'list.bullet': Icons.IconCola,
  'list.number': Icons.IconCola,
  'lock': Icons.IconLock,
  'minus': Icons.IconMinus,
  'minus.circle': Icons.IconMinus,
  'music.microphone': Icons.IconLyrics,
  'opticaldisc': Icons.IconDisc,
  'paintpalette': Icons.IconPalette,
  'person.2': Icons.IconUsers,
  'person.2.badge.plus': Icons.IconUsers,
  'person.badge.plus': UserPlus,
  'person.fill.xmark': UserX,
  'photo': Icons.IconImage,
  'photo.on.rectangle': Icons.IconImage,
  'pin': Pin,
  'rectangle.portrait.and.arrow.right': Icons.IconLogOut,
  'rotate.left': Icons.IconGirarIzq,
  'rotate.right': Icons.IconGirarDer,
  'shippingbox': Package,
  'slider.horizontal.3': Icons.IconSliders,
  'speaker.slash.fill': Icons.IconVolumeOff,
  'speaker.wave.2.fill': Icons.IconVolume,
  'square.and.arrow.down': Icons.IconDownload,
  'square.grid.2x2': Icons.IconGrilla,
  'square.stack': Icons.IconAlbum,
  'text.badge.plus': Icons.IconQueue,
  'text.bubble': Icons.IconMessage,
  'text.line.first.and.arrowtriangle.forward': Icons.IconQueue,
  'text.quote': Icons.IconMessage,
  'textformat': Icons.IconType,
  'textformat.abc': Icons.IconType,
  'waveform': Icons.IconWave,
  'xmark.circle.fill': Icons.IconClose,

  'line.3.horizontal.decrease': Icons.IconSliders,
  'line.3.horizontal.decrease.circle.fill': Icons.IconSliders,
}

/** DMusic's existing native SVG glyphs, hosted inside Compose controls. */
export function AndroidIcon({ symbol, size = 22, color = '#FFFFFF', label }: {
  symbol: string; size?: number; color?: string; label?: string
}) {
  const Icon = symbols[symbol] ?? Icons.IconMore
  return <RNHostView matchContents><View accessible={!!label} accessibilityLabel={label}
    pointerEvents="none" style={{ width: size, height: size }}><Icon size={size} color={color} strokeWidth={1.75} /></View></RNHostView>
}
