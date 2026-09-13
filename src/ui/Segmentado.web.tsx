import { useId } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import type { SegmentadoProps } from './Segmentado.types'
import { SPRING_LAYOUT } from './motion.web'
import { SharedLayoutBg } from './SharedLayoutBg'

export function Segmentado<T extends string>({ value, options, onChange, label }: SegmentadoProps<T>) {
  const id = useId()
  const reduce = useReducedMotion()
  return <SharedLayoutBg className="dn-segmented">
    <div role="radiogroup" aria-label={label} className="dn-segmented-options">
      {options.map((option, index) => {
        const checked = option.value === value
        return <button key={option.value} type="button" role="radio" aria-checked={checked}
          tabIndex={checked || !options.some(o => o.value === value) && index === 0 ? 0 : -1}
          data-dn-shared-item="" data-dn-hover="none" className="dn-segment"
          onClick={() => onChange(option.value)} onKeyDown={event => {
            let next = index
            if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % options.length
            else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + options.length - 1) % options.length
            else if (event.key === 'Home') next = 0
            else if (event.key === 'End') next = options.length - 1
            else return
            event.preventDefault()
            onChange(options[next].value)
            const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
            buttons?.[next]?.focus()
          }}>
          {checked ? <motion.span className="dn-segment-selected" layoutId={`segment-${id}`} transition={reduce ? { duration: 0 } : SPRING_LAYOUT} /> : null}
          <span className="dn-segment-label">{option.label}</span>
        </button>
      })}
    </div>
  </SharedLayoutBg>
}
