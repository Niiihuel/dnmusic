import { createStore, useStore } from './store'

/**
 * El avance de la canción que se está **preparando por primera vez**.
 *
 * Resolver un tema —bajarlo de YouTube, remuxarlo, subirlo— tarda unos
 * segundos, y hasta ahora era una rueda girando: no se sabía si cargaba o si el
 * server se había caído. El servidor ahora va contando (`/resolve/progreso`) y
 * esto guarda ese número para que la tapa de la fila muestre un porcentaje.
 *
 * Es una sola canción a la vez —lo que se tocó o se sumó recién—, así que
 * alcanza con guardar cuál y en qué va. La tapa que está «ocupada» (`busy`) es
 * justo esa, así que no necesita preguntar cuál: lee el número y listo.
 */
type Resolucion = { videoId: string | null; pct: number | null }

const store = createStore<Resolucion>({ videoId: null, pct: null })

/** Empieza a resolver este video: el porcentaje arranca desconocido. */
export function iniciarResolucion(videoId: string) {
  store.set({ videoId, pct: null })
}

/** Avance (0..1) de la que se está resolviendo; se ignora si ya es otra. */
export function progresoResolucion(videoId: string, pct: number) {
  if (store.get().videoId === videoId) store.set({ pct })
}

/** Terminó (o falló) esta: se apaga, salvo que ya haya arrancado otra. */
export function terminarResolucion(videoId: string) {
  if (store.get().videoId === videoId) store.set({ videoId: null, pct: null })
}

/** El porcentaje de lo que se está preparando, o null si no hay número aún. */
export const useProgresoResolucion = () => useStore(store, (s) => s.pct)
