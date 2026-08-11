import { createStore, useStore } from './store'

/**
 * Lo que estás buscando, para toda la app.
 *
 * Vivía adentro de la pantalla principal, y funcionó mientras el campo se
 * dibujaba ahí. Dejó de alcanzar cuando el buscador se mudó **a la fila de
 * abajo**, junto al reproductor y en lugar de las pestañas: esa franja la
 * dibuja el layout, que es hermano del navegador y no sabe nada de canciones ni
 * de conversaciones. Es el mismo motivo por el que la cola vive en `playback` y
 * la cáscara en `shell`.
 *
 * Acá está solo **lo que se escribió y si el campo está activo**. Qué se busca
 * con eso —canciones, artistas, cuentas—, cuándo se dispara y qué se hace con
 * los resultados sigue siendo de la pantalla: este store no sabe qué es una
 * canción, y no tiene por qué.
 */

type Busqueda = {
  termino: string
  /**
   * El campo está en uso: con el cursor puesto o con algo escrito.
   *
   * Es lo que decide que la barra de pestañas se repliegue en el botón de
   * inicio y que el campo se dibuje. Con el término vacío y sin cursor, la
   * cáscara vuelve a la normal.
   */
  activo: boolean
  /** Qué dice el campo cuando está vacío. Lo pone la pantalla que lo abre. */
  pista: string
}

const store = createStore<Busqueda>({
  termino: '',
  activo: false,
  pista: 'Buscar',
})

/*
 * Qué hacer con lo que se escribe.
 *
 * Lo registra la pantalla, que es la única que sabe si toca buscar canciones o
 * cuentas. Mismo puente que `registerTabHandler`: el layout dibuja el campo
 * pero no puede saber qué significa lo que entra en él.
 */
let onTermino: ((termino: string) => void) | null = null

export function registerBusquedaHandler(handler: ((termino: string) => void) | null) {
  onTermino = handler
}

export function setTermino(termino: string) {
  store.set({ termino })
  onTermino?.(termino)
}

export function setActivo(activo: boolean) {
  if (store.get().activo !== activo) store.set({ activo })
}

/** Abre el buscador con su texto de ayuda. Lo llaman la lupa y las pestañas. */
export function abrirBusqueda(pista: string) {
  store.set({ activo: true, pista })
}

/**
 * Cierra y limpia.
 *
 * Las dos cosas juntas y no por separado: volver a abrir con el término viejo
 * mostraría los resultados de algo que ya no estabas buscando, y es justo el
 * momento en que uno no los está mirando.
 */
export function cerrarBusqueda() {
  store.set({ termino: '', activo: false })
  onTermino?.('')
}

export const useTermino = () => useStore(store, (s) => s.termino)
export const useBuscando = () => useStore(store, (s) => s.activo)
export const usePista = () => useStore(store, (s) => s.pista)
