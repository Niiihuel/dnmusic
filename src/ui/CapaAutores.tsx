import type { ReactNode } from 'react'
import { Modal } from 'react-native'

export type CapaAutoresProps = {
  visible: boolean
  onRequestClose: () => void
  anchor: { x: number; y: number; w: number; h: number } | null
  children: ReactNode
}

export function CapaAutores({ visible, onRequestClose, children }: CapaAutoresProps) {
  return <Modal transparent visible={visible} animationType="fade" onRequestClose={onRequestClose}>{children}</Modal>
}
