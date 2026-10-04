import { useLayoutEffect, useRef, useState } from 'react'
import { Modal } from 'react-native'
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react'
import type { ModalEscritorioProps } from './ModalEscritorio.types'
import { ModalContext } from './ModalContext'
import { SPRING_PANEL, EASE_OUT } from './motion.web'

/** Una sola geometría para los diálogos de PC. RN conserva foco, Escape y pila. */
export function ModalEscritorio(props: ModalEscritorioProps) {
  const [saliendo, setSaliendo] = useState(props.visible)
  if (props.visible && !saliendo) setSaliendo(true)
  return <Modal visible={props.visible || saliendo} transparent animationType="none"
    accessibilityLabel={props.titulo ?? 'Diálogo'} onRequestClose={props.visible ? props.onCerrar : undefined}>
    <AnimatePresence onExitComplete={() => setSaliendo(false)}>
      {props.visible ? <Panel key="panel" {...props} /> : null}
    </AnimatePresence>
  </Modal>
}

function Panel({ children, titulo, onCerrar, ancho = 440, alto, vista }: ModalEscritorioProps) {
  const reduce = useReducedMotion()
  const presente = useIsPresent()
  const contenido = useRef<HTMLDivElement>(null)
  const [altura, setAltura] = useState<number>()
  useLayoutEffect(() => {
    const node = contenido.current
    if (!node || alto !== undefined) return
    // Se mide el contenido natural, nunca el panel que está animando su altura.
    // Las listas flexibles conservan su límite de viewport en el contenedor interior.
    const medir = () => setAltura(node.offsetHeight)
    medir()
    const observer = new ResizeObserver(medir)
    observer.observe(node)
    return () => observer.disconnect()
  }, [alto])

  return <ModalContext.Provider value={true}>
    <motion.div className="dn-modal-stage" inert={!presente} data-dn-modal-stage=""
      initial="oculto" animate="visible" exit="salida">
      <motion.div className="dn-modal-scrim" aria-hidden="true"
        variants={{ oculto: { opacity: 0 }, visible: { opacity: 1 }, salida: { opacity: 0 } }}
        transition={{ duration: reduce ? 0 : .2 }} onPointerDown={onCerrar} />
      <motion.div className="dn-modal-panel" data-dn-modal="" data-title={titulo}
        style={{ width: ancho }} tabIndex={-1}
        variants={{ oculto: { opacity: 0, y: reduce ? 0 : 20, scale: reduce ? 1 : .97 },
          visible: { opacity: 1, y: 0, scale: 1 }, salida: { opacity: 0, y: reduce ? 0 : 20, scale: reduce ? 1 : .98, transition: { duration: reduce ? 0 : .18, ease: EASE_OUT } } }}
        transition={reduce ? { duration: 0 } : { ...SPRING_PANEL, opacity: { duration: .18 } }}>
        <motion.div className="dn-modal-size" initial={false}
          animate={{ height: alto ?? altura ?? 'auto' }} transition={reduce ? { duration: 0 } : SPRING_PANEL}>
          <div ref={contenido} className="dn-modal-content" style={alto !== undefined ? { height: alto } : undefined}>
            <AnimatePresence initial={false} mode="popLayout">
              <motion.div key={vista ?? 'contenido'} className="dn-modal-view"
                initial={{ opacity: 0, y: reduce ? 0 : 8, filter: reduce ? 'none' : 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, filter: 'none' }}
                exit={{ opacity: 0, y: reduce ? 0 : -8, filter: reduce ? 'none' : 'blur(4px)' }}
                transition={{ duration: reduce ? 0 : .24, ease: EASE_OUT }}>
                <Vista>{children}</Vista>
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  </ModalContext.Provider>
}

/** El contenido que sale deja de recibir foco/clics inmediatamente. */
function Vista({ children }: { children: ModalEscritorioProps['children'] }) {
  const presente = useIsPresent()
  return <div className="dn-modal-view-inner" inert={!presente}>{children}</div>
}
