import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { IconButton } from './IconButton'

/** El fondo de la portada continúa detrás de la cabecera y del área segura. */
export function PlayerHeader({ title, subtitle, onClose, closeLabel = 'Cerrar reproductor', right }: {
  title: string; subtitle?: string; onClose: () => void; closeLabel?: string; right?: ReactNode
}) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 6, minHeight: 56, flexShrink: 0 }}>
    <IconButton label={closeLabel} symbol="chevron.down" onPress={onClose} lado={44} size={20} />
    <View style={{ flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: 8, gap: 3 }}>
      <Text style={{ color: '#E5E5E5', fontSize: 14, fontWeight: '600', textAlign: 'center', flexShrink: 0 }}>{title}</Text>
      {subtitle ? <Text style={{ color: '#B3B3B3', fontSize: 12, textAlign: 'center', flexShrink: 0 }}>{subtitle}</Text> : null}
    </View>
    {right ?? <View style={{ width: 44 }} />}
  </View>
}
