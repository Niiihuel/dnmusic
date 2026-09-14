import { useEffect, useRef } from 'react'
import { BasicTextField, Box, Text, useNativeState } from '@expo/ui/jetpack-compose'
import { defaultMinSize, fillMaxWidth, padding } from '@expo/ui/jetpack-compose/modifiers'
import { AndroidHost, ANDROID_COLORS, androidAccessibility } from './AndroidHost'
import type { CampoMensajeProps } from './CampoMensaje.types'

/** Campo Compose multilínea: crecer hasta cinco líneas sin abrir otra pantalla ni duplicar el teclado. */
export function CampoMensaje({ value, onChangeText, placeholder, accessibilityLabel = 'Mensaje', editable = true,
  autoFocus = false, maxLength = 2000, containerStyle, expandido = false }: CampoMensajeProps) {
  const texto = useNativeState(value)
  // No reescribir teclas más recientes del buffer nativo al llegar un evento JS atrasado.
  const ultimoTexto = useRef(value)
  const seleccion = useNativeState({ start: value.length, end: value.length })
  useEffect(() => {
    if (value !== ultimoTexto.current) {
      ultimoTexto.current = value
      texto.set(value)
      seleccion.set({ start: value.length, end: value.length })
    }
  }, [texto, seleccion, value])
  return <AndroidHost matchContents={{ vertical: true }} style={[{ width: '100%', minHeight: expandido ? 112 : 48, flexShrink: 0 }, containerStyle]}>
    <BasicTextField value={texto} selection={seleccion} autoFocus={autoFocus} enabled={editable} maxLength={maxLength}
      singleLine={false} minLines={1} maxLines={5} cursorColor={ANDROID_COLORS.text}
      textStyle={{ color: ANDROID_COLORS.text, fontSize: 16 }}
      textSelectionColors={{ handleColor: ANDROID_COLORS.text, backgroundColor: '#FFFFFF40' }}
      keyboardOptions={{ capitalization: 'sentences', autoCorrectEnabled: true, imeAction: 'none' }}
      onValueChange={next => { if (editable) { ultimoTexto.current = next; onChangeText(next) } }}
      modifiers={[fillMaxWidth(), defaultMinSize({ minHeight: expandido ? 112 : 48 }), padding(14, 12, 14, 12), androidAccessibility(accessibilityLabel)]}>
      <BasicTextField.DecorationBox><Box contentAlignment="topStart" modifiers={[fillMaxWidth()]}>
        <BasicTextField.Placeholder><Text color={ANDROID_COLORS.muted} style={{ fontSize: 16 }}>{placeholder}</Text></BasicTextField.Placeholder>
        <BasicTextField.InnerTextField />
      </Box></BasicTextField.DecorationBox>
    </BasicTextField>
  </AndroidHost>
}
