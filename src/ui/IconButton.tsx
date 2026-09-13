import { ActivityIndicator, Pressable } from 'react-native'
import type { IconButtonProps } from './IconButton.types'
import { useConTooltip } from './Tooltip'
import { ICON_COLOR } from './icons'
import { estadoControlWeb } from './estadoControl'

export function IconButton({ label, onPress, icon, disabled = false, busy = false, disableWhileBusy = false, selected = false, lado = 44, variant = 'plain' }: IconButtonProps) {
  const inactivo = disabled || (busy && disableWhileBusy)
  const tip = useConTooltip(label)
  return <Pressable {...tip.gestos} {...estadoControlWeb(variant === 'primary' ? 'inverse' : 'normal')}
    accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled: inactivo, selected, busy }} disabled={inactivo}
    onPress={onPress} style={{ width: lado, height: lado, flexShrink: 0, opacity: inactivo ? 0.4 : 1 }}
    className={`items-center justify-center rounded-full active:opacity-60 ${variant === 'primary' ? 'bg-primary' : variant === 'glass' || selected ? 'bg-muted' : ''}`}>
    {busy ? <ActivityIndicator size="small" color={variant === 'primary' ? ICON_COLOR.onPrimary : ICON_COLOR.foreground} /> : icon}
  </Pressable>
}
