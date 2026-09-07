import { Platform } from 'react-native'

/** Sólo RN web serializa dataSet; los controles nativos no reciben props DOM. */
export function estadoControlWeb(modo: 'none' | 'inverse') {
  return Platform.OS === 'web' ? { dataSet: { dnHover: modo } } : {}
}
