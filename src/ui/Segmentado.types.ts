export type OpcionSegmento<T extends string> = { value: T; label: string }

export type SegmentadoProps<T extends string> = {
  value: T
  options: OpcionSegmento<T>[]
  onChange: (value: T) => void
  /** Qué elige, para quien escucha. */
  label: string
}
