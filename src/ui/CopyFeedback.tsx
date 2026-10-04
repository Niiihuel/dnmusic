import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { useEstadoCopia } from '../state/copia'
import { ActionSwap } from './ActionSwap'
import { IconCheck, IconCopiar } from './icons'

/** Comparte el resultado real del portapapeles; nunca confirma sólo por un clic. */
export function CopyFeedback({ text, label, icon, color = '#FFFFFF', rowDensity }: { text: string; label: string; icon?: ReactNode; color?: string; rowDensity?: 'compact' | 'regular' }) {
  const state = useEstadoCopia(text)
  const title = state === 'copied' ? 'Copiado' : state === 'pending' ? 'Copiando…' : state === 'error' ? 'Reintentar copia' : label
  const textClass = rowDensity ? (rowDensity === 'compact' ? 'text-subheadline' : 'text-body') : 'text-subheadline font-semibold'
  return <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: rowDensity === 'regular' ? 12 : rowDensity === 'compact' ? 10 : 8 }}>
    <ActionSwap value={state} reserve={icon}>
      {state === 'copied' ? <IconCheck size={17} color={color} /> : icon ?? <IconCopiar size={17} color={color} />}
    </ActionSwap>
    <ActionSwap value={state} reserve={<Text style={{ color }} className={textClass}>{label}</Text>}>
      <Text style={{ color }} className={textClass}>{title}</Text>
    </ActionSwap>
  </View>
}
