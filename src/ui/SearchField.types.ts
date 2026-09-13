import type { RefObject } from 'react'

/** El foco es el contrato compartido entre TextInput y SwiftUI.TextField. */
export type SearchFieldHandle = { focus: () => void; blur: () => void }

export type SearchFieldProps = {
  value: string
  onChangeText: (v: string) => void
  placeholder?: string
  /** Compacto para barras laterales con mouse; conserva 44px si el puntero es táctil. */
  density?: 'regular' | 'compact'
  accessibilityLabel?: string
  onSubmit?: () => void
  autoFocus?: boolean
  loading?: boolean
  /**
   * Para que otra pantalla pueda mandar el cursor acá.
   *
   * Lo usa la lista vacía: en vez de tener su propio buscador adentro, apunta
   * al de arriba, que es el único de la app.
   */
  inputRef?: RefObject<SearchFieldHandle | null>
  /** Avisa cuándo tiene el cursor: lo mira quien dibuja el «cancelar». */
  onFocusChange?: (focused: boolean) => void
}

