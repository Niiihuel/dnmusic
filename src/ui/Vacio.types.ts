import type { ReactNode } from 'react'

export type VacioProps = {
  icono: ReactNode
  titulo: string
  detalle?: string
  /** Un solo próximo paso, como pide la HIG. Se dibuja como píldora del acento. */
  accion?: { rotulo: string; onPress: () => void }
  /** Para paneles chicos —desplegables, pies de lista—: menos aire, mismo lenguaje. */
  compacto?: boolean
}
