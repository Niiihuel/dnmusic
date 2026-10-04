import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { StyleSheet, View, type TextInput, type TextInputProps, type ViewStyle } from 'react-native'
import { cssInterop } from 'nativewind'
import { BasicTextField, Box, Text, useNativeState, type TextFieldKeyboardType, type TextFieldImeAction, type TextFieldRef, type TextFieldTextStyle } from '@expo/ui/jetpack-compose'
import { defaultMinSize, fillMaxWidth, semantics } from '@expo/ui/jetpack-compose/modifiers'
import { AndroidHost, ANDROID_COLORS, androidAccessibility } from './AndroidHost'
import { ANDROID_TYPE } from './androidDesign'

/** El buffer, la selección y el teclado pertenecen a Compose; RN conserva el contrato del formulario. */
export const EntradaTexto = forwardRef<TextInput, TextInputProps>(function EntradaTexto(props, ref) {
  const { value, defaultValue, onChangeText, placeholder, editable = true, secureTextEntry = false,
    autoFocus, maxLength, multiline = false, autoCapitalize = 'sentences', autoCorrect = true,
    onSubmitEditing, onFocus, onBlur, onEndEditing, onSelectionChange, selection, style, className,
    returnKeyType, submitBehavior, blurOnSubmit, accessibilityLabel: label } = props
  const input = useRef<TextFieldRef>(null)
  const focused = useRef(false)
  const initialText = value ?? defaultValue ?? ''
  const texto = useNativeState(initialText)
  // No reescribir teclas más recientes del buffer nativo al llegar un evento JS atrasado.
  const ultimoTexto = useRef(initialText)
  const seleccion = useNativeState({ start: selection?.start ?? initialText.length, end: selection?.end ?? selection?.start ?? initialText.length })
  const styles = StyleSheet.flatten(style) ?? {}
  const fontWeight = typeof styles.fontWeight === 'number' ? String(styles.fontWeight) : styles.fontWeight
  const alignment = props.textAlign ?? styles.textAlign
  const textStyle: TextFieldTextStyle = {
    color: styles.color ?? ANDROID_COLORS.text, fontSize: styles.fontSize ?? ANDROID_TYPE.body.fontSize,
    fontFamily: styles.fontFamily ?? ANDROID_TYPE.body.fontFamily, fontWeight: fontWeight as TextFieldTextStyle['fontWeight'],
    textAlign: alignment === 'auto' ? undefined : alignment, lineHeight: styles.lineHeight ?? ANDROID_TYPE.body.lineHeight, letterSpacing: styles.letterSpacing ?? ANDROID_TYPE.body.letterSpacing,
  }
  useEffect(() => {
    if (value !== undefined && value !== ultimoTexto.current) {
      ultimoTexto.current = value
      texto.set(value)
      // Un borrador nuevo empieza al final; las pulsaciones ya actualizaron el buffer nativo.
      if (!selection) seleccion.set({ start: value.length, end: value.length })
    }
  }, [value, texto, seleccion, selection])
  useEffect(() => {
    if (selection) void input.current?.setSelection(selection.start, selection.end ?? selection.start)
  }, [selection?.start, selection?.end, selection])
  useImperativeHandle(ref, () => ({
    focus: () => { void input.current?.focus() }, blur: () => { void input.current?.blur() },
    clear: () => { ultimoTexto.current = ''; texto.set(''); void input.current?.clear() }, isFocused: () => focused.current,
  }) as TextInput, [texto])
  const event = (text = texto.get()) => ({ nativeEvent: { text, target: 0, eventCount: 0 } })
  const mode = props.inputMode ?? props.keyboardType
  const keyboard: TextFieldKeyboardType = secureTextEntry
    ? (['numeric', 'number-pad', 'decimal', 'decimal-pad'].includes(mode ?? '') ? 'numberPassword' : 'password')
    : mode === 'email' || mode === 'email-address' ? 'email'
      : mode === 'url' ? 'uri' : mode === 'tel' || mode === 'phone-pad' ? 'phone'
        : mode === 'numeric' || mode === 'number-pad' ? 'number'
          : mode === 'decimal' || mode === 'decimal-pad' ? 'decimal'
            : mode === 'ascii-capable' ? 'ascii' : 'text'
  const newline = multiline && (submitBehavior === 'newline' || (!submitBehavior && !blurOnSubmit))
  const imeAction: TextFieldImeAction = newline ? 'none'
    : returnKeyType && ['go', 'search', 'send', 'previous', 'next', 'done'].includes(returnKeyType)
      ? returnKeyType as TextFieldImeAction : 'done'
  const submit = (text: string) => {
    if (!editable || newline) return
    onSubmitEditing?.(event(text) as unknown as Parameters<NonNullable<TextInputProps['onSubmitEditing']>>[0])
    if (submitBehavior === 'blurAndSubmit' || blurOnSubmit || (!submitBehavior && !multiline)) void input.current?.blur()
  }
  const contentType = props.autoComplete && props.autoComplete !== 'off' ? props.autoComplete
    : props.textContentType === 'username' ? 'username' : props.textContentType === 'password' ? 'password'
      : props.textContentType === 'newPassword' ? 'new-password' : props.textContentType === 'emailAddress' ? 'email'
        : props.textContentType === 'oneTimeCode' ? 'one-time-code' : undefined
  return <View className={className} style={[{ minWidth: 0, minHeight: multiline ? 60 : 48 }, styles as ViewStyle]}>
    <AndroidHost style={{ width: '100%', flexShrink: 0 }} matchContents={{ vertical: true }}>
      <BasicTextField ref={input} value={texto} selection={seleccion} autoFocus={autoFocus} enabled={editable}
        singleLine={!multiline || secureTextEntry} minLines={multiline && !secureTextEntry ? 2 : 1}
        maxLines={multiline && !secureTextEntry ? props.scrollEnabled === false ? undefined : Math.max(2, props.numberOfLines ?? 8) : 1} maxLength={maxLength}
        visualTransformation={secureTextEntry ? 'password' : 'none'} textStyle={textStyle}
        cursorColor={ANDROID_COLORS.text} textSelectionColors={{ handleColor: ANDROID_COLORS.text, backgroundColor: '#FFFFFF40' }}
        keyboardOptions={{ capitalization: secureTextEntry ? 'none' : autoCapitalize, autoCorrectEnabled: !secureTextEntry && autoCorrect, keyboardType: keyboard, imeAction }}
        keyboardActions={{ onDone: submit, onGo: submit, onSearch: submit, onSend: submit, onNext: submit, onPrevious: submit }}
        onValueChange={next => { if (editable) { ultimoTexto.current = next; onChangeText?.(next); props.onChange?.(event(next) as unknown as Parameters<NonNullable<TextInputProps['onChange']>>[0]) } }}
        onFocusChanged={next => {
          // Compose también avisa el estado inicial sin foco; no es un blur del usuario.
          if (focused.current === next) return
          focused.current = next
          if (next) {
            if (props.selectTextOnFocus) void input.current?.setSelection(0, texto.get().length)
            onFocus?.(event() as unknown as Parameters<NonNullable<TextInputProps['onFocus']>>[0])
          } else {
            onBlur?.(event() as unknown as Parameters<NonNullable<TextInputProps['onBlur']>>[0])
            onEndEditing?.(event() as unknown as Parameters<NonNullable<TextInputProps['onEndEditing']>>[0])
          }
        }}
        onSelectionChange={onSelectionChange ? next => onSelectionChange({ nativeEvent: { selection: next } } as Parameters<NonNullable<TextInputProps['onSelectionChange']>>[0]) : undefined}
        modifiers={[fillMaxWidth(), defaultMinSize({ minHeight: multiline ? 60 : 48 }), androidAccessibility(label ?? placeholder ?? 'Texto'), ...(contentType ? [semantics({ contentType })] : [])]}>
        <BasicTextField.DecorationBox>
          <Box contentAlignment={multiline ? 'topStart' : 'centerStart'} modifiers={[fillMaxWidth(), defaultMinSize({ minHeight: multiline ? 60 : 48 })]}>
            <BasicTextField.Placeholder><Text color={typeof props.placeholderTextColor === 'string' ? props.placeholderTextColor : ANDROID_COLORS.muted} style={{ fontSize: textStyle.fontSize }} maxLines={multiline ? undefined : 1}>{placeholder}</Text></BasicTextField.Placeholder>
            <BasicTextField.InnerTextField />
          </Box>
        </BasicTextField.DecorationBox>
      </BasicTextField>
    </AndroidHost>
  </View>
})

cssInterop(EntradaTexto, { className: 'style' })
