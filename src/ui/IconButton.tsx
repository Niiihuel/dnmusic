import { ActivityIndicator, Pressable } from 'react-native'
import type { IconButtonProps } from './IconButton.types'
import { useConTooltip } from './Tooltip'
import { ICON_COLOR } from './icons'
import { estadoControlWeb } from './estadoControl'
import { ES_WEB, Glass } from './Glass'
import { ExpandableButton } from './ExpandableButton'

export function IconButton({ label, onPress, icon, disabled = false, busy = false, disableWhileBusy = false, selected = false, lado = 44, variant = 'plain', expandible = false, copyText }: IconButtonProps) {
  const inactivo = disabled || (busy && disableWhileBusy)
  const tip = useConTooltip(expandible && ES_WEB ? undefined : label)
  const content = busy ? <ActivityIndicator size="small" color={variant === 'primary' ? ICON_COLOR.onPrimary : ICON_COLOR.foreground} /> : icon
  if (ES_WEB && expandible) return <ExpandableButton icon={content} label={label} onPress={onPress}
    disabled={inactivo} busy={busy} selected={selected} size={lado} copyText={copyText} />
  const button = <Pressable {...tip.gestos} {...estadoControlWeb(variant === 'primary' ? 'inverse' : variant === 'glass' && ES_WEB ? 'glass' : 'normal')}
    accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled: inactivo, selected, busy }} disabled={inactivo}
    onPress={onPress} style={{ width: lado, height: lado, flexShrink: 0, opacity: inactivo ? 0.4 : 1 }}
    className={`items-center justify-center rounded-full active:opacity-60 ${variant === 'primary' ? 'bg-primary' : (variant === 'glass' && !ES_WEB) || selected ? 'bg-muted' : ''}`}>
    {content}
  </Pressable>
  return ES_WEB && variant === 'glass' ? <Glass radius={999} style={{ alignSelf: 'center' }}>{button}</Glass> : button
}
