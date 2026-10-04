import { useCallback, useLayoutEffect, useRef } from 'react'
import { observeSeekInput } from './seekInput.web'
import { formatClock } from './tiempos'
import type { ControlOndaProps } from './ControlOnda'

let listener = 910000

/** Onda controlada: previsualiza al arrastrar, confirma una vez y admite teclado. */
export function ControlOnda({ etiqueta, posicionMs, desdeMs, duracionMs, activa, onSeek, onPreview }: ControlOndaProps) {
  const input = useRef<HTMLInputElement>(null)
  const tooltip = useRef<HTMLSpanElement>(null)
  const line = useRef<HTMLSpanElement>(null)
  const controller = useRef<ReturnType<typeof observeSeekInput> | null>(null)
  const tiempo = useCallback(() => activa ? Math.max(0, Math.min(1, (posicionMs.value - desdeMs) / duracionMs)) : 0,
    [activa, posicionMs, desdeMs, duracionMs])
  const indicar = useCallback((fraccion: number | null) => {
    for (const nodo of [tooltip.current, line.current]) {
      if (!nodo) continue
      nodo.hidden = fraccion === null
      if (fraccion !== null) nodo.style.left = `${fraccion * 100}%`
    }
    if (tooltip.current && fraccion !== null) {
      tooltip.current.textContent = formatClock(fraccion * duracionMs)
      tooltip.current.style.left = `clamp(24px, ${fraccion * 100}%, calc(100% - 24px))`
    }
  }, [duracionMs])
  useLayoutEffect(() => {
    const state = { progress: tiempo(), envivo: false, onSeek, keyStep: 5000 / duracionMs,
      describe: (f: number) => `${formatClock(f * duracionMs)} / ${formatClock(duracionMs)}`,
      preview: (f: number | null) => { onPreview(f); indicar(f) },
    }
    if (!controller.current && input.current) controller.current = observeSeekInput(input.current, state)
    else controller.current?.sync(state)
    const id = listener++
    posicionMs.addListener(id, value => controller.current?.follow(activa ? (value - desdeMs) / duracionMs : 0))
    return () => posicionMs.removeListener(id)
  }, [posicionMs, desdeMs, duracionMs, activa, onSeek, onPreview, tiempo, indicar])
  useLayoutEffect(() => () => { controller.current?.dispose(); controller.current = null }, [])
  return <div className="dn-waveform-control">
    <span ref={line} hidden aria-hidden="true" className="dn-waveform-hover-line" />
    <span ref={tooltip} hidden aria-hidden="true" className="dn-waveform-hover-time" />
    <input ref={input} className="dn-waveform-input" type="range" min={0} max={1} step={0.001}
      defaultValue={0} aria-label={`Posición de ${etiqueta}`}
      onPointerMove={event => {
        if (event.buttons) return
        const caja = event.currentTarget.getBoundingClientRect()
        if (caja.width > 0) indicar(Math.max(0, Math.min(1, (event.clientX - caja.left) / caja.width)))
      }}
      onPointerLeave={() => indicar(null)} onBlur={() => indicar(null)} />
  </div>
}
