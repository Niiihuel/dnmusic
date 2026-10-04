/** Control DOM: el arrastre no necesita renders de React ni saltos de audio por cuadro. */
export type SeekInputState = {
  progress: number
  envivo: boolean
  onSeek: (fraction: number) => void
  describe: (fraction: number) => string
  preview: (fraction: number | null) => void
  /** Paso de teclado normalizado; posición usa cinco segundos, volumen 5 %. */
  keyStep?: number
}
const clamp = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0

export function observeSeekInput(input: HTMLInputElement, initial: SeekInputState) {
  let state = initial
  let dragging = false
  let dirty = false
  let frame = 0
  let pending: number | null = null
  let release: ReturnType<typeof setTimeout> | undefined
  let sent = clamp(initial.progress)
  const paint = (value: number, preview = false) => {
    const fraction = clamp(value)
    input.value = String(fraction)
    input.style.setProperty('--dn-seek-progress', `${fraction * 100}%`)
    input.setAttribute('aria-valuetext', state.describe(fraction))
    state.preview(preview ? fraction : null)
  }
  const emit = () => {
    const value = Number(input.value)
    if (value !== sent) { sent = value; state.onSeek(value) }
  }
  const stopFrame = () => { if (frame) cancelAnimationFrame(frame); frame = 0 }
  const settle = () => {
    dragging = false
    if (!dirty) return
    dirty = false
    stopFrame()
    pending = Number(input.value)
    clearTimeout(release)
    release = setTimeout(() => { pending = null; paint(state.progress) }, 1000)
    emit()
  }
  const start = () => { dragging = true }
  const change = () => {
    dirty = true
    paint(Number(input.value), true)
    if (state.envivo && !frame) frame = requestAnimationFrame(() => { frame = 0; emit() })
  }
  const cancel = () => {
    dragging = false; dirty = false; pending = null
    stopFrame(); clearTimeout(release)
    paint(state.progress)
  }
  const key = (event: KeyboardEvent) => {
    const current = Number(input.value)
    const step = (state.keyStep ?? 0.05) * (event.shiftKey ? 10 : 1)
    const value = event.key === 'Home' ? 0 : event.key === 'End' ? 1
      : ['ArrowRight', 'ArrowUp'].includes(event.key) ? current + step
      : ['ArrowLeft', 'ArrowDown'].includes(event.key) ? current - step
      : event.key === 'PageUp' ? current + step * 2 : event.key === 'PageDown' ? current - step * 2 : null
    if (value === null) return
    event.preventDefault()
    paint(value, true); dirty = true; settle()
  }
  input.addEventListener('pointerdown', start)
  input.addEventListener('input', change)
  input.addEventListener('change', settle)
  input.addEventListener('pointerup', settle)
  input.addEventListener('pointercancel', cancel)
  input.addEventListener('blur', settle)
  input.addEventListener('keydown', key)
  paint(initial.progress)
  return {
    follow(fraction: number) {
      const actual = clamp(fraction)
      state = { ...state, progress: actual }
      if (dragging) return
      if (pending !== null) {
        if (Math.abs(actual - pending) > 0.015) return
        pending = null; clearTimeout(release)
        state.preview(null)
      }
      sent = actual
      input.value = String(actual)
      input.style.setProperty('--dn-seek-progress', `${actual * 100}%`)
      const descripcion = state.describe(actual)
      if (input.getAttribute('aria-valuetext') !== descripcion) input.setAttribute('aria-valuetext', descripcion)
    },
    sync(next: SeekInputState) {
      state = next
      if (dragging) return
      // El motor puede emitir una posición antigua mientras procesa el seek.
      if (pending !== null) {
        if (Math.abs(clamp(next.progress) - pending) > 0.015) return
        pending = null; clearTimeout(release)
      }
      sent = clamp(next.progress)
      paint(next.progress)
    },
    dispose() {
      stopFrame(); clearTimeout(release)
      input.removeEventListener('pointerdown', start)
      input.removeEventListener('input', change)
      input.removeEventListener('change', settle)
      input.removeEventListener('pointerup', settle)
      input.removeEventListener('pointercancel', cancel)
      input.removeEventListener('blur', settle)
      input.removeEventListener('keydown', key)
    },
  }
}
