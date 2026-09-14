import { Button, FilledTonalButton, Text, CircularProgressIndicator } from '@expo/ui/jetpack-compose'
import { fillMaxWidth, defaultMinSize, size } from '@expo/ui/jetpack-compose/modifiers'
import { AndroidHost, androidAccessibility } from './AndroidHost'
import type { PrimaryButtonProps, GhostButtonProps } from './Button.types'

export function PrimaryButton(props: PrimaryButtonProps) { return <NativeButton {...props} primary /> }
export function GhostButton(props: GhostButtonProps) { return <NativeButton {...props} /> }
function NativeButton({ label, onPress, disabled = false, busy = false, primary = false }: PrimaryButtonProps & { primary?: boolean }) {
  const inactive = disabled || busy
  const Native = primary ? Button : FilledTonalButton
  const foreground = primary ? '#121212' : '#FFFFFF'
  return <AndroidHost matchContents={{ vertical: true }} style={{ width: '100%', minHeight: 48 }}>
    <Native enabled={!inactive} onClick={inactive ? undefined : onPress}
      colors={{ containerColor: primary ? '#FFFFFF' : '#303032', contentColor: foreground,
        disabledContainerColor: '#303032', disabledContentColor: '#8B8B8F' }}
      modifiers={[fillMaxWidth(), defaultMinSize({ minHeight: 48 }), androidAccessibility(label, busy ? 'En curso' : undefined)]}>
      {busy ? <CircularProgressIndicator color={foreground} modifiers={[size(22, 22)]} /> : <Text color={inactive ? '#8B8B8F' : foreground} style={{ fontSize: 16, fontWeight: '600' }}>{label}</Text>}
    </Native>
  </AndroidHost>
}
export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return <AndroidHost matchContents={{ vertical: true }} style={{ width: '100%' }}>
    <Text color="#FF6961" style={{ fontSize: 13 }} modifiers={[androidAccessibility(message)]}>{message}</Text>
  </AndroidHost>
}
