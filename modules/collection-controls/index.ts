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
type ContextProps = ViewProps & {
  items: NativeMenuEntry[]
  onOpen: () => void
  onSelect: (event: { nativeEvent: { id: string } }) => void
}

// Los clientes anteriores y Expo Go no incluyen este módulo local.
const disponible = Platform.OS === 'ios' && requireOptionalNativeModule('CollectionControls') !== null
export const CollectionSearch = disponible
  ? requireNativeView<SearchProps>('CollectionControls', 'CollectionSearchView') : null
export const CollectionContext = disponible
  ? requireNativeView<ContextProps>('CollectionControls', 'CollectionContextView') : null
