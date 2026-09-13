import type { StyleProp, TextInputProps, TextStyle, ViewStyle } from 'react-native'

export type CampoMensajeProps = {
  value: string
  onChangeText: (value: string) => void
  placeholder: string
  accessibilityLabel?: string
  editable?: boolean
  autoFocus?: boolean
  maxLength?: number
  /** Estilo del campo en web/Android. */
  style?: StyleProp<TextStyle>
  /** Estilo del contenedor SwiftUI en iOS. */
  containerStyle?: StyleProp<ViewStyle>
  /** Editor alto de composición; en iOS reemplaza el min-height de NativeWind. */
  expandido?: boolean
  className?: string
  /** En escritorio, Enter envía y Shift+Enter agrega una línea. */
  onKeyPress?: TextInputProps['onKeyPress']
}
