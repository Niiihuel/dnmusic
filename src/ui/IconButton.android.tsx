import { View } from 'react-native'
import { IconButton as ComposeIconButton, CircularProgressIndicator } from '@expo/ui/jetpack-compose'
import { size } from '@expo/ui/jetpack-compose/modifiers'
import { AndroidHost, androidAccessibility } from './AndroidHost'
import { AndroidIcon } from './AndroidIcon'
import type { IconButtonProps } from './IconButton.types'
import { ANDROID_COLORS, ANDROID_CONTROL, androidButtonSurface } from './androidDesign'

export function IconButton({ label, symbol, onPress, disabled = false, busy = false, disableWhileBusy = false,
  selected = false, size: iconSize = 20, lado = 48, variant = 'plain', muted = false }: IconButtonProps) {
  const inactive = disabled || (busy && disableWhileBusy)
  const area = Math.max(48, lado)
  const visual = Math.min(ANDROID_CONTROL.large, Math.max(ANDROID_CONTROL.small, lado - 4))
  const color = muted && !selected ? ANDROID_COLORS.muted : ANDROID_COLORS.strong
  return <View style={{ width: area, height: area, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }}>
    {variant !== 'plain' || selected ? <View pointerEvents="none" style={[androidButtonSurface(selected || variant === 'primary'), { position: 'absolute', width: visual, height: visual, opacity: inactive ? 0.4 : 1 }]} /> : null}
    <AndroidHost style={{ width: area, height: area, flexShrink: 0 }}>
    <ComposeIconButton enabled={!inactive} onClick={inactive ? undefined : onPress}
      colors={{ containerColor: 'transparent', contentColor: color,
        disabledContainerColor: 'transparent', disabledContentColor: ANDROID_COLORS.muted }}
      modifiers={[size(area, area), androidAccessibility(label, busy ? 'En curso' : selected ? 'Seleccionado' : undefined)]}>
      {busy ? <CircularProgressIndicator color={inactive ? ANDROID_COLORS.muted : color} modifiers={[size(22, 22)]} /> :
        <AndroidIcon symbol={symbol} size={iconSize} color={inactive ? ANDROID_COLORS.muted : color} />}
    </ComposeIconButton>
  </AndroidHost></View>
}
