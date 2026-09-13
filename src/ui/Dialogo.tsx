import type { ReactNode } from 'react'
import { Modal, Platform, useWindowDimensions, type ModalProps } from 'react-native'
import { ModalEscritorio } from './ModalEscritorio'

/** Conserva la presentación móvil y comparte el marco de escritorio con Hoja. */
export function Dialogo({ contenidoPC, ancho, titulo, ...props }: Omit<ModalProps, 'onRequestClose'> & {
  onRequestClose?: () => void
  contenidoPC: ReactNode
  ancho?: number
  titulo: string
}) {
  const { width } = useWindowDimensions()
  if (Platform.OS === 'web' && width >= 780) return <ModalEscritorio visible={props.visible ?? true}
    titulo={titulo} ancho={ancho} onCerrar={props.onRequestClose}>{contenidoPC}</ModalEscritorio>
  return <Modal {...props} />
}
