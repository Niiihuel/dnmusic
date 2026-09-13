import { Platform, type ViewProps } from 'react-native'
import { requireNativeView, requireOptionalNativeModule } from 'expo'

export type NativeMediaRowProps = ViewProps & {
  title: string
  subtitle: string
  symbol?: string
  artwork?: string | null
  artworks?: string[]
  sounding?: boolean
  playing?: boolean
  busy?: boolean
  selected?: boolean
  disabled?: boolean
  label: string
  onActivate: () => void
}
export type NativeMediaTabProps = ViewProps & {
  active: string
  unread: number
  onSelect: (event: { nativeEvent: { id: string } }) => void
}

// Un módulo independiente permite seguir usando el binario anterior sin pedir
// una vista que no existe dentro de un módulo ya instalado.
const mediaModule = Platform.OS === 'ios' ? requireOptionalNativeModule<{ miniPlayerVersion?: number }>('MediaControls') : null
const disponible = mediaModule !== null
export const NativeMediaRow = disponible ? requireNativeView<NativeMediaRowProps>('MediaControls', 'MediaTrackView') : null
export const NativeMediaTabs = disponible ? requireNativeView<NativeMediaTabProps>('MediaControls', 'MediaTabBarView') : null

export type NativeSurfaceEvent = { nativeEvent: { pressed?: boolean; pageX: number; pageY: number; locationX: number; locationY: number; timestamp: number } }
export type NativeSurfaceProps = ViewProps & {
  label: string; hint?: string; value?: string; controlRole?: string; selected: boolean; disabled: boolean; longPress: boolean; longPressDelay: number
  onActivate: (event: NativeSurfaceEvent) => void
  onLongActivate: (event: NativeSurfaceEvent) => void
  onHighlight: (event: NativeSurfaceEvent) => void
}
export const NativeSurface = disponible ? requireNativeView<NativeSurfaceProps>('MediaControls', 'MediaActionView') : null


export type NativeMiniPlayerProps = ViewProps & {
  title: string
  subtitle: string
  artwork?: string | null
  playing: boolean
  busy: boolean
  canNext: boolean
  canPrevious: boolean
  deviceLabel: string
  remote: boolean
  onOpen: () => void
  onPlayPause: () => void
  onNext: () => void
  onPrevious: () => void
  onDevices: () => void
  onOptions: () => void
}
// Older binaries have MediaControls but do not register this newer view.
export const NativeMiniPlayer = mediaModule?.miniPlayerVersion === 1 ? requireNativeView<NativeMiniPlayerProps>('MediaControls', 'MediaMiniPlayerView') : null
