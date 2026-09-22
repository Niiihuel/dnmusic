/** Control DOM: el arrastre no necesita renders de React ni saltos de audio por cuadro. */
export type SeekInputState = {
  progress: number
  envivo: boolean
  onSeek: (fraction: number) => void
  describe: (fraction: number) => string
  preview: (fraction: number | null) => void
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
    const value = event.key === 'Home' ? 0 : event.key === 'End' ? 1
      : ['ArrowRight', 'ArrowUp'].includes(event.key) ? current + 0.05
      : ['ArrowLeft', 'ArrowDown'].includes(event.key) ? current - 0.05
      : event.key === 'PageUp' ? current + 0.1 : event.key === 'PageDown' ? current - 0.1 : null
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
      if (dragging || pending !== null) return
      input.value = String(clamp(fraction))
      input.style.setProperty('--dn-seek-progress', `${clamp(fraction) * 100}%`)
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
