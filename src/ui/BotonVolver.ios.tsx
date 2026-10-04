import type { ReactNode } from 'react'
import { IconButton } from './IconButton'

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
  return <IconButton label={label} symbol="chevron.left" onPress={onPress}
    disabled={disabled} variant="glass" size={18} />
}
