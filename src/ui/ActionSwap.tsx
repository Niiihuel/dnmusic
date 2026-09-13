import type { ReactNode } from 'react'
export type ActionSwapProps = { value: string; children: ReactNode; reserve?: ReactNode }
export function ActionSwap({ children }: ActionSwapProps) { return <>{children}</> }
