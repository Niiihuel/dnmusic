import { Platform } from 'react-native'

/** Sólo RN web serializa dataSet; los controles nativos no reciben props DOM. */
export function estadoControlWeb(modo: 'normal' | 'none' | 'inverse' | 'glass' | 'row' | 'surface') {
  return Platform.OS === 'web' ? { dataSet: { dnHover: modo } } : {}
}

/** Material de contenido: una fila completa o solo la imagen de una tarjeta. */
export function superficieInteractivaWeb(tipo: 'row' | 'card') {
  return Platform.OS === 'web' ? { dataSet: { dnSurface: tipo, dnHover: 'none' } } : {}
}
export const artworkInteractivoWeb = () => Platform.OS === 'web' ? { dataSet: { dnArtwork: '' } } : {}
