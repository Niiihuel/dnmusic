import { useEffect, useImperativeHandle, useRef } from 'react'
import { Button, Host, HStack, Image, ProgressView, TextField, useNativeState, type TextFieldRef } from '@expo/ui/swift-ui'
import { accessibilityLabel as etiqueta, autocorrectionDisabled, background, buttonStyle, clipShape, font, foregroundStyle, frame, glassEffect, labelStyle, onSubmit as alEnviar, padding, submitLabel, textFieldStyle, textInputAutocapitalization } from '@expo/ui/swift-ui/modifiers'
import { isLiquidGlassAvailable } from 'expo-glass-effect'
import type { SearchFieldProps } from './SearchField.types'

/** Texto, foco, limpiar y botón Buscar administrados por controles SwiftUI. */
export function SearchField({ value, onChangeText, placeholder, accessibilityLabel, onSubmit, autoFocus, loading = false, inputRef, onFocusChange, density = 'regular' }: SearchFieldProps) {
  const input = useRef<TextFieldRef>(null)
  const texto = useNativeState(value)
  const alto = density === 'compact' ? 44 : 48
  useImperativeHandle(inputRef, () => ({
    focus: () => { void input.current?.focus() },
    blur: () => { void input.current?.blur() },
  }), [])
  useEffect(() => {
    if (texto.get() !== value) texto.set(value)
  }, [texto, value])

  return <Host ignoreSafeArea="all" style={{ width: '100%', height: alto, flexShrink: 0 }} colorScheme="dark" seedColor="#FFFFFF">
    <HStack spacing={10} modifiers={[padding({ leading: 14, trailing: 2 }), frame({ height: alto }),
      // Una sola superficie, sin un relleno opaco ni clipping encima del vidrio.
      ...(isLiquidGlassAvailable()
        ? [glassEffect({ glass: { variant: 'regular' }, shape: 'capsule' })]
        : [background('#1F1F1F'), clipShape('capsule')])]}>
      <Image systemName="magnifyingglass" color="#B3B3B3" size={18} />
      <TextField ref={input} text={texto} placeholder={placeholder} autoFocus={autoFocus}
        onTextChange={onChangeText} onFocusChange={onFocusChange}
        modifiers={[textFieldStyle('plain'), font({ textStyle: 'subheadline' }), foregroundStyle('#FFFFFF'),
          etiqueta(accessibilityLabel ?? placeholder ?? 'Buscar'), autocorrectionDisabled(),
          textInputAutocapitalization('never'), submitLabel('search'), alEnviar(() => onSubmit?.())]} />
      {loading ? <ProgressView modifiers={[frame({ width: 44, height: 44 }), etiqueta('Buscando')]} /> : value ?
        <Button label="Limpiar la búsqueda" systemImage="xmark.circle.fill" onPress={() => {
          texto.set('')
          onChangeText('')
          void input.current?.focus()
        }} modifiers={[buttonStyle('plain'), labelStyle('iconOnly'), frame({ width: 44, height: 44 }), foregroundStyle('#B3B3B3')]} /> : null}
    </HStack>
  </Host>
}
