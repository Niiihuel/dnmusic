import { StyleSheet } from 'react-native'
import { CollectionScrollEdge } from '../../modules/collection-controls'

export const HAY_BORDE_SCROLL_NATIVO = CollectionScrollEdge !== null

/** Place inside the floating toolbar, as a sibling of its controls. */
export function BordeScrollNativo() {
  return CollectionScrollEdge ? <CollectionScrollEdge pointerEvents="none" style={StyleSheet.absoluteFill} /> : null
}
