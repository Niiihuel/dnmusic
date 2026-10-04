import type { ReactNode } from 'react'
import { View } from 'react-native'
export type MenuKeyboardScopeProps = { children: ReactNode; onClose: () => void; subMenu: number | null; onCloseSub: () => void }
export function MenuKeyboardScope({ children }: MenuKeyboardScopeProps) {
  return <View className="flex-1">{children}</View>
}
