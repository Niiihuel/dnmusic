import { attachSmoothScroll } from './smoothScroll.web'
import { forwardRef, useContext, useCallback, useEffect, useId, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { ScrollView, View, type ScrollViewProps } from 'react-native'
import { ScrollAreaTecho } from './ScrollAreaContext'

type ScrollAreaProps = ScrollViewProps & {
  /** Mantiene estable el tamaño visual del pulgar cuando una lista virtual monta filas por tandas. */
  smooth?: boolean
  stableIndicator?: boolean
  /** Reinicia la medida estable al cambiar de colección. */
  contentKey?: string | number
}

/** Medidas del pulgar, acotadas incluso cuando cambia o desaparece el contenido. */
export function geometriaScrollbar(viewport: number, contenido: number, offset: number, carril = viewport, contenidoRepresentado = contenido) {
  const maximo = Math.max(0, contenido - viewport)
  const visual = Math.max(contenido, contenidoRepresentado)
  const alto = viewport > 0 && visual > 0 ? Math.min(Math.max(0, carril), Math.max(28, carril * viewport / visual)) : 0
  const recorrido = Math.max(0, carril - alto)
  return { alto, recorrido, maximo, top: maximo ? recorrido * Math.min(maximo, Math.max(0, offset)) / maximo : 0 }
}

/**
 * Mismo contrato/ref que ScrollView. Lenis suaviza el scroll de escritorio
 * dentro de este viewport; touch y movimiento reducido siguen siendo nativos.
 * El indicador se superpone al contenido sin reservar un carril.
 * No introduce fondos, degradados ni límites de altura propios.
 */
export const ScrollArea = forwardRef<ScrollView, ScrollAreaProps>(function ScrollArea({
  children, style, scrollIndicatorInsets, className = '', onScroll, onContentSizeChange, horizontal,
  scrollEventThrottle = 16, showsVerticalScrollIndicator = true, scrollEnabled = true,
  stableIndicator = false, contentKey = 'default', smooth = true, ...props
}, forwardedRef) {
  const techoPanel = useContext(ScrollAreaTecho)
  const insetTop = scrollIndicatorInsets?.top ?? techoPanel
  const insetBottom = scrollIndicatorInsets?.bottom ?? 0
  const indicadorActivo = showsVerticalScrollIndicator && scrollEnabled
  const scroll = useRef<ScrollView | null>(null)
  const viewport = useRef<HTMLElement | null>(null)
  const track = useRef<HTMLDivElement>(null)
  const thumb = useRef<HTMLDivElement>(null)
  const smoothing = useRef<ReturnType<typeof attachSmoothScroll> | null>(null)
  const drag = useRef<{ y: number; offset: number; pointer: number } | null>(null)
  const frame = useRef<number | null>(null)
  const id = useId()
  const geometry = useRef(geometriaScrollbar(0, 0, 0))
  const extent = useRef<{ key: string | number; max: number }>({ key: contentKey, max: 0 })
  if (extent.current.key !== contentKey) extent.current = { key: contentKey, max: 0 }
  const ref = useCallback((value: ScrollView | null) => {
    scroll.current = value
    if (typeof forwardedRef === 'function') forwardedRef(value)
    else if (forwardedRef) forwardedRef.current = value
  }, [forwardedRef])
  const medir = useCallback(() => {
    const node = viewport.current
    if (!node || !track.current || !thumb.current) return
    const top = Math.min(node.clientHeight, Math.max(0, Number.isFinite(insetTop) ? insetTop : 0))
    const bottom = Math.min(node.clientHeight - top, Math.max(0, Number.isFinite(insetBottom) ? insetBottom : 0))
    track.current.style.top = `${top}px`
    track.current.style.bottom = `${bottom}px`
    if (stableIndicator) extent.current.max = Math.max(extent.current.max, node.scrollHeight)
    const represented = stableIndicator ? extent.current.max : node.scrollHeight
    const g = geometriaScrollbar(node.clientHeight, node.scrollHeight, node.scrollTop, node.clientHeight - top - bottom, represented)
    geometry.current = g
    const visible = indicadorActivo && g.maximo > 1 && g.recorrido > 0
    track.current.style.display = visible ? '' : 'none'
    track.current.setAttribute('aria-valuemax', String(Math.round(g.maximo)))
    track.current.setAttribute('aria-valuenow', String(Math.round(Math.max(0, Math.min(node.scrollTop, g.maximo)))))
    thumb.current.style.height = `${g.alto}px`
    thumb.current.style.transform = `translateY(${g.top}px)`
  }, [indicadorActivo, insetTop, insetBottom, stableIndicator])
  const solicitarMedida = useCallback(() => {
    if (frame.current !== null) return
    frame.current = requestAnimationFrame(() => { frame.current = null; medir() })
  }, [medir])
  useEffect(() => {
    if (horizontal) return
    const node = scroll.current?.getScrollableNode() as HTMLElement | undefined
    if (!node) return
    viewport.current = node
    node.classList.add('dn-scroll-viewport')
    node.id ||= `dn-scroll-${id}`
    const rail = track.current
    rail?.setAttribute('aria-controls', node.id)
    const observer = new ResizeObserver(solicitarMedida)
    observer.observe(node)
    if (node.firstElementChild) observer.observe(node.firstElementChild)
    // Escuchar el nodo mantiene la barra sincronizada también con scrollTo y
    // con el teclado, sin redibujar React por cada evento de desplazamiento.
    node.addEventListener('scroll', solicitarMedida, { passive: true })
    const engine = smooth && scrollEnabled ? attachSmoothScroll(node) : null
    smoothing.current = engine
    medir()
    return () => {
      engine?.destroy()
      smoothing.current = null
      observer.disconnect()
      node.removeEventListener('scroll', solicitarMedida)
      node.classList.remove('dn-scroll-viewport')
      viewport.current = null
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      frame.current = null
      const pointer = drag.current?.pointer
      drag.current = null
      if (rail) {
        delete rail.dataset.dragging
        if (pointer !== undefined && rail.hasPointerCapture(pointer)) rail.releasePointerCapture(pointer)
      }
    }
  }, [horizontal, id, medir, solicitarMedida, smooth, scrollEnabled])

  function presionar(event: PointerEvent<HTMLDivElement>) {
    if (!indicadorActivo || event.button !== 0 || !viewport.current) return
    event.preventDefault()
    smoothing.current?.stop()
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    medir()
    const node = viewport.current, g = geometry.current
    if (!thumb.current?.contains(event.target as Node)) {
      const y = event.clientY - event.currentTarget.getBoundingClientRect().top - g.alto / 2
      node.scrollTop = g.recorrido ? Math.max(0, Math.min(g.recorrido, y)) * g.maximo / g.recorrido : 0
    }
    drag.current = { y: event.clientY, offset: node.scrollTop, pointer: event.pointerId }
    event.currentTarget.dataset.dragging = 'true'
    solicitarMedida()
  }
  function mover(event: PointerEvent<HTMLDivElement>) {
    const inicio = drag.current, node = viewport.current, g = geometry.current
    if (!indicadorActivo || !inicio || !node || inicio.pointer !== event.pointerId || !g.recorrido) return
    node.scrollTop = inicio.offset + (event.clientY - inicio.y) * g.maximo / g.recorrido
    solicitarMedida()
  }
  function soltar(event: PointerEvent<HTMLDivElement>) {
    drag.current = null
    delete event.currentTarget.dataset.dragging
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  function teclado(event: KeyboardEvent<HTMLDivElement>) {
    const node = viewport.current
    if (!indicadorActivo || !node) return
    const destinos: Record<string, number> = {
      ArrowUp: node.scrollTop - 40, ArrowDown: node.scrollTop + 40,
      PageUp: node.scrollTop - node.clientHeight, PageDown: node.scrollTop + node.clientHeight,
      Home: 0, End: geometry.current.maximo,
    }
    if (!(event.key in destinos)) return
    event.preventDefault()
    if (smoothing.current) smoothing.current.scrollTo(destinos[event.key])
    else node.scrollTop = destinos[event.key]
    solicitarMedida()
  }
  // Las filas horizontales conservan su presentación/indicador nativos.
  if (horizontal) return <ScrollView {...props} scrollIndicatorInsets={scrollIndicatorInsets} horizontal scrollEnabled={scrollEnabled} showsVerticalScrollIndicator={showsVerticalScrollIndicator} style={style} className={className} ref={ref} onScroll={onScroll} onContentSizeChange={onContentSizeChange} scrollEventThrottle={scrollEventThrottle}>{children}</ScrollView>
  return <View className={`dn-scroll-area ${className}`} style={[{ flexGrow: 1, flexShrink: 1, minWidth: 0, minHeight: 0, position: 'relative' }, style]}>
    <ScrollAreaTecho.Provider value={0}>
    <ScrollView {...props} ref={ref} scrollEnabled={scrollEnabled} style={{ flexGrow: 1, flexShrink: 1, minWidth: 0, minHeight: 0 }} showsVerticalScrollIndicator={false}
      onScroll={onScroll} scrollEventThrottle={scrollEventThrottle}
      onContentSizeChange={(width, height) => { solicitarMedida(); onContentSizeChange?.(width, height) }}>
      {children}
    </ScrollView>
    </ScrollAreaTecho.Provider>
    <div ref={track} className="dn-scrollbar" role="scrollbar" aria-label="Desplazar contenido" aria-orientation="vertical"
      aria-valuemin={0} aria-valuemax={0} aria-valuenow={0} aria-hidden={!indicadorActivo} hidden={!indicadorActivo}
      tabIndex={indicadorActivo ? 0 : -1} style={{ display: 'none' }}
      onPointerDown={presionar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar} onLostPointerCapture={soltar} onKeyDown={teclado}>
      <div ref={thumb} className="dn-scrollbar-thumb" />
    </div>
  </View>
})
