import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { cerrarTooltip, retenerTooltip, soltarTooltip, useTooltip, type Tooltip as TooltipData } from '../state/tooltip'
import { CapaTooltip } from './CapaTooltip'
import { geometriaTooltip } from './tooltipGeometry'
import { SPRING_LAYOUT } from './motion.web'
export { useConTooltip } from './useConTooltip'
export { geometriaTooltip } from './tooltipGeometry'

export function Tooltip() {
  const tip = useTooltip()
  useEffect(() => {
    if (!tip) return
    const close = () => cerrarTooltip()
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', key)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('keydown', key); window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close); window.removeEventListener('blur', close)
    }
  }, [tip])
  return <CapaTooltip><AnimatePresence>{tip ? <Rotulo key="tooltip" tip={tip} /> : null}</AnimatePresence></CapaTooltip>
}
function Rotulo({ tip }: { tip: TooltipData }) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ width: number; height: number }>()
  const reduce = useReducedMotion()
  const id = `dn-tooltip-${tip.owner ?? 'global'}`
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const measure = () => setSize(old => old?.width === node.offsetWidth && old.height === node.offsetHeight ? old : { width: node.offsetWidth, height: node.offsetHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [tip.texto])
  useEffect(() => {
    const anchor = tip.anchor
    if (!anchor) return
    const before = anchor.getAttribute('aria-describedby')
    anchor.setAttribute('aria-describedby', [before, id].filter(Boolean).join(' '))
    return () => {
      if (before) anchor.setAttribute('aria-describedby', before)
      else anchor.removeAttribute('aria-describedby')
    }
  }, [tip.anchor, id])
  const g = geometriaTooltip(tip, window.innerWidth, window.innerHeight, size)
  const top = g.arriba ? Math.max(8, tip.y - (size?.height ?? 28) - 6) : tip.y + tip.h + 6
  return <motion.div ref={ref} id={id} role="tooltip" data-dn-glass="regular" data-dn-tooltip=""
    className="dn-tooltip" onPointerEnter={() => retenerTooltip()} onPointerLeave={() => soltarTooltip(tip.owner)}
    initial={{ opacity: 0, scale: reduce ? 1 : 0.92, left: g.left, top }}
    animate={{ opacity: 1, scale: 1, left: g.left, top }}
    exit={{ opacity: 0, scale: reduce ? 1 : 0.96, pointerEvents: 'none' }}
    transition={reduce ? { duration: 0 } : { ...SPRING_LAYOUT, opacity: { duration: 0.12 } }}
    style={{ transformOrigin: `${g.punta + 4}px ${g.arriba ? 'bottom' : 'top'}` }}>
    <AnimatePresence initial={false} mode="popLayout">
      <motion.span key={tip.texto} style={{ display: 'block' }}
        initial={{ opacity: 0, filter: reduce ? 'none' : 'blur(3px)' }}
        animate={{ opacity: 1, filter: 'blur(0px)' }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.12 }}>
        {tip.texto}
      </motion.span>
    </AnimatePresence>
    <span aria-hidden="true" data-dn-tooltip-pointer="" style={{ left: g.punta, ...(g.arriba ? { bottom: -3 } : { top: -3 }) }} />
  </motion.div>
}
