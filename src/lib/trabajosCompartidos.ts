const cancelacion = () => Object.assign(new Error('Operación cancelada'), { name: 'AbortError' })

/** Comparte trabajo en vuelo, conservándolo mientras haya alguien esperando. */
export function trabajosCompartidos<T>() {
  const pendientes = new Map<string, { controller: AbortController; promesa: Promise<T>; usuarios: number }>()
  return (key: string, iniciar: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> => {
    if (signal?.aborted) return Promise.reject(cancelacion())
    let trabajo = pendientes.get(key)
    if (!trabajo) {
      const controller = new AbortController()
      const nuevo = { controller, promesa: Promise.resolve().then(() => iniciar(controller.signal)), usuarios: 0 }
      trabajo = nuevo
      pendientes.set(key, nuevo)
      void nuevo.promesa.finally(() => { if (pendientes.get(key) === nuevo) pendientes.delete(key) }).catch(() => {})
    }
    const activo = trabajo
    activo.usuarios++
    return new Promise<T>((resolve, reject) => {
      let terminado = false
      const terminar = () => {
        if (terminado) return false
        terminado = true; signal?.removeEventListener('abort', abortar); activo.usuarios--
        return true
      }
      const abortar = () => {
        if (!terminar()) return
        reject(cancelacion())
        if (!activo.usuarios) queueMicrotask(() => {
          // React limpia la precarga antes de montar la petición de reproducción
          // del mismo cambio de tema: permitir ese traspaso sin reiniciar la extracción.
          if (activo.usuarios || pendientes.get(key) !== activo) return
          pendientes.delete(key)
          activo.controller.abort()
        })
      }
      signal?.addEventListener('abort', abortar, { once: true })
      activo.promesa.then(value => { if (terminar()) resolve(value) }, error => { if (terminar()) reject(error) })
    })
  }
}
