import { createStore, useStore } from './store'

/**
 * Un único rótulo flotante para los botones de sólo ícono.
 * Cada entrada del cursor espera medio segundo, incluso entre controles vecinos.
 * Salir antes cancela la apertura; el teclado conserva la respuesta inmediata.
 * Una vez visible se puede cruzar hacia él y leerlo sin límite de tiempo.
 */

export type Tooltip = {
  texto: string
  owner?: string
  anchor?: HTMLElement
  /** Dónde está el botón, en coordenadas de la ventana. */
  x: number
  y: number
  w: number
  h: number
}

const store = createStore<{ tip: Tooltip | null }>({ tip: null })

/** Espera perceptible en cada control, sin aperturas instantáneas entre vecinos. */
const ESPERA_MS = 500
/**
 * Cuánto se lo banca abierto después de salir del botón.
 *
 * Existe para poder **cruzar** del botón al rótulo con el mouse sin que se
 * apague en el camino: el criterio 1.4.13 pide que se pueda pasar el cursor por
 * encima. Sin esta pausa, salir del botón lo mataría antes de que el rótulo
 * llegue a enterarse de que lo están señalando.
 */
const CRUCE_MS = 120

let relojAbrir: ReturnType<typeof setTimeout> | null = null
let relojCerrar: ReturnType<typeof setTimeout> | null = null
let pendingOwner: string | undefined

function frenar() {
  if (relojAbrir) clearTimeout(relojAbrir)
  if (relojCerrar) clearTimeout(relojCerrar)
  relojAbrir = null
  relojCerrar = null
}

/** El cursor entró a un botón: inicia una espera completa para ese control. */
export function pedirTooltip(tip: Tooltip) {
  frenar()
  pendingOwner = tip.owner
  // Retirar el anterior evita mostrar texto de otro botón durante la espera.
  if (store.get().tip) store.set({ tip: null })
  relojAbrir = setTimeout(() => {
    relojAbrir = null
    store.set({ tip })
  }, ESPERA_MS)
}

/** El teclado llegó al botón: sin espera. */
export function mostrarTooltipYa(tip: Tooltip) {
  frenar()
  pendingOwner = tip.owner
  store.set({ tip })
}

/** El cursor se fue. Se apaga tras el cruce, salvo que lo retengan. */
export function soltarTooltip(owner?: string) {
  if (owner && owner !== pendingOwner && owner !== store.get().tip?.owner) return
  if (relojAbrir) {
    clearTimeout(relojAbrir)
    relojAbrir = null
  }
  if (!store.get().tip) return
  if (relojCerrar) clearTimeout(relojCerrar)
  relojCerrar = setTimeout(() => {
    relojCerrar = null
    store.set({ tip: null })
  }, CRUCE_MS)
}

/** El cursor está sobre el propio rótulo: no se apaga. */
export function retenerTooltip() {
  if (relojCerrar) {
    clearTimeout(relojCerrar)
    relojCerrar = null
  }
}

/**
 * Se va **ya**: al apretar el botón, con Escape, o al desmontarse quien lo pidió.
 *
 * Apretar lo cierra porque el gesto ya se hizo: el rótulo explicaba algo que la
 * persona acaba de decidir, y quedarse sería estorbar el resultado. Escape es lo
 * que pide la APG y el criterio 1.4.13 («descartable»).
 */
export function cerrarTooltip(owner?: string) {
  if (owner && owner !== pendingOwner && owner !== store.get().tip?.owner) return
  pendingOwner = undefined
  frenar()
  if (store.get().tip) {
    store.set({ tip: null })
  }
}

export const useTooltip = () => useStore(store, (s) => s.tip)
