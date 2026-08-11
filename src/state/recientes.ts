import AsyncStorage from '@react-native-async-storage/async-storage'
import { createStore, useStore } from './store'

/**
 * Lo último que buscaste.
 *
 * Vive en el teléfono y no en la base: es del aparato, no de la cuenta. Que lo
 * que buscaste en tu iPhone aparezca en la web sería raro, y para guardarlo en
 * Supabase habría que decidir cuánto retener y quién lo puede leer — mucha
 * ceremonia para una lista de diez palabras.
 *
 * Se escribe al **elegir un resultado**, no al teclear. Ese es el punto: lo
 * escrito a medias no es una búsqueda, es el camino hacia una. Guardar cada
 * pulsación dejaría el historial lleno de `ciga`, `cigar`, `cigare`, que es
 * exactamente lo que uno no quiere volver a tocar. Apple Music hace lo mismo.
 */

const CLAVE = 'dnmusic.recientes.v1'
/** Cuántas se recuerdan. Más que esto ya no es historial, es archivo. */
const TOPE = 10

type Recientes = {
  /**
   * `null` mientras no se leyó del disco.
   *
   * No es lo mismo que la lista vacía: con `null` no hay nada que decir
   * todavía, y con `[]` corresponde el cartel de «no hay búsquedas recientes».
   * Sin la diferencia, el cartel parpadearía en cada arranque.
   */
  terminos: string[] | null
}

const store = createStore<Recientes>({ terminos: null })

/** Lee lo guardado. Lo llama la pantalla de búsqueda al montarse. */
export async function cargarRecientes() {
  if (store.get().terminos !== null) return
  try {
    const crudo = await AsyncStorage.getItem(CLAVE)
    const guardadas = crudo ? (JSON.parse(crudo) as string[]) : []
    store.set({ terminos: Array.isArray(guardadas) ? guardadas.slice(0, TOPE) : [] })
  } catch {
    // Sin historial, pero el buscador funciona igual.
    store.set({ terminos: [] })
  }
}

function guardar(terminos: string[]) {
  store.set({ terminos })
  void AsyncStorage.setItem(CLAVE, JSON.stringify(terminos)).catch(() => {
    // Queda en memoria para esta sesión y se pierde al cerrar. No es grave.
  })
}

/**
 * Suma un término al historial, arriba de todo.
 *
 * Repetir una búsqueda no la duplica: la sube. Es lo que uno espera de una
 * lista de «recientes» —lo último que hiciste va primero— y evita que buscar
 * tres veces lo mismo llene el historial con una sola cosa.
 *
 * La comparación ignora mayúsculas y espacios de sobra, pero **se guarda tal
 * como lo escribiste**: si buscaste «Cigarettes After Sex», eso es lo que
 * querés volver a ver, no `cigarettes after sex`.
 */
export function recordarBusqueda(termino: string) {
  const limpio = termino.trim()
  if (!limpio) return
  const igual = limpio.toLocaleLowerCase('es')
  const previas = store.get().terminos ?? []
  guardar([limpio, ...previas.filter((t) => t.toLocaleLowerCase('es') !== igual)].slice(0, TOPE))
}

/** Saca una sola, desde su «✕». */
export function olvidarBusqueda(termino: string) {
  guardar((store.get().terminos ?? []).filter((t) => t !== termino))
}

/** Borra todo, desde «Limpiar». */
export function limpiarRecientes() {
  guardar([])
}

export const useRecientes = () => useStore(store, (s) => s.terminos)
