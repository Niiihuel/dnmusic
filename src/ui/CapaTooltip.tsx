import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'

export function CapaTooltip({ children }: { children: ReactNode }) {
  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>{children}</View>
}
