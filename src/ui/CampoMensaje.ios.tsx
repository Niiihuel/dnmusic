import { useEffect } from 'react'
import { Host, TextField, useNativeState } from '@expo/ui/swift-ui'
import {
  accessibilityLabel as etiquetaAccesible,
  disabled,
  font,
  foregroundStyle,
  lineLimit,
  padding,
  textFieldStyle,
} from '@expo/ui/swift-ui/modifiers'
import type { CampoMensajeProps } from './CampoMensaje.types'

/** El editor del chat en iOS es un `TextField(axis: .vertical)` de SwiftUI. */
export function CampoMensaje({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel = 'Mensaje',
  editable = true,
  autoFocus = false,
  maxLength = 2000,
  containerStyle,
  expandido = false,
}: CampoMensajeProps) {
  const texto = useNativeState(value)

  /* El borrador también puede cambiar desde afuera al adjuntar o enviar. El
     estado observable evita remitir cada pulsación JS -> Swift -> JS. */
  useEffect(() => {
    if (texto.get() !== value) texto.set(value)
  }, [texto, value])

  return (
    <Host
      matchContents={{ vertical: true }}
      colorScheme="dark"
      seedColor="#FFFFFF"
      style={[{ flex: 1, minHeight: expandido ? 112 : 44, maxHeight: 112 }, containerStyle]}
    >
      <TextField
        text={texto}
        axis="vertical"
        autoFocus={autoFocus}
        maxLength={maxLength}
        placeholder={placeholder}
        onTextChange={onChangeText}
        modifiers={[
          etiquetaAccesible(accessibilityLabel),
          disabled(!editable),
          textFieldStyle('plain'),
          lineLimit({ min: 1, max: 5 }),
          font({ textStyle: 'subheadline' }),
          foregroundStyle('#FFFFFF'),
          padding({ horizontal: 14, vertical: 11 }),
        ]}
      />
    </Host>
  )
}
