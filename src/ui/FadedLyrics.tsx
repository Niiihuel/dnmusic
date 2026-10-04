import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { CollectionFade } from '../../modules/collection-controls'

export function FadedLyrics({ children }: { children: ReactNode }) {
  return <View collapsable={false} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
    {children}
    {CollectionFade ? <CollectionFade pointerEvents="none" style={StyleSheet.absoluteFill} /> : null}
  </View>
}
