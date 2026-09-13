import { Children, isValidElement, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, View, type GestureResponderEvent, type PressableProps } from 'react-native'
import { NativeSurface, type NativeSurfaceEvent } from '../../modules/media-controls'

function textoVisible(node: ReactNode): string {
  return Children.toArray(node).map(child => typeof child === 'string' || typeof child === 'number' ? String(child)
    : isValidElement<{ children?: ReactNode }>(child) ? textoVisible(child.props.children) : '').filter(Boolean).join(', ')
}
const responderEvent = (event: NativeSurfaceEvent) => event as unknown as GestureResponderEvent

/**
 * La vista de contenido mantiene exactamente su geometría. El UIButton de Swift
 * recibe toque, foco, pulsación larga y VoiceOver sin hospedar ni medir hijos RN.
 * Usar en superficies sin controles interactivos anidados.
 */
export function BotonSuperficie(props: PressableProps) {
  const [pressed, setPressed] = useState(false)
  if (!NativeSurface) return <Pressable {...props} />
  const { children, style, onPress, onLongPress, onPressIn, onPressOut, accessibilityLabel, accessibilityHint,
    accessibilityState, accessibilityRole, accessibilityValue, disabled = false, delayLongPress = 500,
    hitSlop: _hitSlop, ...rest } = props
  const content = typeof children === 'function' ? children({ pressed, hovered: false }) : children
  const bloqueado = disabled || !!accessibilityState?.disabled
  const checked = accessibilityState?.checked
  const selected = !!accessibilityState?.selected || checked === true
  const value = [accessibilityValue?.text, accessibilityState?.busy ? 'En curso' : null,
    checked === true ? 'Seleccionado' : checked === false ? 'No seleccionado' : checked === 'mixed' ? 'Selección parcial' : null].filter(Boolean).join(', ')
  return <View {...rest} accessible={false} collapsable={false}
    style={[typeof style === 'function' ? style({ pressed, hovered: false }) : style, { minHeight: 44, minWidth: 44 }]}>
    <View collapsable={false} style={{ display: 'contents' }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{content}</View>
    <NativeSurface style={StyleSheet.absoluteFill} label={accessibilityLabel ?? textoVisible(content)} hint={accessibilityHint}
      controlRole={String(accessibilityRole ?? 'button')} value={value} disabled={bloqueado} selected={selected}
      longPress={!!onLongPress} longPressDelay={delayLongPress ?? 500}
      onActivate={event => { if (!bloqueado) onPress?.(responderEvent(event)) }}
      onLongActivate={event => { if (!bloqueado) onLongPress?.(responderEvent(event)) }}
      onHighlight={event => {
        const next = !!event.nativeEvent.pressed
        if (typeof children === 'function' || typeof style === 'function') setPressed(next)
        if (next) onPressIn?.(responderEvent(event)); else onPressOut?.(responderEvent(event))
      }} />
  </View>
}
