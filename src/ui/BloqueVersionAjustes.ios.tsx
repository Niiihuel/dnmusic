import type { ReactNode } from 'react'
import { View } from 'react-native'
import { RNHostView, VStack } from '@expo/ui/swift-ui'
import { listRowBackground, listRowInsets, listRowSeparator } from '@expo/ui/swift-ui/modifiers'

/** La tarjeta es una fila auto-medida dentro de List; SwiftUI mantiene su scroll y cabecera. */
export function BloqueVersionAjustes({ children }: { children: ReactNode }) {
  return <VStack modifiers={[listRowBackground('clear'), listRowSeparator('hidden'), listRowInsets({ top: 8, bottom: 16, leading: 0, trailing: 0 })]}>
    <RNHostView matchContents><View collapsable={false} style={{ width: '100%' }}>{children}</View></RNHostView>
  </VStack>
}
