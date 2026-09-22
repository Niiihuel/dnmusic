import type { ReactNode } from 'react'

// React DOM se mantiene fuera de los paquetes nativos.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPortal } = require('react-dom') as {
  createPortal: (children: ReactNode, container: Element) => ReactNode
}

/** Escapa las capas de RN: los controles deben seguir encima de sus modales. */
export function CapaControlesVentana({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null
  return createPortal(children, document.body)
}
