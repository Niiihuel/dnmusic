import { useLayoutEffect, useRef } from 'react'
import type { SharedValue } from 'react-native-reanimated'
import { observeSeekInput } from './seekInput.web'
import { formatClock } from './tiempos'
export { formatClock, formatLength } from './tiempos'
let nextPositionListener = 800000

/** El navegador mueve la perilla; React recibe solo los valores confirmados. */
export function SeekBar({ label, progress, elapsedMs, totalMs, onSeek, compact = false, envivo = false, posicionMs }: {
  label: string
  progress: number
  elapsedMs: number
  totalMs: number
  onSeek: (fraction: number) => void
  compact?: boolean
  envivo?: boolean
  posicionMs?: SharedValue<number>
}) {
  const input = useRef<HTMLInputElement>(null)
  const clock = useRef<HTMLSpanElement>(null)
  const controller = useRef<ReturnType<typeof observeSeekInput> | null>(null)
  useLayoutEffect(() => {
    const state = {
      progress, envivo, onSeek,
      describe: (fraction: number) => totalMs > 0 ? `${formatClock(fraction * totalMs)} / ${formatClock(totalMs)}` : `${Math.round(fraction * 100)}%`,
      preview: (fraction: number | null) => {
        if (clock.current) clock.current.textContent = formatClock(fraction === null ? elapsedMs : fraction * totalMs)
      },
    }
    if (!controller.current && input.current) controller.current = observeSeekInput(input.current, state)
    else controller.current?.sync(state)
  }, [progress, elapsedMs, totalMs, envivo, onSeek])
  useLayoutEffect(() => () => { controller.current?.dispose(); controller.current = null }, [])
  useLayoutEffect(() => {
    if (!posicionMs || totalMs <= 0) return
    const id = nextPositionListener++
    posicionMs.addListener(id, value => controller.current?.follow(value / totalMs))
    return () => posicionMs.removeListener(id)
  }, [posicionMs, totalMs])
  return <div className="dn-seek">
    {compact ? null : <span ref={clock} className="dn-seek-time">{formatClock(elapsedMs)}</span>}
    <input ref={input} className="dn-seek-input" type="range" min={0} max={1} step={0.001}
      defaultValue={progress} aria-label={envivo ? label : `Posición de ${label}`} />
    {compact ? null : <span className="dn-seek-time">{formatClock(totalMs)}</span>}
  </div>
}
