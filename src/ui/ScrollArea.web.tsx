import { forwardRef, useCallback, useEffect, useId, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { ScrollView, View, type ScrollViewProps } from 'react-native'

/** Medidas del pulgar, acotadas incluso cuando cambia o desaparece el contenido. */
export function geometriaScrollbar(viewport: number, contenido: number, offset: number) {
  const maximo = Math.max(0, contenido - viewport)
  const alto = viewport > 0 && contenido > 0 ? Math.min(viewport, Math.max(28, viewport * viewport / contenido)) : 0
  const recorrido = Math.max(0, viewport - alto)
  return { alto, recorrido, maximo, top: maximo ? recorrido * Math.min(maximo, Math.max(0, offset)) / maximo : 0 }
}

/**
 * Mismo contrato/ref que ScrollView. El scroll sigue siendo nativo; sólo el
 * indicador es nuestro, sobre el contenido y sin carril que reserve ancho.
 * No introduce fondos, degradados ni límites de altura propios.
 */
export const ScrollArea = forwardRef<ScrollView, ScrollViewProps>(function ScrollArea({
  children, style, className = '', onScroll, onContentSizeChange, horizontal,
  scrollEventThrottle = 16, showsVerticalScrollIndicator = true, scrollEnabled = true, ...props
}, forwardedRef) {
  const indicadorActivo = showsVerticalScrollIndicator && scrollEnabled
  const scroll = useRef<ScrollView | null>(null)
  const viewport = useRef<HTMLElement | null>(null)
  const track = useRef<HTMLDivElement>(null)
  const thumb = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y: number; offset: number; pointer: number } | null>(null)
  const frame = useRef<number | null>(null)
  const id = useId()
  const geometry = useRef(geometriaScrollbar(0, 0, 0))
  const ref = useCallback((value: ScrollView | null) => {
    scroll.current = value
    if (typeof forwardedRef === 'function') forwardedRef(value)
    else if (forwardedRef) forwardedRef.current = value
  }, [forwardedRef])
  const medir = useCallback(() => {
    const node = viewport.current
    if (!node || !track.current || !thumb.current) return
    const g = geometriaScrollbar(node.clientHeight, node.scrollHeight, node.scrollTop)
    geometry.current = g
    const visible = indicadorActivo && g.maximo > 1 && g.recorrido > 0
    track.current.style.display = visible ? '' : 'none'
    track.current.setAttribute('aria-valuemax', String(Math.round(g.maximo)))
    track.current.setAttribute('aria-valuenow', String(Math.round(Math.max(0, Math.min(node.scrollTop, g.maximo)))))
    thumb.current.style.height = `${g.alto}px`
    thumb.current.style.transform = `translateY(${g.top}px)`
  }, [indicadorActivo])
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
    medir()
    return () => {
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
  }, [horizontal, id, medir, solicitarMedida])

  function presionar(event: PointerEvent<HTMLDivElement>) {
    if (!indicadorActivo || event.button !== 0 || !viewport.current) return
    event.preventDefault()
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
    node.scrollTop = destinos[event.key]
    solicitarMedida()
  }
  // Las filas horizontales conservan su presentación/indicador nativos.
  if (horizontal) return <ScrollView {...props} horizontal scrollEnabled={scrollEnabled} showsVerticalScrollIndicator={showsVerticalScrollIndicator} style={style} className={className} ref={ref} onScroll={onScroll} onContentSizeChange={onContentSizeChange} scrollEventThrottle={scrollEventThrottle}>{children}</ScrollView>
  return <View className={`dn-scroll-area ${className}`} style={[{ flexGrow: 1, flexShrink: 1, minWidth: 0, minHeight: 0, position: 'relative' }, style]}>
    <ScrollView {...props} ref={ref} scrollEnabled={scrollEnabled} style={{ flexGrow: 1, flexShrink: 1, minWidth: 0, minHeight: 0 }} showsVerticalScrollIndicator={false}
      onScroll={onScroll} scrollEventThrottle={scrollEventThrottle}
      onContentSizeChange={(width, height) => { solicitarMedida(); onContentSizeChange?.(width, height) }}>
      {children}
    </ScrollView>
    <div ref={track} className="dn-scrollbar" role="scrollbar" aria-label="Desplazar contenido" aria-orientation="vertical"
      aria-valuemin={0} aria-valuemax={0} aria-valuenow={0} aria-hidden={!indicadorActivo} hidden={!indicadorActivo}
      tabIndex={indicadorActivo ? 0 : -1} style={{ display: 'none' }}
      onPointerDown={presionar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar} onLostPointerCapture={soltar} onKeyDown={teclado}>
      <div ref={thumb} className="dn-scrollbar-thumb" />
    </div>
  </View>
})
