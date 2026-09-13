import { useEstadoCopia } from '../state/copia'
import { ActionSwap } from './ActionSwap'
import { IconCheck } from './icons'
import { useState, type CSSProperties } from 'react'
import type { ExpandableButtonProps } from './ExpandableButton.types'

/** La etiqueta conserva su ancho intrínseco: ni mediciones por frame ni texto escalado. */
export function ExpandableButton({ icon, label, accessibilityLabel, disabled = false, busy = false,
  selected, size = 44, onPress, expanded, copyText, defaultExpanded = false, onExpandedChange,
}: ExpandableButtonProps) {
  const [localExpanded, setLocalExpanded] = useState(defaultExpanded)
  const copyState = useEstadoCopia(copyText)
  const copyLabel = copyState === 'copied' ? 'Copiado' : copyState === 'pending' ? 'Copiando…' : copyState === 'error' ? 'Reintentar copia' : label
  const isExpanded = (expanded ?? localExpanded) || copyState !== 'idle'
  return (
    <button
      type="button"
      className="dn-expandable"
      data-dn-glass="regular"
      data-dn-hover="none"
      data-expanded={isExpanded}
      data-reveal-on-hover={Boolean(onPress)}
      aria-label={accessibilityLabel ?? copyLabel}
      aria-expanded={onPress ? undefined : isExpanded}
      aria-pressed={selected}
      aria-busy={busy}
      disabled={disabled || copyState === 'pending'}
      style={{ '--dn-control-size': `${size}px` } as CSSProperties}
      onClick={() => {
        if (onPress) { onPress(); return }
        const next = !isExpanded
        if (expanded === undefined) setLocalExpanded(next)
        onExpandedChange?.(next)
      }}
      onKeyDown={event => {
        if (event.key !== 'Escape' || !isExpanded || onPress) return
        event.stopPropagation()
        if (expanded === undefined) setLocalExpanded(false)
        onExpandedChange?.(false)
      }}
    >
      <span className="dn-expandable-icon" aria-hidden="true">{copyText === undefined ? icon : <ActionSwap value={copyState}>{copyState === 'copied' ? <IconCheck size={17} color="#FFFFFF" /> : icon}</ActionSwap>}</span>
      <span className="dn-expandable-label" aria-hidden="true"><span>{copyText === undefined ? label : <ActionSwap value={copyState}>{copyLabel}</ActionSwap>}</span></span>
    </button>
  )
}
