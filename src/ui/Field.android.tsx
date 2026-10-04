import { forwardRef } from 'react'
import { Text, View, type TextInput } from 'react-native'
import type { FieldProps } from './Field'
import { EntradaTexto } from './EntradaTexto.android'
import { ANDROID_CARD, ANDROID_COLORS, ANDROID_RADIUS, ANDROID_TYPE } from './androidDesign'

export type { FieldProps } from './Field'
export const PLACEHOLDER_COLOR = '#777777'

/** Conserva ayuda, accesorios y validación compartida; la edición es Jetpack Compose. */
export const Field = forwardRef<TextInput, FieldProps>(function Field({ label, icon, hint, error, accessory, valid: _valid, ...input }, ref) {
  const pie = error ?? hint ?? (label ? ' ' : null)
  return <View className="gap-2">
    {label ? <Text style={{ ...ANDROID_TYPE.body, color: ANDROID_COLORS.text }}>{label}</Text> : null}
    <View style={[ANDROID_CARD, { borderRadius: ANDROID_RADIUS.inset, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 }]}>
      {icon}
      <EntradaTexto ref={ref} placeholderTextColor={PLACEHOLDER_COLOR} accessibilityLabel={label ?? input.placeholder} className="flex-1 text-foreground text-subheadline" {...input} />
      {accessory}
    </View>
    {pie !== null ? <Text accessibilityLiveRegion={error ? 'polite' : 'none'} style={{ ...ANDROID_TYPE.body, color: error ? ANDROID_COLORS.error : ANDROID_COLORS.muted }}>{pie}</Text> : null}
  </View>
})
