import type { ReactNode } from 'react'

export type ExpandableButtonProps = {
  copyText?: string
  icon: ReactNode
  label: string
  accessibilityLabel?: string
  disabled?: boolean
  busy?: boolean
  selected?: boolean
  size?: number
  /** Sin onPress el clic alterna la expansión; con él ejecuta la acción. */
  onPress?: () => void
  expanded?: boolean
  defaultExpanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
}
