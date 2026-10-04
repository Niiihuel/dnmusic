export type FilaSocialProps = {
  copyText?: string
  titulo: string
  detalle?: string
  fontFamily?: string
  /** Tamaño base de la muestra, escalado con Dynamic Type en iOS. */
  fontSize?: number
  valor?: string
  label?: string
  selected?: boolean
  busy?: boolean
  disabled?: boolean
  onPress: () => void
}
