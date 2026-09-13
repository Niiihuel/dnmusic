import { Button, Host, HStack, Image, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui'
import { accessibilityAddTraits, accessibilityLabel, buttonStyle, disabled as deshabilitado, font, foregroundStyle, frame, padding, tint } from '@expo/ui/swift-ui/modifiers'
import type { FilaSocialProps } from './FilaSocial.types'

/** Content-sized native row for an existing scroll surface; deliberately has no nested List. */
export function FilaSocial({ titulo, detalle, fontFamily, valor, label, selected = false, busy = false, disabled = false, onPress }: FilaSocialProps) {
  return <Host matchContents={{ vertical: true }} colorScheme="dark" seedColor="#FFFFFF" style={{ width: '100%', minHeight: 44 }}>
    <Button onPress={disabled || busy ? undefined : onPress} modifiers={[
      buttonStyle('plain'), deshabilitado(disabled || busy),
      accessibilityLabel(label ?? [titulo, detalle, valor, busy ? 'En curso' : null].filter(Boolean).join(', ')),
      ...(selected ? [accessibilityAddTraits(['isSelected'])] : []),
    ]}>
      <HStack spacing={12} modifiers={[frame({ minHeight: 44 }), padding({ horizontal: 12, vertical: 8 })]}>
        <VStack alignment="leading" spacing={4}>
          <Text modifiers={[font({ textStyle: 'subheadline', family: fontFamily, weight: fontFamily ? 'regular' : 'semibold' }), foregroundStyle('#FFFFFF')]}>{titulo}</Text>
          {detalle ? <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle('#B3B3B3')]}>{detalle}</Text> : null}
        </VStack>
        <Spacer />
        {busy ? <ProgressView modifiers={[tint('#FFFFFF')]} /> : selected ? <Image systemName="checkmark" /> : null}
        {valor ? <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle('#B3B3B3')]}>{valor}</Text> : null}
      </HStack>
    </Button>
  </Host>
}
