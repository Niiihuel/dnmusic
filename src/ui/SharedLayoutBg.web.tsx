import { useEffect, useRef, useState, type CSSProperties, type PropsWithChildren } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { SPRING_LAYOUT } from './motion.web'

import { observeSharedHover, type HoverBox } from './sharedHover.web'
/** Un fondo por grupo, sin clonar filas ni sustituir sus eventos/acciones. */
export function SharedLayoutBg({ children, className = '', targets, style }: PropsWithChildren<{ className?: string; targets?: 'surfaces'; style?: CSSProperties }>) {
  const root = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<HoverBox | null>(null)
  const reduce = useReducedMotion()
  useEffect(() => {
    const node = root.current
    if (!node) return
    return observeSharedHover(node, setBox)
  }, [])
  return <div ref={root} data-dn-shared-group="" data-dn-shared-targets={targets} style={style} className={`dn-shared-group ${className}`}>
    <motion.div aria-hidden="true" className="dn-shared-bg" initial={false}
      animate={box ? { x: box.x, y: box.y, width: box.width, height: box.height, borderRadius: box.radius, opacity: 1, filter: 'blur(0px)' }
        : { opacity: 0, filter: reduce ? 'none' : 'blur(6px)' }}
      transition={reduce ? { duration: 0 } : { ...SPRING_LAYOUT, ...((box?.first || box?.immediate) ? { x: { duration: 0 }, y: { duration: 0 }, width: { duration: 0 }, height: { duration: 0 } } : {}), opacity: { duration: 0.18 }, filter: { duration: 0.18 } }} />
    {children}
  </div>
}
