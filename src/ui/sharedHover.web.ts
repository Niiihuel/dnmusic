export type HoverBox = { x: number; y: number; width: number; height: number; radius: string; first: boolean }

/** Sigue opciones, no sus descendientes. Los espacios pertenecen al mismo grupo. */
export function observeSharedHover(node: HTMLElement, update: (box: HoverBox | null) => void) {
  let pointer: HTMLElement | null = null
  let focus: HTMLElement | null = null
  let painted: HTMLElement | null = null
  let reset: ReturnType<typeof setTimeout> | undefined
  const target = (element: EventTarget | null) => {
    const item = element instanceof Element ? element.closest<HTMLElement>('[data-dn-shared-item]') : null
    return item && item.closest('[data-dn-shared-group]') === node && !item.matches(':disabled,[aria-disabled="true"],[aria-busy="true"]') ? item : null
  }
  const keyboardTarget = (element: EventTarget | null) => element instanceof Element && element.matches(':focus-visible') ? target(element) : null
  const measure = () => {
    const item = pointer ?? focus
    clearTimeout(reset)
    if (!item?.isConnected) {
      update(null)
      // Reentrar durante la salida continúa desde la posición anterior.
      reset = setTimeout(() => { painted = null }, 180)
      return
    }
    const first = painted === null
    painted = item
    const a = node.getBoundingClientRect(), b = item.getBoundingClientRect()
    // El menú puede estar entrando con scale: medir en sus coordenadas locales.
    const sx = a.width / node.offsetWidth || 1, sy = a.height / node.offsetHeight || 1
    update({ x: (b.left - a.left) / sx + node.scrollLeft - node.clientLeft,
      y: (b.top - a.top) / sy + node.scrollTop - node.clientTop,
      width: b.width / sx, height: b.height / sy,
      radius: getComputedStyle(item).borderRadius, first })
  }
  const over = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return
    const next = target(e.target)
    // Como beUI, el fondo solo se retira al salir del grupo, no entre filas.
    if (!next || next === pointer) return
    pointer = next
    measure()
  }
  const leave = () => { pointer = null; measure() }
  const focusIn = (e: FocusEvent) => { focus = keyboardTarget(e.target); measure() }
  const focusOut = (e: FocusEvent) => { focus = keyboardTarget(e.relatedTarget); measure() }
  const blur = () => { pointer = null; focus = null; measure() }
  const observer = new ResizeObserver(measure)
  observer.observe(node)
  node.addEventListener('pointerover', over)
  node.addEventListener('pointerleave', leave)
  node.addEventListener('focusin', focusIn)
  node.addEventListener('focusout', focusOut)
  node.addEventListener('scroll', measure, true)
  window.addEventListener('resize', measure)
  window.addEventListener('blur', blur)
  return () => {
    clearTimeout(reset)
    observer.disconnect()
    node.removeEventListener('pointerover', over); node.removeEventListener('pointerleave', leave)
    node.removeEventListener('focusin', focusIn); node.removeEventListener('focusout', focusOut)
    node.removeEventListener('scroll', measure, true)
    window.removeEventListener('resize', measure); window.removeEventListener('blur', blur)
  }
}
