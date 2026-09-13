import { View } from 'react-native'
import { Button, HStack, Host, ProgressView, RNHostView, Text } from '@expo/ui/swift-ui'
import {
  accessibilityHint,
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  controlSize,
  disabled as disabledModifier,
  font,
  frame,
  foregroundStyle,
  tint,
} from '@expo/ui/swift-ui/modifiers'
import { GoogleIcon } from './GoogleIcon'
import type { GoogleOAuthButtonProps } from './GoogleOAuthButton.types'

/** Acción OAuth dibujada por SwiftUI; el navegador también es ASWebAuthenticationSession. */
export function GoogleOAuthButton({ label, onPress, busy = false, disabled = false }: GoogleOAuthButtonProps) {
  const inactivo = disabled || busy
  return (
    <Host ignoreSafeArea="all" matchContents={{ vertical: true }} colorScheme="dark" seedColor="#FFFFFF" style={{ width: '100%', minHeight: 50 }}>
      <Button
        onPress={inactivo ? undefined : onPress}
        modifiers={[
          buttonStyle('borderedProminent'),
          buttonBorderShape('capsule'),
          controlSize('large'),
          frame({ maxWidth: Infinity, minHeight: 50 }),
          disabledModifier(inactivo),
          accessibilityLabel(label),
          accessibilityHint('Abre la ventana segura del sistema para continuar con Google'),
        ]}
      >
        <HStack spacing={8} modifiers={[foregroundStyle('#121212')]}>
          {busy ? <ProgressView modifiers={[controlSize('small'), tint('#121212')]} /> : <HStack modifiers={[frame({ width: 18, height: 18 })]}><RNHostView matchContents><View collapsable={false} style={{ width: 18, height: 18 }}><GoogleIcon size={18} /></View></RNHostView></HStack>}
          <Text modifiers={[font({ textStyle: 'subheadline', weight: 'semibold' })]}>{label}</Text>
        </HStack>
      </Button>
    </Host>
  )
}
