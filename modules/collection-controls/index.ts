import { Platform, type ViewProps } from 'react-native'
import { requireNativeView, requireOptionalNativeModule } from 'expo'

export type NativeMenuEntry = {
  id?: string
  label: string
  symbol?: string
  subtitle?: string
  disabled?: boolean
  destructive?: boolean
  selected?: boolean
  children?: NativeMenuEntry[]
  inline?: boolean
  small?: boolean
}

type SearchProps = ViewProps & {
  text: string
  placeholder: string
  autoFocus?: boolean
  onChangeText: (event: { nativeEvent: { text: string } }) => void
  onCancel: () => void
}
export type CollectionPreview = {
  title: string
  subtitle?: string
  detail?: string
  artwork?: string | null
  symbol?: string
}

type ContextProps = ViewProps & {
  previewCornerRadius?: number
  preview?: CollectionPreview
  onPreviewPress?: () => void
  items: NativeMenuEntry[]
  onOpen: () => void
  onSelect: (event: { nativeEvent: { id: string } }) => void
}

// Los clientes anteriores y Expo Go no incluyen este módulo local.
const nativeModule = Platform.OS === 'ios' ? requireOptionalNativeModule<{ contentFadeVersion?: number }>('CollectionControls') : null
const disponible = nativeModule !== null
export const CollectionSearch = disponible
  ? requireNativeView<SearchProps>('CollectionControls', 'CollectionSearchView') : null
export const CollectionContext = disponible
  ? requireNativeView<ContextProps>('CollectionControls', 'CollectionContextView') : null

export const CollectionFade = disponible && nativeModule?.contentFadeVersion === 1
  ? requireNativeView<ViewProps>('CollectionControls', 'CollectionFadeView') : null
