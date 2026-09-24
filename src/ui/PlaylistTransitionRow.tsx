import { Pressable, Text, useWindowDimensions } from 'react-native'
import type { MixPreset } from '../services/mixes'
import { estadoControlWeb } from './estadoControl'
import { ICON_COLOR, IconChevronRight, IconWave } from './icons'

const LABEL: Record<MixPreset, string> = {
  auto: 'Auto', fade: 'Fade', crescendo: 'Crescendo', fusion: 'Fusión',
  none: 'Sin mezcla', custom: 'Personalizada',
}

/** Atajo de la lista al ajuste del par real de canciones. */
export function PlaylistTransitionRow({ from, to, preset, durationMs, onPress }: {
  from: string
  to: string
  preset: MixPreset
  durationMs: number
  onPress: () => void
}) {
  const compact = useWindowDimensions().width < 780
  return <Pressable {...estadoControlWeb('surface')} accessibilityRole="button"
    accessibilityLabel={`Editar transición de ${from} a ${to}: ${LABEL[preset]}`}
    accessibilityHint="Abre las ondas de ambas canciones y la preescucha de este cruce"
    onPress={onPress}
    style={({ pressed }) => ({ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10,
      marginHorizontal: compact ? 12 : 24, paddingHorizontal: 12, borderRadius: 8,
      backgroundColor: pressed ? '#242424' : 'transparent' })}>
    <IconWave size={16} color={ICON_COLOR.muted} />
    <Text style={{ color: ICON_COLOR.muted, flex: 1, fontSize: 13, fontWeight: '500' }} numberOfLines={1}>
      Editar transición · {LABEL[preset]}{preset !== 'none' && durationMs ? ` · ${(durationMs / 1000).toFixed(1)} s` : ''}
    </Text>
    <IconChevronRight size={15} color={ICON_COLOR.muted} />
  </Pressable>
}
