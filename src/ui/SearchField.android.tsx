import { useEffect, useImperativeHandle, useRef } from 'react'
import { Search, X } from 'lucide-react-native'
import { BasicTextField, Box, CircularProgressIndicator, IconButton, RNHostView, Row, Text, useNativeState, type TextFieldRef } from '@expo/ui/jetpack-compose'
import { background, clip, defaultMinSize, fillMaxWidth, padding, Shapes, size, weight } from '@expo/ui/jetpack-compose/modifiers'
import { AndroidHost, ANDROID_COLORS, androidAccessibility } from './AndroidHost'
import type { SearchFieldProps } from './SearchField.types'
import { ANDROID_TYPE } from './androidDesign'

/** SearchBar no expone valor ni ref en este SDK; BasicTextField conserva la búsqueda y foco controlados. */
export function SearchField({ value, onChangeText, placeholder = 'Buscar', accessibilityLabel, onSubmit,
  autoFocus, loading = false, inputRef, onFocusChange }: SearchFieldProps) {
  const input = useRef<TextFieldRef>(null)
  const focused = useRef(false)
  const recibioFoco = useRef(false)
  const texto = useNativeState(value)
  // No reescribir teclas más recientes del buffer nativo al llegar un evento JS atrasado.
  const ultimoTexto = useRef(value)
  const seleccion = useNativeState({ start: value.length, end: value.length })
  useImperativeHandle(inputRef, () => ({ focus: () => { void input.current?.focus() }, blur: () => { void input.current?.blur() } }), [])
  useEffect(() => {
    if (value !== ultimoTexto.current) {
      ultimoTexto.current = value
      texto.set(value)
      seleccion.set({ start: value.length, end: value.length })
    }
  }, [texto, seleccion, value])
  return <AndroidHost matchContents={{ vertical: true }} style={{ width: '100%', minHeight: 48, flexShrink: 0 }}>
    <Row verticalAlignment="center" modifiers={[fillMaxWidth(), defaultMinSize({ minHeight: 48 }), clip(Shapes.RoundedCorner(24)), background(ANDROID_COLORS.surface), padding(14, 0, 0, 0)]}>
      <RNHostView matchContents><Search size={20} color={ANDROID_COLORS.muted} /></RNHostView>
      <BasicTextField ref={input} value={texto} selection={seleccion} autoFocus={autoFocus} singleLine onValueChange={next => { ultimoTexto.current = next; onChangeText(next) }}
        onFocusChanged={next => {
          // Compose emite `false` al crear el campo, antes de procesar autoFocus.
          // Propagar ese estado desmontaba SearchRow y el teclado nunca llegaba a abrirse.
          if (focused.current === next) return
          focused.current = next
          if (next) recibioFoco.current = true
          if (next || recibioFoco.current) onFocusChange?.(next)
        }} textStyle={{ ...ANDROID_TYPE.body, color: ANDROID_COLORS.text }} cursorColor={ANDROID_COLORS.text}
        keyboardOptions={{ capitalization: 'none', autoCorrectEnabled: false, keyboardType: 'text', imeAction: 'search' }}
        keyboardActions={{ onSearch: () => onSubmit?.() }}
        modifiers={[weight(1), padding(10, 12, value || loading ? 0 : 14, 12), androidAccessibility(accessibilityLabel ?? placeholder)]}>
        <BasicTextField.DecorationBox><Box contentAlignment="centerStart" modifiers={[fillMaxWidth()]}>
          <BasicTextField.Placeholder><Text color={ANDROID_COLORS.muted} style={ANDROID_TYPE.body} maxLines={1}>{placeholder}</Text></BasicTextField.Placeholder>
          <BasicTextField.InnerTextField />
        </Box></BasicTextField.DecorationBox>
      </BasicTextField>
      {loading ? <Box contentAlignment="center" modifiers={[size(48, 48), androidAccessibility('Buscando')]}>
        <CircularProgressIndicator color={ANDROID_COLORS.text} strokeWidth={2} modifiers={[size(20, 20)]} />
      </Box> : value ? <IconButton onClick={() => { ultimoTexto.current = ''; texto.set(''); seleccion.set({ start: 0, end: 0 }); onChangeText(''); void input.current?.focus() }}
        colors={{ contentColor: ANDROID_COLORS.muted }} modifiers={[size(48, 48), androidAccessibility('Limpiar la búsqueda')]}>
        <RNHostView matchContents><X size={20} color={ANDROID_COLORS.muted} /></RNHostView>
      </IconButton> : null}
    </Row>
  </AndroidHost>
}
