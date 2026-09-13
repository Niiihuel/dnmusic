import { Button, Host, Image, ProgressView } from '@expo/ui/swift-ui'
import { accessibilityAddTraits, accessibilityLabel, accessibilityValue, buttonBorderShape, buttonStyle, contentShape, disabled, frame, shapes, tint } from '@expo/ui/swift-ui/modifiers'
import { Platform } from 'react-native'
import type { IconButtonProps } from './IconButton.types'

const vidrio = Number.parseInt(String(Platform.Version), 10) >= 26

/** SwiftUI controla foco, resaltado, VoiceOver y pulsación; Yoga sólo reserva el área. */
export function IconButton({ label, symbol, onPress, disabled: bloqueado = false, busy = false, disableWhileBusy = false, selected = false, size = 20, lado = 44, variant = 'plain', muted = false }: IconButtonProps) {
  const inactivo = bloqueado || (busy && disableWhileBusy)
  const area = Math.max(44, lado)
  const contenido = variant === 'plain' ? area : Math.max(20, area - 20)
  const color = variant === 'primary' ? '#121212' : muted && !selected ? '#B3B3B3' : '#FFFFFF'
  return <Host style={{ width: area, height: area, flexShrink: 0 }} colorScheme="dark" seedColor="#FFFFFF">
    <Button onPress={inactivo ? undefined : onPress} modifiers={[
      accessibilityLabel(label), ...(busy ? [accessibilityValue('En curso')] : []),
      ...(selected ? [accessibilityAddTraits(['isSelected'])] : []),
      buttonStyle(variant === 'primary' ? (vidrio ? 'glassProminent' : 'borderedProminent') : variant === 'glass' ? (vidrio ? 'glass' : 'bordered') : 'plain'),
      buttonBorderShape('circle'), tint('#FFFFFF'), frame({ width: area, height: area }), disabled(inactivo),
    ]}>
      {busy ? <ProgressView modifiers={[tint(color), frame({ width: contenido, height: contenido })]} /> :
        <Image systemName={symbol} size={size} color={color}
          modifiers={[frame({ width: contenido, height: contenido }), contentShape(shapes.rectangle())]} />}
    </Button>
  </Host>
}
