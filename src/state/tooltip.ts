import { createStore, useStore } from './store'

/**
 * El rótulo que aparece al dejar el cursor sobre un botón de solo ícono.
 *
 * Vive en un store y lo dibuja el layout una sola vez, encima de todo — mismo
 * camino que `state/aviso`. Un tooltip por botón sería un nodo flotante por
 * cada ícono de la pantalla, y además no habría forma de sostener la **espera
 * compartida** de acá abajo, que es lo que hace que se sienta bien.
 *
 * Los tiempos son los del modelo de Radix, que es el mejor probado:
 *
 * - Al entrar se espera `ESPERA_MS`. Un rótulo que salta al instante convierte
 *   cualquier paso del mouse por la barra en un cartel parpadeando.
 * - Al salir se cierra, y queda abierta una **ventana de gracia**: si el cursor
 *   entra a otro botón antes de `GRACIA_MS`, el siguiente aparece **sin
 *   esperar**. Es la diferencia entre recorrer una barra de controles y sentir
 *   que cada botón te hace esperar de nuevo.
 * - Con el foco del teclado aparece **al toque**: ahí no hay «paso sin querer»
 *   que filtrar, y la pauta de accesibilidad pide que se vea (WAI-ARIA APG).
 *
 * No se cierra solo por tiempo, a propósito: el criterio 1.4.13 de WCAG pide que
 * lo que aparece al pasar el cursor siga visible hasta que uno se vaya o lo
 * descarte. Por eso tampoco hay un reloj de auto-cierre.
 */

export type Tooltip = {
  texto: string
  /** Dónde está el botón, en coordenadas de la ventana. */
  x: number
  y: number
  w: number
  h: number
}

const store = createStore<{ tip: Tooltip | null }>({ tip: null })

/** Cuánto se espera antes de mostrarlo, viniendo de frío. */
const ESPERA_MS = 700
/** Cuánto dura la ventana en la que el siguiente aparece sin esperar. */
const GRACIA_MS = 300
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
let ultimoCierre = 0

function frenar() {
  if (relojAbrir) clearTimeout(relojAbrir)
  if (relojCerrar) clearTimeout(relojCerrar)
  relojAbrir = null
  relojCerrar = null
}

/** El cursor entró a un botón: con espera, salvo que venga de otro recién. */
export function pedirTooltip(tip: Tooltip) {
  frenar()
  const seguido = Date.now() - ultimoCierre < GRACIA_MS
  if (seguido || store.get().tip) {
    store.set({ tip })
    return
  }
  relojAbrir = setTimeout(() => {
    relojAbrir = null
    store.set({ tip })
  }, ESPERA_MS)
}

/** El teclado llegó al botón: sin espera. */
export function mostrarTooltipYa(tip: Tooltip) {
  frenar()
  store.set({ tip })
}

/** El cursor se fue. Se apaga tras el cruce, salvo que lo retengan. */
export function soltarTooltip() {
  if (relojAbrir) {
    clearTimeout(relojAbrir)
    relojAbrir = null
  }
  if (!store.get().tip) return
  if (relojCerrar) clearTimeout(relojCerrar)
  relojCerrar = setTimeout(() => {
    relojCerrar = null
    ultimoCierre = Date.now()
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
export function cerrarTooltip() {
  frenar()
  if (store.get().tip) {
    ultimoCierre = Date.now()
    store.set({ tip: null })
  }
}

export const useTooltip = () => useStore(store, (s) => s.tip)
