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
   * El término ya asentado: lo que se busca **de verdad**, un toque después de
   * dejar de teclear.
   *
   * `termino` cambia con cada tecla —lo escucha el campo, que tiene que dibujar
   * lo que se escribe al toque—; `consulta` cambia recién cuando la mano frena.
   * La pantalla grande (la que arma resultados, filtra chats y se redibuja
   * entera) mira **esta** y no la otra: así teclear no la re-renderiza letra por
   * letra. El debounce vive acá y no en la pantalla porque el campo es uno para
   * toda la app.
   */
  consulta: string
  /**
   * La búsqueda está activada, hasta cancelar o cambiar de sección.
   *
   * Es lo que decide que la barra de pestañas se repliegue en el botón de
   * inicio y que el campo se dibuje. Con el término vacío y sin cursor, la
   * exploración se recupera al cancelar, no en el blur anterior a un click.
   */
  activo: boolean
  /** Qué dice el campo cuando está vacío. Lo pone la pantalla que lo abre. */
  pista: string
}

const store = createStore<Busqueda>({
  termino: '',
  consulta: '',
  activo: false,
  pista: 'Buscar',
})

/** Cuánto espera la consulta a que la mano frene. */
const DEBOUNCE_CONSULTA_MS = 250
let temporizador: ReturnType<typeof setTimeout> | null = null

/*
 * Asentar el término en `consulta`, un toque después de la última tecla.
 *
 * Vaciar es **inmediato**: borrar tiene que apagar los resultados ya, no
 * dentro de un cuarto de segundo. Cada tecla cancela el reloj anterior, así
 * que solo la última dispara.
 */
function asentar(termino: string) {
  if (temporizador) {
    clearTimeout(temporizador)
    temporizador = null
  }
  if (!termino.trim()) {
    store.set({ consulta: '' })
    return
  }
  temporizador = setTimeout(() => {
    temporizador = null
    if (store.get().termino === termino) store.set({ consulta: termino })
  }, DEBOUNCE_CONSULTA_MS)
}

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
  asentar(termino)
  onTermino?.(termino)
}

export function setActivo(activo: boolean) {
  if (store.get().activo !== activo) store.set({ activo })
}

/** Abre el buscador con su texto de ayuda. Lo llaman la lupa y las pestañas. */
export function abrirBusqueda(pista: string, enfocar = true) {
  store.set({ activo: enfocar, pista })
}

/**
 * Cierra y limpia.
 *
 * Las dos cosas juntas y no por separado: volver a abrir con el término viejo
 * mostraría los resultados de algo que ya no estabas buscando, y es justo el
 * momento en que uno no los está mirando.
 */
export function cerrarBusqueda() {
  if (temporizador) {
    clearTimeout(temporizador)
    temporizador = null
  }
  store.set({ termino: '', consulta: '', activo: false })
  onTermino?.('')
}

export const useTermino = () => useStore(store, (s) => s.termino)
/** La consulta asentada (con debounce). La mira la pantalla que arma resultados. */
export const useConsulta = () => useStore(store, (s) => s.consulta)
export const useBuscando = () => useStore(store, (s) => s.activo)
export const usePista = () => useStore(store, (s) => s.pista)
