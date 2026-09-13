import { CopyFeedback } from './CopyFeedback'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import type { FilaSocialProps } from './FilaSocial.types'

export function FilaSocial({ titulo, detalle, fontFamily, valor, label, selected = false, busy = false, disabled = false, onPress, copyText }: FilaSocialProps) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label ?? [titulo, detalle, valor].filter(Boolean).join(', ')}
    accessibilityState={{ selected, disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress}
    className="min-h-11 flex-row items-center gap-3 px-3 py-3 active:bg-muted">
    <View className="min-w-0 flex-1 gap-1"><Text style={fontFamily ? { fontFamily } : undefined} className="text-foreground text-subheadline font-semibold">{titulo}</Text>
      {detalle ? <Text className="text-muted-foreground text-footnote">{detalle}</Text> : null}</View>
    {copyText !== undefined ? <CopyFeedback text={copyText} label={valor ?? 'Copiar'} /> : busy ? <ActivityIndicator color="#B3B3B3" /> : valor ? <Text className="text-muted-foreground text-footnote">{valor}</Text> : selected ? <Text className="text-foreground">✓</Text> : null}
  </Pressable>
}
