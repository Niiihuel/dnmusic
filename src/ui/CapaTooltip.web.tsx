import type { ReactNode } from 'react'

// React DOM se mantiene fuera de los paquetes nativos.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPortal } = require('react-dom') as {
  createPortal: (children: ReactNode, container: Element) => ReactNode
}

/** Fuera del árbol de la app: los Modal de RN web también viven en document.body.
 * No toma foco ni intercepta clics fuera del rótulo. */
export function CapaTooltip({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null
  return createPortal(<div data-dn-tooltip-layer="" style={{ position: 'fixed', inset: 0, zIndex: 10001, pointerEvents: 'none' }}>
    {children}
  </div>, document.body)
}
