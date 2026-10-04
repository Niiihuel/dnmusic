import type { ReactNode } from 'react'
import { IconButton } from './IconButton'
export function BotonVolver({ onPress, label = 'Volver', disabled = false }: {
  onPress: () => void; label?: string; disabled?: boolean; icono?: ReactNode
}) {
  return <IconButton label={label} symbol="chevron.left" variant="glass" onPress={onPress} disabled={disabled} />
}
