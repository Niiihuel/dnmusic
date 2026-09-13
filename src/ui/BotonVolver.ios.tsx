import type { ReactNode } from 'react'
import { Button, Host } from '@expo/ui/swift-ui'
import {
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  disabled as deshabilitado,
  frame,
} from '@expo/ui/swift-ui/modifiers'

/**
 * El botón de navegación de iOS lo dibuja SwiftUI.
 *
 * No imita el material ni el área táctil: `Button` aporta la interacción,
 * VoiceOver, Reduce Motion y el estilo de vidrio de la versión instalada del
 * sistema. `expo-router` sigue siendo dueño de la pila y recibe solamente el
 * callback del botón.
 */
export function BotonVolver({
  onPress,
  label = 'Volver',
  disabled = false,
  icono,
}: {
  onPress: () => void
  label?: string
  disabled?: boolean
  icono?: ReactNode
}) {
  /* Un icono React Native no puede vivir dentro de una etiqueta SwiftUI sin
     volver a introducir RNHostView. La navegación iOS usa siempre el SF Symbol
     del sistema; `icono` se conserva en el contrato para las otras plataformas. */
  void icono
  return (
    <Host matchContents colorScheme="dark" seedColor="#FFFFFF">
      <Button
        label={label}
        systemImage="chevron.left"
        onPress={onPress}
        modifiers={[
          accessibilityLabel(label),
          frame({ width: 44, height: 44 }),
          buttonBorderShape('circle'),
          buttonStyle('glass'),
          deshabilitado(disabled),
        ]}
      />
    </Host>
  )
}
