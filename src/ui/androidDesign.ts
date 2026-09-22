import type { ViewStyle } from 'react-native'
import design from './android-design.json'

/** Tokens equivalentes a var(--text), var(--muted), var(--strong), var(--track). */
export const ANDROID_COLORS = design.colors
export const ANDROID_TYPE = design.type as Record<keyof typeof design.type, {
  fontSize: number; lineHeight: number; letterSpacing: number; fontFamily: string; fontWeight: '400' | '600'
}>
export const ANDROID_RADIUS = design.radius
export const ANDROID_CONTROL = design.control

/** Dos sombras exteriores: profundidad sin bordes alrededor de las tarjetas. */
export const ANDROID_CARD: ViewStyle = {
  backgroundColor: ANDROID_COLORS.surface,
  borderRadius: ANDROID_RADIUS.card,
  boxShadow: '0 2px 4px rgba(0,0,0,0.24), 0 8px 18px rgba(0,0,0,0.18)',
}

/** El marco del control es luz interior; no un relleno blanco plano. */
export const androidButtonSurface = (selected = false): ViewStyle => ({
  backgroundColor: ANDROID_COLORS.surface,
  borderRadius: 999,
  boxShadow: `0 3px 8px rgba(0,0,0,0.28), inset 0 1px 1px rgba(255,255,255,0.12), inset 0 0 0 1px rgba(255,255,255,${selected ? '0.42' : '0.10'})`,
})
