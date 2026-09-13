import Lenis from 'lenis'

/** Un motor por viewport; touch, zoom y scrolls internos conservan el gesto nativo. */
export function attachSmoothScroll(node: HTMLElement) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  const pointer = matchMedia('(hover: hover) and (pointer: fine)')
  let engine: Lenis | null = null
  // RN web sustituye scrollTo por la firma {x,y,animated}. Lenis llama la
  // firma DOM {top,left,behavior}; reenviarla a RN devuelve el panel a cero.
  const originalScrollTo = node.scrollTo
  const compatibleScrollTo = function (...args: unknown[]) {
    const options = args[0]
    if (options && typeof options === 'object' && ('top' in options || 'left' in options || 'behavior' in options)) {
      node.scroll(options as ScrollToOptions)
    } else {
      engine?.scrollTo(node.scrollTop, { immediate: true })
      Reflect.apply(originalScrollTo, node, args)
    }
  } as HTMLElement['scrollTo']
  node.scrollTo = compatibleScrollTo
  let frame: number | undefined
  let until = 0
  const tick = (time: number) => {
    engine?.raf(time)
    if (engine && (engine.isScrolling || time < until)) frame = requestAnimationFrame(tick)
    else frame = undefined
  }
  const wake = () => {
    until = performance.now() + 1200
    if (engine && frame === undefined) frame = requestAnimationFrame(tick)
  }
  const stop = () => { engine?.scrollTo(node.scrollTop, { immediate: true }) }
  const configure = () => {
    if (frame !== undefined) cancelAnimationFrame(frame)
    frame = undefined
    engine?.destroy(); engine = null
    if (reduced.matches || !pointer.matches || !(node.firstElementChild instanceof HTMLElement)) return
    engine = new Lenis({ wrapper: node, content: node.firstElementChild, autoRaf: false,
      duration: 0.65, lerp: 0.13, smoothWheel: true, syncTouch: false, allowNestedScroll: true,
      prevent: element => element.matches('textarea, input, [contenteditable="true"], [data-dn-native-scroll]'),
      virtualScroll: ({ event }) => !event.ctrlKey && !event.shiftKey,
    })
  }
  configure()
  node.addEventListener('wheel', wake, { passive: true })
  node.addEventListener('pointerdown', stop)
  node.addEventListener('keydown', stop)
  reduced.addEventListener('change', configure); pointer.addEventListener('change', configure)
  return {
    stop,
    scrollTo(top: number) { if (engine) { engine.scrollTo(top); wake() } else node.scrollTo({ top, behavior: 'auto' }) },
    destroy() {
      if (frame !== undefined) cancelAnimationFrame(frame)
      engine?.destroy()
      if (node.scrollTo === compatibleScrollTo) node.scrollTo = originalScrollTo
      node.removeEventListener('wheel', wake); node.removeEventListener('pointerdown', stop); node.removeEventListener('keydown', stop)
      reduced.removeEventListener('change', configure); pointer.removeEventListener('change', configure)
    },
  }
}
