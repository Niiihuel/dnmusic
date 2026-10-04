import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { useEstadoCopia } from '../state/copia'
import { ActionSwap } from './ActionSwap'
import { IconCheck, IconCopiar } from './icons'

/** Comparte el resultado real del portapapeles; nunca confirma sólo por un clic. */
export function CopyFeedback({ text, label, icon, color = '#FFFFFF', rowDensity, lineas = 1 }: { text: string; label: string; icon?: ReactNode; color?: string; rowDensity?: 'compact' | 'regular'; lineas?: 1 | 2 }) {
  const state = useEstadoCopia(text)
  const title = state === 'copied' ? 'Copiado' : state === 'pending' ? 'Copiando…' : state === 'error' ? 'Reintentar copia' : label
  const textClass = rowDensity ? (rowDensity === 'compact' ? 'text-subheadline' : 'text-body') : 'text-subheadline font-semibold'
  const multiline = lineas === 2
  const textStyle = multiline ? { color, minWidth: 0, width: '100%' as const } : { color }
  const etiqueta = <ActionSwap value={state} reserve={<Text style={textStyle} className={textClass} numberOfLines={multiline ? 2 : undefined}>{label}</Text>}>
    <Text style={textStyle} className={textClass} numberOfLines={multiline ? 2 : undefined}>{title}</Text>
  </ActionSwap>
  return <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: rowDensity === 'regular' ? 12 : rowDensity === 'compact' ? 10 : 8, ...(multiline ? { flex: 1, minWidth: 0 } : {}) }}>
    <ActionSwap value={state} reserve={icon}>
      {state === 'copied' ? <IconCheck size={17} color={color} /> : icon ?? <IconCopiar size={17} color={color} />}
    </ActionSwap>
    {multiline ? <View style={{ flex: 1, minWidth: 0 }}>{etiqueta}</View> : etiqueta}
  </View>
}
