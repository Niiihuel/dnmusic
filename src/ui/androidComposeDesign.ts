import { background, clip, dropShadow, innerShadow, Shapes } from '@expo/ui/jetpack-compose/modifiers'
import { ANDROID_COLORS } from './androidDesign'

const shape = Shapes.RoundedCorner(999)
/** Relieve dentro de un Host Compose, con el mismo acabado que los controles RN. */
export const androidControlModifiers = (selected = false) => [
  dropShadow(shape, { radius: 8, offsetY: 3, color: '#000000', alpha: 0.28 }),
  clip(shape),
  background(ANDROID_COLORS.surface),
  innerShadow(shape, { radius: 1, offsetY: 1, color: '#FFFFFF', alpha: 0.12 }),
  innerShadow(shape, { radius: 0, spread: 1, color: '#FFFFFF', alpha: selected ? 0.42 : 0.1 }),
]
