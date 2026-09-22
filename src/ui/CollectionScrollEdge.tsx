import { StyleSheet } from 'react-native'
import { CollectionScrollEdge, HAY_ESTILO_SCROLL_NATIVO } from '../../modules/collection-controls'

export const HAY_BORDE_SCROLL_NATIVO = CollectionScrollEdge !== null

/** Place inside the floating toolbar, as a sibling of its controls. */
export function BordeScrollNativo({ nativeNavigation = false }: { nativeNavigation?: boolean }) {
  if (nativeNavigation && !HAY_ESTILO_SCROLL_NATIVO) return null
  return CollectionScrollEdge ? <CollectionScrollEdge pointerEvents="none" style={StyleSheet.absoluteFill}
    {...(nativeNavigation ? { nativeNavigation: true } : {})} /> : null
}
