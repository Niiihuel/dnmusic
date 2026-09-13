import { Platform, type ViewProps } from 'react-native'
import { requireNativeView, requireOptionalNativeModule } from 'expo'

/**
 * Una fila del menú, en el idioma de UIKit.
 *
 * Es la misma forma que ya usa `collection-controls` para la pulsación larga:
 * los dos disparadores arman el mismo `UIMenu`, así que comparten el traductor
 * de `MenuContextualColeccion` y no hay dos maneras de describir un menú.
 */
export type EntradaMenuNativo = {
  id?: string
  label: string
  symbol?: string
  subtitle?: string
  disabled?: boolean
  destructive?: boolean
  selected?: boolean
  children?: EntradaMenuNativo[]
  /** Un grupo sin título: es como UIKit dibuja el corte entre grupos. */
  inline?: boolean
  /** La fila de acciones rápidas: iconos chicos, en horizontal. */
  small?: boolean
}

type Props = ViewProps & {
  items: EntradaMenuNativo[]
  menuLabel: string
  /** El disparador, cuando no lo dibuja RN: un SF Symbol puesto por el sistema. */
  symbol?: string
  symbolSize?: number
  symbolColor?: string
  disabled?: boolean
  onOpen: () => void
  onSelect: (event: { nativeEvent: { id: string } }) => void
}

// Los clientes anteriores y Expo Go no traen este módulo local: el menú de
// SwiftUI sigue siendo el respaldo, y web y Android tienen el suyo propio.
const disponible = Platform.OS === 'ios' && requireOptionalNativeModule('NativeMenu') !== null

/** La lámina que presenta el `UIMenu` al tocar. `null` si el binario no la trae. */
export const BotonMenuNativo = disponible
  ? requireNativeView<Props>('NativeMenu', 'NativeMenuButtonView')
  : null
