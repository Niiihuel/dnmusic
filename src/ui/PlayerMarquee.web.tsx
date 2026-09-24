import { useEffect, useRef, useState, type CSSProperties } from 'react'

type Props = {
  text: string
  kind: 'title' | 'subtitle'
  onPress?: () => void
}

type Measurement = { text: string; overflow: boolean; distance: number; seconds: number }

/** Se mueve únicamente si el texto medido excede el espacio real disponible. */
export function PlayerMarquee({ text, kind, onPress }: Props) {
  const viewport = useRef<HTMLDivElement>(null)
  const first = useRef<HTMLSpanElement>(null)
  const [measurement, setMeasurement] = useState<Measurement>({ text: '', overflow: false, distance: 0, seconds: 0 })
  const overflow = measurement.text === text && measurement.overflow

  useEffect(() => {
    const box = viewport.current
    const content = first.current
    if (!box || !content) return
    let active = true
    const measure = () => {
      if (!active) return
      const contentWidth = content.getBoundingClientRect().width
      const boxWidth = box.clientWidth
      const distance = Math.ceil(contentWidth + 28)
      const next = {
        text,
        overflow: boxWidth > 0 && contentWidth > boxWidth + 1,
        distance,
        seconds: Math.max(9, Math.min(60, distance / 38 + 2)),
      }
      setMeasurement(previous => previous.text === next.text && previous.overflow === next.overflow &&
        previous.distance === next.distance && previous.seconds === next.seconds ? previous : next)
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(box)
    observer?.observe(content)
    void document.fonts?.ready.then(measure)
    return () => { active = false; observer?.disconnect() }
  }, [text])

  const animation = overflow ? {
    '--dn-marquee-distance': `${measurement.distance}px`,
    '--dn-marquee-duration': `${measurement.seconds}s`,
  } as CSSProperties : undefined

  return <div ref={viewport} className={`dn-player-marquee ${overflow ? 'dn-player-marquee-overflow' : ''} ${kind === 'title'
    ? 'text-foreground text-footnote font-semibold' : 'text-muted-foreground text-caption2'}`}
    title={text} role={onPress ? 'link' : undefined} aria-label={onPress ? `Ver artista: ${text}` : undefined}
    tabIndex={onPress || overflow ? 0 : undefined} onClick={onPress}
    onKeyDown={onPress ? event => { if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); onPress()
    } } : undefined}>
    <span className="dn-player-marquee-track" style={animation}>
      <span ref={first} className="dn-player-marquee-copy">{text}</span>
      {overflow ? <span aria-hidden="true" className="dn-player-marquee-copy dn-player-marquee-repeat">{text}</span> : null}
    </span>
  </div>
}
