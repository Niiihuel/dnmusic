import { useState } from 'react'
import { Platform, StyleSheet, View, type ViewProps } from 'react-native'
import { NativeRowHighlight } from '../../modules/media-controls'

/** One surface, separate actions. Highlighting never turns a menu tap into play. */
export function RowSurface({ children, style, ...props }: ViewProps) {
  const [pressed, setPressed] = useState(false)
  return <View {...props} collapsable={false} style={style}
    onTouchStart={event => { if (!NativeRowHighlight) setPressed(true); props.onTouchStart?.(event) }}
    onTouchMove={event => { if (!NativeRowHighlight) setPressed(false); props.onTouchMove?.(event) }}
    onTouchEnd={event => { if (!NativeRowHighlight) setPressed(false); props.onTouchEnd?.(event) }}
    onTouchCancel={event => { if (!NativeRowHighlight) setPressed(false); props.onTouchCancel?.(event) }}>
    {NativeRowHighlight ? <NativeRowHighlight pointerEvents="none" style={StyleSheet.absoluteFill} />
      : Platform.OS !== 'web' && pressed ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)' }]} /> : null}
    {children}
  </View>
}
