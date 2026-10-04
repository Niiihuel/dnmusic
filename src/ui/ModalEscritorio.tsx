import { Modal } from 'react-native'
import type { ModalEscritorioProps } from './ModalEscritorio.types'

/** Sólo se elige en una ventana web ancha; fallback para resolución nativa. */
export function ModalEscritorio({ visible, onCerrar, titulo, children }: ModalEscritorioProps) {
  return <Modal visible={visible} onRequestClose={onCerrar} accessibilityLabel={titulo}>{children}</Modal>
}
