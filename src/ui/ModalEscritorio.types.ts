import type { ReactNode } from 'react'

export type ModalEscritorioProps = {
  visible: boolean
  titulo?: string
  onCerrar?: () => void
  ancho?: number
  alto?: number
  vista?: string
  children: ReactNode
}
