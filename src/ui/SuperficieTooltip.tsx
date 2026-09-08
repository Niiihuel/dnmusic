import type { ReactNode } from 'react'
import type { ViewStyle } from 'react-native'
import { Glass } from './Glass'

/** Una única superficie para rótulos y referencias compactas sobre contenido. */
export function SuperficieTooltip({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <Glass radius={12} style={{ backgroundColor: 'rgba(28,28,28,0.82)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.28)', overflow: 'hidden', ...style }}>
    {children}
  </Glass>
}
