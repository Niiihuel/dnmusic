/** Medidas interiores: el padding pertenece a la celda, no a la superficie. */
export const AIRE_CELDA_MOSAICO = 6

/** Base congelada al agarrar el asa. Nunca acumula el delta sobre el layout que acaba de cambiar. */
export function objetivoResizeMosaico(inicio: { w: number; h: number; mosaico: number; filas: number }, dx: number, dy: number, anterior?: { cols: number; filas: number }) {
  'worklet'
  const columna = Math.max(1, inicio.mosaico / 2)
  const w = Math.max(72, Math.min(inicio.mosaico - AIRE_CELDA_MOSAICO * 2, inicio.w - AIRE_CELDA_MOSAICO * 2 + dx))
  const h = Math.max(48, inicio.h - AIRE_CELDA_MOSAICO * 2 + dy)
  const filaBase = Math.max(1, (inicio.h - AIRE_CELDA_MOSAICO * 2) / inicio.filas)
  // Una pequeña zona de tolerancia impide alternar tamaños cuando el dedo
  // tiembla justo sobre el punto de encastre.
  const toleranciaX = anterior ? (anterior.cols === 2 ? -12 : 12) : 0
  const toleranciaY = anterior ? (anterior.filas === 2 ? -12 : 12) : 0
  const cols = w > columna * 1.5 + toleranciaX ? 2 : 1
  return { cols, filas: cols === 2 && h > filaBase * 1.5 + toleranciaY ? 2 : 1 }
}
