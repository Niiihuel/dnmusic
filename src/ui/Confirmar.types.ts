export type ConfirmarProps = {
  visible: boolean
  titulo: string
  mensaje: string
  /** Verbo explícito: Descartar, Sacar, Eliminar. */
  rotulo: string
  onCancelar: () => void
  onConfirmar: () => void
}
