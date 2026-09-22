export const EQ_GRAPH_HEIGHT = 220
const LEFT = 26, RIGHT = 22, TOP = 24, BOTTOM = 30

export const frecuenciaEQ = (hz: number) => hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`
export const decibeliosEQ = (db: number) => `${db > 0 ? '+' : ''}${Number.isFinite(db) ? db.toLocaleString('es-AR', { maximumFractionDigits: 1 }) : '0'} dB`
export function puntoEQ(index: number, gain: number, width: number, count: number) {
  return { x: LEFT + index * Math.max(1, width - LEFT - RIGHT) / Math.max(1, count - 1),
    y: TOP + (12 - Math.max(-12, Math.min(12, gain))) / 24 * (EQ_GRAPH_HEIGHT - TOP - BOTTOM) }
}
export function bandaEQ(x: number, width: number, count: number) {
  return Math.max(0, Math.min(count - 1, Math.round((x - LEFT) / Math.max(1, width - LEFT - RIGHT) * (count - 1))))
}
export function gananciaEQ(y: number) {
  return Math.round(Math.max(-12, Math.min(12, 12 - (y - TOP) / (EQ_GRAPH_HEIGHT - TOP - BOTTOM) * 24)) * 2) / 2
}
/** Bézier monotónica entre controles: no excede los límites ni corta los extremos. */
export function curvaEQ(gains: readonly number[], width: number) {
  const points = gains.map((gain, index) => puntoEQ(index, gain, width, gains.length))
  return points.map((p, index) => {
    if (!index) return `M ${p.x} ${p.y}`
    const previous = points[index - 1], middle = (p.x + previous.x) / 2
    return `C ${middle} ${previous.y}, ${middle} ${p.y}, ${p.x} ${p.y}`
  }).join(' ')
}
