export type HoverBox = { x: number; y: number; width: number; height: number; radius: string; first: boolean; immediate?: boolean }

/** Sigue opciones, no sus descendientes. Los espacios pertenecen al mismo grupo. */
export function observeSharedHover(node: HTMLElement, update: (box: HoverBox | null) => void) {
  let pointer: HTMLElement | null = null
  let focus: HTMLElement | null = null
  let painted: HTMLElement | null = null
  let reset: ReturnType<typeof setTimeout> | undefined
  const selector = node.dataset.dnSharedTargets === 'surfaces' ? '[data-dn-shared-item], [data-dn-surface], [data-dn-hover="surface"]' : '[data-dn-shared-item]'
  const target = (element: EventTarget | null) => {
    const item = element instanceof Element ? (element.closest<HTMLElement>('[data-dn-surface]') ?? element.closest<HTMLElement>(selector)) : null
    return item && item.closest('[data-dn-shared-group]') === node && !item.closest(':disabled,[aria-disabled="true"],[aria-busy="true"],[aria-hidden="true"]') ? item : null
  }
  const keyboardTarget = (element: EventTarget | null) => element instanceof Element && element.matches(':focus-visible') ? target(element) : null
  const measure = (immediate = false) => {
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
    const inset = item.dataset.dnSurface === 'card' ? 8 : 0
    update({ x: (b.left - a.left) / sx + node.scrollLeft - node.clientLeft - inset,
      y: (b.top - a.top) / sy + node.scrollTop - node.clientTop - inset,
      width: b.width / sx + inset * 2, height: b.height / sy + inset * 2,
      radius: inset ? '20px' : getComputedStyle(item).borderRadius, first, ...(immediate ? { immediate: true } : {}) })
  }
  const over = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return
    const next = target(e.target)
    // Como beUI, el fondo solo se retira al salir del grupo, no entre filas.
    if (!next) {
      // Entrar a un grupo anidado apaga el anterior: nunca dos fondos a la vez.
      if (e.target instanceof Element && e.target.closest('[data-dn-shared-group]') !== node) {
        pointer = null
        measure()
      }
      return
    }
    if (next === pointer) return
    pointer = next
    measure()
  }
  const leave = () => { pointer = null; measure() }
  const focusIn = (e: FocusEvent) => { focus = keyboardTarget(e.target); measure() }
  const focusOut = (e: FocusEvent) => { focus = keyboardTarget(e.relatedTarget); measure() }
  const blur = () => { pointer = null; focus = null; measure() }
  const onScroll = () => measure(true)
  const observer = new ResizeObserver(() => measure(true))
  observer.observe(node)
  node.addEventListener('pointerover', over)
  node.addEventListener('pointerleave', leave)
  node.addEventListener('focusin', focusIn)
  node.addEventListener('focusout', focusOut)
  node.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', onScroll)
  window.addEventListener('blur', blur)
  return () => {
    clearTimeout(reset)
    observer.disconnect()
    node.removeEventListener('pointerover', over); node.removeEventListener('pointerleave', leave)
    node.removeEventListener('focusin', focusIn); node.removeEventListener('focusout', focusOut)
    node.removeEventListener('scroll', onScroll, true)
    window.removeEventListener('resize', onScroll); window.removeEventListener('blur', blur)
  }
}
