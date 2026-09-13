import type { ReactNode } from 'react'
import type { SFSymbol } from 'sf-symbols-typescript'

export type IconButtonProps = {
  label: string
  symbol: SFSymbol
  onPress: () => void
  /** Ícono para web/Android. iOS dibuja el SF Symbol. */
  icon?: ReactNode
  disabled?: boolean
  busy?: boolean
  /** Por defecto permite pausar/cancelar mientras se prepara audio. */
  disableWhileBusy?: boolean
  selected?: boolean
  size?: number
  lado?: number
  variant?: 'plain' | 'glass' | 'primary'
  muted?: boolean
}
