import { forwardRef } from 'react'
import { Text, View, type TextInput } from 'react-native'
import type { FieldProps } from './Field'
import { EntradaTexto } from './EntradaTexto.android'

export type { FieldProps } from './Field'
export const PLACEHOLDER_COLOR = '#777777'

/** Conserva ayuda, accesorios y validación compartida; la edición es Jetpack Compose. */
export const Field = forwardRef<TextInput, FieldProps>(function Field({ label, icon, hint, error, accessory, valid: _valid, ...input }, ref) {
  const pie = error ?? hint ?? (label ? ' ' : null)
  return <View className="gap-2">
    {label ? <Text className="text-muted-foreground text-footnote font-semibold uppercase">{label}</Text> : null}
    <View className={`min-h-14 flex-row items-center gap-3 rounded-lg bg-muted px-4 ${error ? 'border border-destructive' : ''}`}>
      {icon}
      <EntradaTexto ref={ref} placeholderTextColor={PLACEHOLDER_COLOR} accessibilityLabel={label ?? input.placeholder} className="flex-1 text-foreground text-subheadline" {...input} />
      {accessory}
    </View>
    {pie !== null ? <Text accessibilityLiveRegion={error ? 'polite' : 'none'} className={`text-caption1 ${error ? 'text-destructive' : 'text-muted-foreground'}`}>{pie}</Text> : null}
  </View>
})
