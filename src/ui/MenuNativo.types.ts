import type { ReactNode } from 'react'
import type { SFSymbol } from 'sf-symbols-typescript'
import type { MenuItem } from './Menu'

export type MenuNativoProps = {
  items: MenuItem[]
  label?: string
  size?: number
  symbol?: SFSymbol
  children?: ReactNode
  longPress?: boolean
  fullWidth?: boolean
  disabled?: boolean
}
