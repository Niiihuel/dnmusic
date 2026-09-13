export type InterruptorProps = {
  activo: boolean
  onCambiar: (activo: boolean) => void
  /** La escala de Ajustes del Sistema en escritorio; el teléfono va táctil. */
  compacto?: boolean
  /** Impide el cambio y deja que cada plataforma aplique su estado atenuado. */
  disabled?: boolean
  /** Lo que el interruptor enciende, para el lector de pantalla. */
  rotulo: string
}
