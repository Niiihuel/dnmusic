import { forwardRef } from 'react'
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react'
import type { ActionSwapProps } from './ActionSwap'
import { SPRING_SWAP } from './motion.web'

const Slot = forwardRef<HTMLSpanElement, Pick<ActionSwapProps, 'children'> & { reduce: boolean }>(function Slot({ children, reduce }, ref) {
  const present = useIsPresent()
  return <motion.span ref={ref} className="dn-action-value" aria-hidden={!present}
    initial={{ opacity: 0, y: reduce ? 0 : 8, filter: reduce ? 'none' : 'blur(3px)' }}
    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
    exit={{ opacity: 0, y: reduce ? 0 : -8, filter: reduce ? 'none' : 'blur(3px)' }}
    transition={reduce ? { duration: 0 } : SPRING_SWAP}>
    {children}
  </motion.span>
})

/** El texto saliente es sólo decorativo; el lector anuncia el estado actual. */
export function ActionSwap({ value, children, reserve }: ActionSwapProps) {
  const reduce = useReducedMotion()
  return <span className="dn-action-swap">
    {reserve ? <span aria-hidden="true" className="dn-action-reserve">{reserve}</span> : null}
    <AnimatePresence initial={false} mode="popLayout">
      <Slot key={value} reduce={Boolean(reduce)}>{children}</Slot>
    </AnimatePresence>
  </span>
}
