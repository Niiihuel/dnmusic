import { TextInput } from 'react-native'
import type { CampoMensajeProps } from './CampoMensaje.types'

/** Campo multilínea compartido para web y Android. iOS resuelve el `.ios`. */
export function CampoMensaje({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel = 'Mensaje',
  editable = true,
  autoFocus = false,
  maxLength = 2000,
  style,
  containerStyle: _containerStyle,
  expandido: _expandido,
  className,
  onKeyPress,
}: CampoMensajeProps) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#777777"
      accessibilityLabel={accessibilityLabel}
      editable={editable}
      autoFocus={autoFocus}
      multiline
      maxLength={maxLength}
      textAlignVertical="top"
      style={style}
      className={className}
      onKeyPress={onKeyPress}
    />
  )
}
