import type { MenuItem } from './Menu'

/**
 * Cuántas acciones rápidas entran en la fila de arriba. Con más, las celdas
 * quedan angostas y el rótulo se parte; las que sobran caen a la lista.
 */
const MAX_RAPIDAS = 4

/**
 * Reparte un menú en sus dos partes: la fila de íconos y la lista.
 *
 * Es una función y no algo que decida cada renglón porque el alto del panel se
 * calcula **antes** de dibujarlo —para saber si abre hacia arriba o hacia
 * abajo— y tiene que contar exactamente lo que se va a dibujar. En iOS la usa
 * el menú nativo con el mismo reparto, así los dos menús ofrecen lo mismo en el
 * mismo lugar.
 */
/** iOS conserva filas deshabilitadas; el respaldo mantiene su omisión actual. */
export function repartirMenu(items: MenuItem[], incluirDeshabilitadas = false): { rapidas: MenuItem[]; lista: MenuItem[] } {
  const usable = items.filter((item) => incluirDeshabilitadas || !item.disabled)
  const candidatas = usable.filter((item) => item.rapida && !item.items?.length)
  const rapidas = candidatas.slice(0, MAX_RAPIDAS)
  const enFila = new Set(rapidas)
  return { rapidas, lista: usable.filter((item) => !enFila.has(item)) }
}

/** Si antes de esta fila va un corte: lo pidió, o acá empieza lo destructivo. */
export function llevaCorte(lista: MenuItem[], i: number): boolean {
  if (i === 0) return false
  const item = lista[i]
  const previo = lista[i - 1]
  return !!item.separadorAntes || (!!item.destructive && !previo?.destructive)
}
