import { Button, Host, ProgressView, Text, HStack, Spacer } from '@expo/ui/swift-ui'
import { accessibilityLabel, buttonBorderShape, buttonStyle, controlSize, disabled as deshabilitado, font, foregroundStyle, frame, padding, tint } from '@expo/ui/swift-ui/modifiers'
import { Platform } from 'react-native'
import type { PrimaryButtonProps, GhostButtonProps } from './Button.types'
import { CONTROL } from './tipografia'

const vidrio = Number.parseInt(String(Platform.Version), 10) >= 26

export function PrimaryButton({ label, onPress, disabled = false, busy = false }: PrimaryButtonProps) {
  return <Boton label={label} onPress={onPress} disabled={disabled} busy={busy} principal />
}

export function GhostButton({ label, onPress, disabled = false }: GhostButtonProps) {
  return <Boton label={label} onPress={onPress} disabled={disabled} />
}

function Boton({ label, onPress, disabled = false, busy = false, principal = false }: PrimaryButtonProps & { principal?: boolean }) {
  const inactivo = disabled || busy
  return <Host matchContents={{ vertical: true }} style={{ minHeight: CONTROL.botonGrande, width: '100%' }} colorScheme="dark" seedColor="#FFFFFF">
    <Button onPress={inactivo ? undefined : onPress} modifiers={[
      accessibilityLabel(busy ? `${label}, en curso` : label),
      buttonStyle(principal ? (vidrio ? 'glassProminent' : 'borderedProminent') : (vidrio ? 'glass' : 'bordered')),
      buttonBorderShape('capsule'), controlSize('large'), tint('#FFFFFF'), deshabilitado(inactivo),
    ]}>
      <HStack modifiers={[frame({ minHeight: 28 })]}>
        <Spacer />
        {busy ? <ProgressView modifiers={[tint(principal ? '#121212' : '#FFFFFF')]} /> :
          <Text modifiers={[font({ textStyle: 'body', weight: 'semibold' }), foregroundStyle(principal ? '#121212' : '#FFFFFF')]}>{label}</Text>}
      <Spacer />
      </HStack>
    </Button>
  </Host>
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return <Host matchContents={{ vertical: true }} colorScheme="dark" style={{ width: '100%' }}>
    <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle('#B3B3B3'), padding({ horizontal: 16, vertical: 12 }), accessibilityLabel(message)]}>{message}</Text>
  </Host>
}
