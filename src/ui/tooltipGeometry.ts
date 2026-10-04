/** Aire entre el botón y el rótulo. */
const SEPARACION = 6
/** Margen mínimo contra el borde de la ventana. */
const MARGEN = 8
/** Alto aproximado, solo para decidir si entra arriba o va abajo. */
const ALTO = 28
/** Ancho máximo: si no entra, el texto era demasiado largo para un tooltip. */
const ANCHO_MAX = 260
const ANCHO_MIN = 56

/**
 * Calcula una caja compacta pegada al control.
 *
 * Antes todos los rótulos ocupaban una caja invisible de 260 px. Al acotarla
 * contra el borde derecho, un texto corto terminaba centrado lejos del icono.
 * La punta conserva además la referencia exacta cuando la caja debe correrse.
 */
export function geometriaTooltip(
  tip: { texto: string; x: number; y: number; w: number; h: number },
  width: number,
  height: number,
  measured?: { width: number; height: number },
) {
  const arriba = tip.y - SEPARACION - (measured?.height ?? ALTO) >= MARGEN || tip.y > height / 2
  const ancho = Math.min(Math.max(0, width - MARGEN * 2), ANCHO_MAX, measured?.width ?? Math.max(ANCHO_MIN, tip.texto.length * 7 + 20))
  const centro = tip.x + tip.w / 2
  const left = Math.max(MARGEN, Math.min(centro - ancho / 2, width - ancho - MARGEN))
  const punta = Math.max(12, Math.min(centro - left - 4, ancho - 20))
  return { arriba, left, ancho, punta }
}

/** Un solo contorno para el cuerpo y la punta: no superponer un rombo sin borde. */
export function contornoTooltip(width: number, height: number, pointer: number, above: boolean) {
  const left = 0.5, right = width - 0.5
  const top = above ? 0.5 : 6.5, bottom = above ? height - 6.5 : height - 0.5
  const r = Math.min(12, (bottom - top) / 2, width / 2 - 1)
  const x = Math.max(r + 6, Math.min(pointer, width - r - 6))
  const upper = above ? '' : `H ${x - 6} L ${x - 1} 1 Q ${x} 0 ${x + 1} 1 L ${x + 6} ${top}`
  const lower = above ? `H ${x + 6} L ${x + 1} ${height - 1} Q ${x} ${height} ${x - 1} ${height - 1} L ${x - 6} ${bottom}` : ''
  return `M ${left + r} ${top} ${upper} H ${right - r} Q ${right} ${top} ${right} ${top + r} V ${bottom - r} Q ${right} ${bottom} ${right - r} ${bottom} ${lower} H ${left + r} Q ${left} ${bottom} ${left} ${bottom - r} V ${top + r} Q ${left} ${top} ${left + r} ${top} Z`
}
