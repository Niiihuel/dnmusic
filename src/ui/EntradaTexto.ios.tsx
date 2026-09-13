import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { StyleSheet, View, type TextInput, type TextInputProps, type ViewStyle } from 'react-native'
import { cssInterop } from 'nativewind'
import { Host, SecureField, TextField, useNativeState, type TextFieldRef, type SecureFieldRef } from '@expo/ui/swift-ui'
import { accessibilityLabel, autocorrectionDisabled, disabled, font, foregroundStyle, frame, italic, keyboardType, lineLimit, multilineTextAlignment, onSubmit, submitLabel, textContentType, textFieldStyle, textInputAutocapitalization } from '@expo/ui/swift-ui/modifiers'

/**
 * Adaptador de los contratos de edición utilizados por la app. El texto y el
 * teclado son SwiftUI; View conserva el espacio que le asigna el formulario RN.
 * No simula eventos táctiles: sólo traduce cambio, foco y submit del campo.
 */
export const EntradaTexto = forwardRef<TextInput, TextInputProps>(function EntradaTexto(props, ref) {
  const { value, defaultValue, onChangeText, placeholder, editable = true, secureTextEntry,
    autoFocus, maxLength, multiline, autoCapitalize = 'sentences', autoCorrect = true,
    onSubmitEditing, onFocus, onBlur, onEndEditing, onSelectionChange, selection, style, className,
    returnKeyType, submitBehavior, blurOnSubmit, textContentType: contentType, accessibilityLabel: label } = props
  const input = useRef<TextFieldRef | SecureFieldRef>(null)
  const focused = useRef(false)
  const texto = useNativeState(value ?? defaultValue ?? '')
  const styles = StyleSheet.flatten(style) ?? {}
  const alineacion = props.textAlign ?? styles.textAlign
  useEffect(() => { if (value !== undefined && texto.get() !== value) texto.set(value) }, [value, texto])
  useEffect(() => {
    if (selection && !secureTextEntry) void (input.current as TextFieldRef | null)?.setSelection(selection.start, selection.end ?? selection.start)
  }, [selection?.start, selection?.end, selection, secureTextEntry])
  useImperativeHandle(ref, () => ({
    focus: () => { void input.current?.focus() },
    blur: () => { void input.current?.blur() },
    clear: () => { texto.set(''); void input.current?.clear() },
    isFocused: () => focused.current,
  }) as TextInput, [texto])
  const event = () => ({ nativeEvent: { text: texto.get(), target: 0, eventCount: 0 } })
  const keyboard = props.inputMode === 'email' ? 'email-address' : props.inputMode === 'url' ? 'url'
    : props.inputMode === 'tel' ? 'phone-pad' : props.inputMode === 'numeric' ? 'numeric'
    : props.inputMode === 'decimal' ? 'decimal-pad' : props.keyboardType === 'number-pad' ? 'numeric'
    : props.keyboardType ?? 'default'
  const returnKey = returnKeyType && ['continue', 'done', 'go', 'join', 'next', 'route', 'search', 'send'].includes(returnKeyType)
    ? returnKeyType as Parameters<typeof submitLabel>[0] : 'return'
  const content = contentType && contentType !== 'none' ? contentType as Parameters<typeof textContentType>[0]
    : props.autoComplete === 'username' ? 'username' : props.autoComplete === 'current-password' ? 'password'
    : props.autoComplete === 'new-password' ? 'newPassword' : props.autoComplete === 'email' ? 'emailAddress' : undefined
  const common = {
    text: texto, placeholder, autoFocus, maxLength,
    onTextChange: (next: string) => { if (editable) onChangeText?.(next) },
    onFocusChange: (next: boolean) => {
      focused.current = next
      if (next) {
        if (props.selectTextOnFocus && !secureTextEntry) void (input.current as TextFieldRef | null)?.setSelection(0, texto.get().length)
        onFocus?.(event() as unknown as Parameters<NonNullable<TextInputProps['onFocus']>>[0])
      }
      else { onBlur?.(event() as unknown as Parameters<NonNullable<TextInputProps['onBlur']>>[0]); onEndEditing?.(event() as unknown as Parameters<NonNullable<TextInputProps['onEndEditing']>>[0]) }
    },
    modifiers: [textFieldStyle('plain'), disabled(!editable), frame({ minHeight: multiline ? 60 : 44, maxWidth: Infinity }),
      font({ ...(styles.fontSize ? { size: styles.fontSize } : { textStyle: 'body' as const }), ...(styles.fontFamily ? { family: styles.fontFamily } : {}), weight: styles.fontWeight === 'bold' || styles.fontWeight === '700' ? 'bold' : styles.fontWeight === '600' ? 'semibold' : styles.fontWeight === '500' ? 'medium' : styles.fontWeight === '300' ? 'light' : 'regular' }),
      ...(styles.fontStyle === 'italic' ? [italic()] : []),
      foregroundStyle(typeof styles.color === 'string' ? styles.color : '#FFFFFF'),
      accessibilityLabel(label ?? placeholder ?? 'Texto'), autocorrectionDisabled(!autoCorrect),
      textInputAutocapitalization(autoCapitalize === 'none' ? 'never' : autoCapitalize),
      keyboardType(keyboard as Parameters<typeof keyboardType>[0]), submitLabel(returnKey),
      ...(content ? [textContentType(content)] : []),
      ...(alineacion ? [multilineTextAlignment(alineacion === 'right' ? 'trailing' : alineacion === 'center' ? 'center' : 'leading')] : []),
      ...(multiline ? [lineLimit({ min: 2, max: Math.max(2, props.numberOfLines ?? 8) })] : []),
      onSubmit(() => {
        if (!editable || (multiline && (submitBehavior === 'newline' || (!submitBehavior && !blurOnSubmit)))) return
        onSubmitEditing?.(event() as unknown as Parameters<NonNullable<TextInputProps['onSubmitEditing']>>[0])
        if (submitBehavior === 'blurAndSubmit' || blurOnSubmit || (!submitBehavior && !multiline)) void input.current?.blur()
      }),
    ],
  }
  return <View className={className} style={[{ minWidth: 0, minHeight: multiline ? 60 : 44 }, styles as ViewStyle]}>
    <Host style={{ width: '100%' }} matchContents={{ vertical: true }} colorScheme="dark" seedColor="#FFFFFF">
      {secureTextEntry ? <SecureField {...common} ref={input} /> : <TextField {...common} ref={input as React.Ref<TextFieldRef>}
        axis={multiline ? 'vertical' : 'horizontal'} onSelectionChange={onSelectionChange ? next => onSelectionChange({ nativeEvent: { selection: next } } as Parameters<NonNullable<TextInputProps['onSelectionChange']>>[0]) : undefined} />}
    </Host>
  </View>
})

// Resuelve las clases tipográficas antes de armar los modificadores SwiftUI.
cssInterop(EntradaTexto, { className: 'style' })
