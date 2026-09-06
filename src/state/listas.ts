import type { TrackResult } from '../services/music'
import { createStore } from './store'

/**
 * Avisos entre pantallas sobre las listas.
 *
 * Las hojas que escriben una lista —«Agregar música», «Nueva lista»— son rutas
 * aparte, apiladas sobre la pantalla principal, y esa pantalla es la que tiene
 * la biblioteca en memoria y la lista abierta con sus canciones. Cuando la hoja
 * termina, alguien tiene que decirle «releé»: eso es lo que viaja por acá. Es
 * el mismo puente que `abrirLista` en `shell`, con un dato en vez de una
 * función, porque acá no importa quién escucha ni cuántos.
 */
type Cambio = { id: string; n: number }

const store = createStore<{
  cambio: Cambio | null
  /**
   * La canción que se está por sumar a alguna lista.
   *
   * La hoja de «Agregar a una lista» se abre desde el menú de cualquier
   * canción —una fila, la que suena, un resultado— y la canción tiene diez
   * campos: pasarla por la URL de la ruta la vuelve ilegible y la corta en el
   * teléfono. Se deja acá un instante y la hoja la toma al abrirse.
   */
  pendiente: TrackResult | null
}>({ cambio: null, pendiente: null })

/** Una lista cambió: quien la muestre, que la relea. */
export function avisarListaCambiada(id: string) {
  store.set((s) => ({ cambio: { id, n: (s.cambio?.n ?? 0) + 1 } }))
}

/**
 * Enterarse de cada cambio con una función, sin volver a dibujar por él.
 *
 * Es lo que quiere la pantalla principal: al aviso responde releyendo la
 * biblioteca y subiendo su `reloadToken`, y eso es estado que se toca desde
 * una **suscripción**, no desde un efecto que mire el valor — un efecto que
 * hace `setState` con lo que acaba de leer es un dibujado de más por aviso.
 */
export function suscribirListaCambiada(cb: (id: string) => void): () => void {
  let visto = store.get().cambio?.n ?? 0
  return store.subscribe(() => {
    const { cambio } = store.get()
    if (!cambio || cambio.n === visto) return
    visto = cambio.n
    cb(cambio.id)
  })
}

export function dejarCancionPendiente(track: TrackResult) {
  store.set({ pendiente: track })
}

/** La canción que espera lista, o `null`; se lee sin consumirla. */
export function cancionPendiente(): TrackResult | null {
  return store.get().pendiente
}

export function soltarCancionPendiente() {
  store.set({ pendiente: null })
}
