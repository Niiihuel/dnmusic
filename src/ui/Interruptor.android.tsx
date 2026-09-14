import { Switch } from '@expo/ui/jetpack-compose'
import { AndroidHost, ANDROID_COLORS, androidAccessibility } from './AndroidHost'
import type { InterruptorProps } from './Interruptor.types'

export function Interruptor({ activo, onCambiar, disabled = false, rotulo }: InterruptorProps) {
  return <AndroidHost matchContents style={{ minWidth: 52, minHeight: 48 }}>
    <Switch value={activo} enabled={!disabled} onCheckedChange={next => { if (!disabled) onCambiar(next) }}
      colors={{ checkedTrackColor: ANDROID_COLORS.primary, checkedThumbColor: ANDROID_COLORS.onPrimary,
        uncheckedTrackColor: ANDROID_COLORS.raised, uncheckedThumbColor: ANDROID_COLORS.muted, uncheckedBorderColor: ANDROID_COLORS.muted }}
      modifiers={[androidAccessibility(rotulo)]} />
  </AndroidHost>
}
