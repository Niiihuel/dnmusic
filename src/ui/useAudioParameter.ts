import { useRef, useState } from 'react'
import type { AudioParameterProps } from './AudioParameter.types'
import { parameterValue } from './audioParameterValue'

export function useAudioParameter(props: AudioParameterProps) {
  const [preview, setPreview] = useState<number | null>(null)
  const pending = useRef<number | null>(null)
  // Measured cue points need not fall on the manual editing grid. Reading a
  // saved value must not silently snap its readout or move its thumb.
  const value = preview ?? (Number.isFinite(props.value)
    ? Math.max(props.min, Math.min(props.max, props.value)) : props.min)
  const disabled = !!props.disabled || props.max <= props.min
  const commit = (next: number) => {
    if (disabled || !Number.isFinite(next)) return
    const normalized = parameterValue(next, props)
    if (normalized !== props.value) props.onChange(normalized)
    props.onCommit?.(normalized)
    pending.current = null
    setPreview(null)
  }
  const change = (next: number) => {
    if (disabled || !Number.isFinite(next)) return
    const normalized = parameterValue(next, props)
    pending.current = normalized
    setPreview(normalized)
    if (!props.commitOnly && normalized !== props.value) props.onChange(normalized)
  }
  const finish = () => {
    if (disabled) { pending.current = null; setPreview(null); return }
    const next = pending.current
    if (next !== null) {
      if (props.commitOnly) commit(next)
      else { props.onCommit?.(next); pending.current = null; setPreview(null) }
    }
  }
  const cancel = () => { pending.current = null; setPreview(null) }
  return { value, disabled, change, commit, finish, cancel }
}
