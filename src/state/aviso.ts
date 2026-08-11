import { createStore, useStore } from './store'

/**
 * El aviso de abajo: «Guardado», «No se pudo», y poco más.
 *
 * Es un **toast**, no un snackbar. La diferencia importa acá: un snackbar de
 * Material lleva una acción al costado —«Deshacer»— y se queda hasta que la
 * toques. Esto no tiene nada que deshacer: los cambios del perfil se guardan de
 * a uno y cada uno se puede volver a cambiar entrando otra vez. Un botón que no
 * hace falta es un botón que hay que leer.
 *
 * Tampoco es la barra de «cambios sin guardar» de Discord: esa existe porque
 * allá el formulario acumula cambios y hay que confirmarlos. Nuestro editor
 * guarda al toque, así que no hay nada pendiente que anunciar — lo único que
 * falta es **confirmar que pasó**, que es justamente lo que hace un toast.
 *
 * Vive en un store porque lo dispara cualquier pantalla y lo dibuja el layout,
 * una sola vez, encima de todo. Mismo camino que la cáscara y la búsqueda.
 */

type Aviso = {
  /** El texto, o `null` si no hay nada que decir. */
  texto: string | null
  /**
   * Cambia con cada aviso, aunque el texto se repita.
   *
   * Guardar dos veces seguidas dice «Guardado» las dos: sin esto, la segunda no
   * reiniciaría el reloj y el aviso se iría antes de tiempo.
   */
  turno: number
  /** Los errores se quedan más y se marcan distinto. */
  malo: boolean
}

const store = createStore<Aviso>({ texto: null, turno: 0, malo: false })

export function avisar(texto: string, malo = false) {
  store.set({ texto, malo, turno: store.get().turno + 1 })
}

export function limpiarAviso() {
  if (store.get().texto !== null) store.set({ texto: null })
}

export const useAviso = () => useStore(store, (s) => s)
