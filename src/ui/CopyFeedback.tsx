import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { useEstadoCopia } from '../state/copia'
import { ActionSwap } from './ActionSwap'
import { IconCheck, IconCopiar } from './icons'

/** Comparte el resultado real del portapapeles; nunca confirma sólo por un clic. */
export function CopyFeedback({ text, label, icon, color = '#FFFFFF' }: { text: string; label: string; icon?: ReactNode; color?: string }) {
  const state = useEstadoCopia(text)
  const title = state === 'copied' ? 'Copiado' : state === 'pending' ? 'Copiando…' : state === 'error' ? 'Reintentar copia' : label
  return <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
    <ActionSwap value={state}>
      {state === 'copied' ? <IconCheck size={17} color={color} /> : icon ?? <IconCopiar size={17} color={color} />}
    </ActionSwap>
    <ActionSwap value={state} reserve={<Text style={{ color }} className="text-subheadline font-semibold">{label}</Text>}>
      <Text style={{ color }} className="text-subheadline font-semibold">{title}</Text>
    </ActionSwap>
  </View>
}
