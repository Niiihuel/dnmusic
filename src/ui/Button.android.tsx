import { View } from 'react-native'
import { Button, Text, CircularProgressIndicator } from '@expo/ui/jetpack-compose'
import { fillMaxWidth, defaultMinSize, size } from '@expo/ui/jetpack-compose/modifiers'
import { AndroidHost, androidAccessibility } from './AndroidHost'
import type { PrimaryButtonProps, GhostButtonProps } from './Button.types'
import { ANDROID_COLORS as color, ANDROID_TYPE, androidButtonSurface } from './androidDesign'

export function PrimaryButton(props: PrimaryButtonProps) { return <NativeButton {...props} primary /> }
export function GhostButton(props: GhostButtonProps) { return <NativeButton {...props} /> }
function NativeButton({ label, onPress, disabled = false, busy = false, primary = false }: PrimaryButtonProps & { primary?: boolean }) {
  const inactive = disabled || busy
  const foreground = inactive ? color.muted : primary ? color.strong : color.text
  return <View style={{ width: '100%', minHeight: 48, justifyContent: 'center' }}>
    <View pointerEvents="none" style={[androidButtonSurface(primary), { position: 'absolute', top: 2, bottom: 2, left: 0, right: 0, opacity: inactive ? 0.45 : 1 }]} />
    <AndroidHost matchContents={{ vertical: true }} style={{ width: '100%', minHeight: 48 }}>
    <Button enabled={!inactive} onClick={inactive ? undefined : onPress}
      colors={{ containerColor: 'transparent', contentColor: foreground,
        disabledContainerColor: 'transparent', disabledContentColor: color.muted }}
      modifiers={[fillMaxWidth(), defaultMinSize({ minHeight: 48 }), androidAccessibility(label, busy ? 'En curso' : undefined)]}>
      {busy ? <CircularProgressIndicator color={color.strong} modifiers={[size(22, 22)]} /> : <Text color={foreground} style={ANDROID_TYPE.body}>{label}</Text>}
    </Button>
  </AndroidHost></View>
}
export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return <AndroidHost matchContents={{ vertical: true }} style={{ width: '100%' }}>
    <Text color={color.error} style={ANDROID_TYPE.body} modifiers={[androidAccessibility(message)]}>{message}</Text>
  </AndroidHost>
}
