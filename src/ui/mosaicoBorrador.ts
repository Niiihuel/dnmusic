import type { Showcase } from '../services/showcases'

export function mismoMosaico(a: Showcase[], b: Showcase[]): boolean {
  return a.length === b.length && a.every((v, i) => v.id === b[i]?.id && v.ancho === b[i]?.ancho)
}

/** Releer contenidos/nuevas piezas al volver del editor conserva sólo el layout pendiente. */
export function reconciliarMosaico(base: Showcase[], borrador: Showcase[], nuevas: Showcase[], mantenerOrden = false): Showcase[] {
  const originales = new Map(base.map(v => [v.id, v]))
  const locales = new Map(borrador.map(v => [v.id, v]))
  const frescas = new Map(nuevas.map(v => [v.id, v]))
  const quitadas = new Set(base.filter(v => !locales.has(v.id)).map(v => v.id))
  const ordenLocal = base.filter(v => locales.has(v.id)).map(v => v.id).join('|') !== borrador.map(v => v.id).join('|')
  const orden = mantenerOrden || ordenLocal
    ? [...borrador.filter(v => frescas.has(v.id)), ...nuevas.filter(v => !originales.has(v.id) && !locales.has(v.id))]
    : nuevas
  return orden.filter(v => !quitadas.has(v.id)).map(v => {
    const fresca = frescas.get(v.id)!
    const local = locales.get(v.id), original = originales.get(v.id)
    return local && original && local.ancho !== original.ancho ? { ...fresca, ancho: local.ancho } : fresca
  })
}

/** Operaciones idempotentes. El servidor actual no ofrece una transacción para el mosaico. */
export async function persistirMosaico(
  base: Showcase[], actual: Showcase[],
  operaciones: {
    ancho: (id: string, ancho: Showcase['ancho']) => Promise<void>
    ordenar: (ids: string[]) => Promise<void>
    quitar: (id: string) => Promise<void>
  },
): Promise<void> {
  for (const v of actual) {
    if (base.find(b => b.id === v.id)?.ancho !== v.ancho) await operaciones.ancho(v.id, v.ancho)
  }
  if (base.map(v => v.id).join('|') !== actual.map(v => v.id).join('|')) {
    await operaciones.ordenar(actual.map(v => v.id))
  }
  // Borrar al final: nunca eliminar piezas si antes falló el guardado del layout.
  for (const v of base) {
    if (!actual.some(a => a.id === v.id)) await operaciones.quitar(v.id)
  }
}
