import { Platform, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button, ConfirmationDialog, Host, HStack, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui'
import { accessibilityLabel, background, buttonStyle, clipShape, controlSize, disabled, font, foregroundStyle, glassEffect, padding } from '@expo/ui/swift-ui/modifiers'
import type { BarraCambiosPerfilProps } from './BarraCambiosPerfil'

/** Barra contextual con controles SwiftUI; permanece hasta guardar o descartar. */
export function BarraCambiosPerfil({ visible, ocupado = false, error, puedeGuardar = true,
  onRestablecer, onGuardar, abajo, onAltura, flotante = true }: BarraCambiosPerfilProps) {
  const insets = useSafeAreaInsets()
  if (!visible && !ocupado && !error) return null
  const puedeConfirmar = visible && !ocupado && puedeGuardar
  const vidrio = Number.parseInt(String(Platform.Version), 10) >= 26
  return <View pointerEvents="box-none" style={flotante
    ? { position: 'absolute', left: 16, right: 16, bottom: abajo ?? Math.max(12, insets.bottom), zIndex: 30 }
    : { width: '100%' }}>
    <Host ignoreSafeArea="all" matchContents={{ vertical: true }} colorScheme="dark" seedColor="#FFFFFF"
      style={{ width: '100%' }} onLayoutContent={e => onAltura?.(e.nativeEvent.height)}>
      <VStack spacing={8} modifiers={[padding({ all: 12 }), ...(vidrio
        ? [glassEffect({ glass: { variant: 'regular' }, shape: 'roundedRectangle', cornerRadius: 24 })]
        : [background('#242426'), clipShape('roundedRectangle', 24)])]}>
        <HStack spacing={8}>
          {ocupado ? <ProgressView /> : null}
          <Text modifiers={[font({ textStyle: 'subheadline', weight: 'semibold' }), foregroundStyle('#FFFFFF')]}>{ocupado ? 'Guardando cambios…' : 'Cambios sin guardar'}</Text>
          <Spacer />
        </HStack>
        {error ? <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle('#FF6961')]}>{error}</Text> : null}
        <HStack spacing={12}>
          <ConfirmationDialog title="¿Restablecer los cambios?" titleVisibility="visible">
            <ConfirmationDialog.Trigger>
              <Button label="Restablecer" systemImage="arrow.counterclockwise" modifiers={[disabled(ocupado), buttonStyle('borderless')]} />
            </ConfirmationDialog.Trigger>
            <ConfirmationDialog.Message><Text>Se recuperará la última versión guardada de tu perfil.</Text></ConfirmationDialog.Message>
            <ConfirmationDialog.Actions>
              <Button label="Restablecer" role="destructive" onPress={ocupado ? undefined : onRestablecer} modifiers={[disabled(ocupado)]} />
              <Button label="Cancelar" role="cancel" />
            </ConfirmationDialog.Actions>
          </ConfirmationDialog>
          <Spacer />
          <Button label="Guardar" onPress={puedeConfirmar ? onGuardar : undefined} modifiers={[disabled(!puedeConfirmar),
            accessibilityLabel('Guardar cambios del perfil'), buttonStyle(vidrio ? 'glassProminent' : 'borderedProminent'), controlSize('regular')]} />
        </HStack>
      </VStack>
    </Host>
  </View>
}
