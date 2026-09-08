import { useEffect, useRef, type ReactNode } from 'react'
import { Modal } from 'react-native'
import { TECLADO_FISICO } from '../lib/teclado'
import type { CapaAutoresProps } from './CapaAutores'

// Aislado en .web: React DOM nunca entra en el bundle nativo.
// El proyecto no incluye @types/react-dom; tipamos solamente esta API web.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPortal } = require('react-dom') as {
  createPortal: (children: ReactNode, container: Element) => ReactNode
}

/** Un tooltip interactivo no debe capturar el foco ni tapar su disparador. */
export function CapaAutores({ visible, onRequestClose, anchor, children }: CapaAutoresProps) {
  const capa = useRef<HTMLDivElement>(null)
  const cerrar = useRef(onRequestClose)
  useEffect(() => { cerrar.current = onRequestClose }, [onRequestClose])
  useEffect(() => {
    if (!visible || !TECLADO_FISICO) return
    const dentro = (target: EventTarget | null) => target instanceof Node && capa.current?.contains(target)
    const alPulsar = (e: PointerEvent) => {
      if (dentro(e.target)) return
      if (anchor && e.clientX >= anchor.x && e.clientX <= anchor.x + anchor.w &&
        e.clientY >= anchor.y && e.clientY <= anchor.y + anchor.h) return
      cerrar.current()
    }
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar.current() }
    const alDesplazar = (e: Event) => { if (!dentro(e.target)) cerrar.current() }
    document.addEventListener('pointerdown', alPulsar, true)
    document.addEventListener('keydown', alTeclear)
    document.addEventListener('scroll', alDesplazar, true)
    window.addEventListener('resize', alDesplazar)
    return () => {
      document.removeEventListener('pointerdown', alPulsar, true)
      document.removeEventListener('keydown', alTeclear)
      document.removeEventListener('scroll', alDesplazar, true)
      window.removeEventListener('resize', alDesplazar)
    }
  }, [visible, anchor])

  if (!TECLADO_FISICO) return <Modal transparent visible={visible} animationType="fade" onRequestClose={onRequestClose}>{children}</Modal>
  if (!visible || typeof document === 'undefined') return null
  return createPortal(<div ref={capa} style={{ position: 'fixed', inset: 0, zIndex: 10000, pointerEvents: 'none' }}>
    {children}
  </div>, document.body)
}
