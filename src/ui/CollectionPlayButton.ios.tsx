import { Button, Host, HStack, Image, Text } from '@expo/ui/swift-ui'
import { accessibilityLabel, buttonBorderShape, buttonStyle, disabled, font, foregroundStyle, frame, tint } from '@expo/ui/swift-ui/modifiers'
import type { CollectionPlayButtonProps } from './CollectionPlayButton'

/** Acción principal con etiqueta corta y un único marco de SwiftUI. */
export function CollectionPlayButton({ playing, disabled: inactive, onPress }: CollectionPlayButtonProps) {
  return <Host ignoreSafeArea="all" colorScheme="dark" style={{ flex: 1, minWidth: 110, height: 48 }}>
    <Button onPress={onPress} modifiers={[buttonStyle('borderedProminent'), buttonBorderShape('capsule'),
      tint('#FFFFFF'), disabled(inactive), frame({ maxWidth: Infinity, height: 48 }), accessibilityLabel(playing ? 'Pausar' : 'Reproducir la lista')]}>
      <HStack spacing={6} modifiers={[frame({ maxWidth: Infinity, minHeight: 26 })]}>
        <Image systemName={playing ? 'pause.fill' : 'play.fill'} size={14} color="#121212" />
        <Text modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle('#121212')]}>{playing ? 'Pausar' : 'Reproducir'}</Text>
      </HStack>
    </Button>
  </Host>
}
