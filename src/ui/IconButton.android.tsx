import { FilledIconButton, IconButton as ComposeIconButton, CircularProgressIndicator } from '@expo/ui/jetpack-compose'
import { size } from '@expo/ui/jetpack-compose/modifiers'
import { AndroidHost, androidAccessibility } from './AndroidHost'
import { AndroidIcon } from './AndroidIcon'
import type { IconButtonProps } from './IconButton.types'

export function IconButton({ label, symbol, onPress, disabled = false, busy = false, disableWhileBusy = false,
  selected = false, size: iconSize = 20, lado = 48, variant = 'plain', muted = false }: IconButtonProps) {
  const inactive = disabled || (busy && disableWhileBusy)
  const area = Math.max(48, lado)
  const filled = variant === 'primary'
  const color = filled ? '#121212' : muted && !selected ? '#B3B3B3' : '#FFFFFF'
  const Button = variant === 'plain' ? ComposeIconButton : FilledIconButton
  return <AndroidHost style={{ width: area, height: area, flexShrink: 0 }}>
    <Button enabled={!inactive} onClick={inactive ? undefined : onPress}
      colors={{ containerColor: filled ? '#FFFFFF' : '#303032', contentColor: color,
        disabledContainerColor: '#303032', disabledContentColor: '#777777' }}
      modifiers={[size(area, area), androidAccessibility(label, busy ? 'En curso' : selected ? 'Seleccionado' : undefined)]}>
      {busy ? <CircularProgressIndicator color={inactive ? '#B3B3B3' : color} modifiers={[size(22, 22)]} /> :
        <AndroidIcon symbol={symbol} size={iconSize} color={inactive ? '#777777' : color} />}
    </Button>
  </AndroidHost>
}
