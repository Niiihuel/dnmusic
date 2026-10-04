import { Platform, type ViewStyle } from 'react-native'
import { requireNativeView } from 'expo'

type Props = {
  /** Con la salida en el teléfono. */
  color?: string
  /** Sonando por fuera: AirPods, un Apple TV, el auto. */
  activeColor?: string
  style?: ViewStyle
}

/**
 * La vista del sistema, si el binario la trae.
 *
 * Se resuelve dentro de un `try` por el mismo motivo que
 * `remote-commands` usa `requireOptionalNativeModule`: en web no existe, y en
 * cualquier development client compilado antes que este módulo tampoco. La
 * diferencia es que para vistas no hay una versión «optional», así que el
 * fallback se escribe a mano.
 */
function cargar() {
  if (Platform.OS !== 'ios') return null
  try {
    return requireNativeView<Props>('AudioRoute', 'RoutePickerView')
  } catch {
    return null
  }
}

const Nativo = cargar()

/** Si se puede dibujar el botón. Sin esto, no hay nada que mostrar. */
export const haySelectorDeSalida = Nativo !== null

/**
 * El botón de AirPlay.
 *
 * Sin el módulo devuelve `null` en vez de un hueco: quien lo use tiene que
 * preguntar por `haySelectorDeSalida` y no dibujar el redondel alrededor, o
 * quedaría un círculo vacío que no hace nada.
 */
export function SelectorDeSalida(props: Props) {
  if (!Nativo) return null
  return <Nativo {...props} />
}

function cargarVolumen() {
  if (Platform.OS !== 'ios') return null
  try {
    return requireNativeView<{ style?: ViewStyle }>('AudioRoute', 'SystemVolumeView')
  } catch {
    return null
  }
}

const VolumenNativo = cargarVolumen()
export const hayVolumenDelSistema = VolumenNativo !== null

export function VolumenDelSistema({ style }: { style?: ViewStyle }) {
  return VolumenNativo ? <VolumenNativo style={style} /> : null
}
