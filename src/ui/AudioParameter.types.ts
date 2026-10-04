export type AudioParameterProps = {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (value: number) => string
  onChange: (value: number) => void
  onCommit?: (value: number) => void
  disabled?: boolean
  /** Preview a drag locally, then change the engine once when it finishes. */
  commitOnly?: boolean
  resetValue?: number
  scale?: 'linear' | 'log'
  /** Milliseconds can be entered as seconds while callbacks keep milliseconds. */
  inputScale?: number
  unit?: string
  /** A labelled slider only, for constrained player bars. */
  compact?: boolean
}
