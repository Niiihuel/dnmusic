/** Caché acotado por proceso: comparte consultas en curso y nunca guarda errores. */
export function cacheConsultas<T>(
  consultar: (query: string) => Promise<T>,
  ttlMs = 5 * 60_000,
  maxEntradas = 200,
): (query: string) => Promise<T> {
  const cache = new Map<string, { valor: T; vence: number }>()
  const pendientes = new Map<string, Promise<T>>()
  return (query) => {
    const clave = query.normalize('NFC').trim().replace(/\s+/g, ' ')
    const guardado = cache.get(clave)
    if (guardado && guardado.vence > Date.now()) {
      cache.delete(clave)
      cache.set(clave, guardado)
      return Promise.resolve(guardado.valor)
    }
    cache.delete(clave)
    const pendiente = pendientes.get(clave)
    if (pendiente) return pendiente
    const trabajo = Promise.resolve().then(() => consultar(clave)).then((valor) => {
      cache.set(clave, { valor, vence: Date.now() + ttlMs })
      while (cache.size > maxEntradas) cache.delete(cache.keys().next().value!)
      return valor
    }).finally(() => pendientes.delete(clave))
    pendientes.set(clave, trabajo)
    return trabajo
  }
}
