import { createStore, useStore } from './store'

/**
 * La cáscara de la app en el teléfono: qué pestaña está abierta.
 *
 * Vive fuera de las pantallas porque la barra de pestañas se dibuja en el
 * layout —abajo de todo, debajo del reproductor, como en Apple Music— y la
 * pantalla que reacciona a ella es otra. Es el mismo motivo por el que la cola
 * de reproducción vive en `playback` y no adentro de una lista.
 *
 * En escritorio nada de esto existe: ahí los tres paneles están a la vista al
 * mismo tiempo y no hay nada que alternar.
 */

export type Tab = 'inicio' | 'buscar' | 'listas' | 'chats' | 'perfil'

type ShellState = {
  tab: Tab
  /**
   * Si hay algo dibujado **debajo** del reproductor.
   *
   * Lo necesita él: cuando abajo hay otra fila —las pestañas, el buscador, la
   * del chat— el margen del borde inferior del teléfono le toca a esa, y si los
   * dos lo agregaran quedaría un hueco muerto entre las dos.
   *
   * Se llamaba «hay pestañas» y por eso fallaba buscando: abajo no había
   * pestañas pero sí el campo de búsqueda, y la tarjeta sumaba el área segura
   * entera creyendo que era la última de la pila.
   */
  tabsVisible: boolean
  /**
   * Alto total de lo que flota abajo: reproductor + pestañas, medido.
   *
   * Cada lista lo suma al margen de su contenido. El contenedor ya no se
   * acorta —el contenido corre hasta el borde y pasa por detrás del vidrio—,
   * así que el lugar para llegar a la última fila hay que reservarlo adentro.
   *
   * Se mide en vez de estimarse porque cambia con el modelo de teléfono, con
   * que haya o no música y con que estén o no las pestañas. Lo lee `usePiso`.
   */
  chromeH: number
  /**
   * Alto de lo que flota **arriba** en el teléfono: la franja del reloj más
   * los redondeles del encabezado, medido por la pantalla principal.
   *
   * Es el gemelo de `chromeH`. `docs/DESIGN.md` dice que los redondeles del
   * encabezado flotan sobre el contenido —igual que el reproductor y las
   * pestañas—, así que el contenido corre hasta el borde de **arriba** y pasa
   * por detrás de ellos, apagándose contra un degradado en vez de cortarse en
   * seco contra una línea. El lugar para que la primera fila arranque a la
   * vista se reserva adentro de cada lista, como margen del contenido; lo lee
   * `useTecho`. En escritorio es 0: ahí el encabezado está en el flujo.
   */
  techoH: number
  /**
   * Alto del teclado, 0 si está cerrado.
   *
   * Lo miran tres piezas a la vez —el campo de escribir, la lista de mensajes y
   * la cáscara de abajo— y por eso vive acá: con el teclado abierto, el
   * reproductor y las pestañas se van, y el campo se apoya sobre el teclado.
   * Es lo que hace WhatsApp, y lo que evita que el teclado suba solo dejando la
   * app abajo.
   */
  keyboardH: number
  /**
   * La cáscara está plegada: se replegó al desplazar hacia abajo.
   *
   * Plegada, el reproductor y las pestañas comparten **una sola fila**: la
   * pestaña activa como redondel, la tarjeta de lo que suena en el medio y la
   * lupa. Es lo que hace Apple Music, y el motivo es que mientras recorrés una
   * lista la cáscara no está aportando nada — sabés dónde estás— y sí te está
   * comiendo dos franjas de alto.
   */
  colapsada: boolean
  /**
   * Hay una conversación abierta, en el teléfono.
   *
   * Lo mira el layout para plegar la cáscara: adentro de un chat las pestañas
   * dan lugar a la casa y al reproductor, en una sola fila. Vive acá por lo
   * mismo que todo lo demás de esta cáscara — quien lo sabe es la pantalla y
   * quien lo dibuja es el layout.
   */
  enChat: boolean
  /** El panel lateral abierto. Vive acá porque lo dibuja el layout. */
  drawer: boolean
}

const store = createStore<ShellState>({
  tab: 'inicio',
  tabsVisible: false,
  chromeH: 0,
  techoH: 0,
  keyboardH: 0,
  colapsada: false,
  enChat: false,
  drawer: false,
})

/*
 * Crear una lista y abrirla. Lo sabe hacer la pantalla principal, no el layout.
 * Mismo puente que `registerTabHandler`.
 */
let onNewPlaylist: (() => void) | null = null

export function registerNewPlaylist(handler: (() => void) | null) {
  onNewPlaylist = handler
}

export function newPlaylist() {
  onNewPlaylist?.()
}

export function setDrawer(drawer: boolean) {
  store.set({ drawer })
}

/*
 * Abrir una lista por id, desde afuera de la pantalla principal.
 *
 * Mismo puente que `registerNewPlaylist` y `registerTabHandler`, y por la misma
 * razón: qué significa «abrir una lista» —qué panel mostrar, qué entrada de
 * historial dejar— lo sabe `app/index.tsx` y nadie más. El panel lateral vive
 * abajo de todo, fuera de ese árbol, así que no puede tocar ese estado; lo único
 * que puede hacer es pedirlo.
 */
let onAbrirLista: ((id: string) => void) | null = null

export function registerAbrirLista(handler: ((id: string) => void) | null) {
  onAbrirLista = handler
}

export function abrirLista(id: string) {
  onAbrirLista?.(id)
}

/*
 * Abrir la página de un artista, desde afuera de la pantalla principal.
 *
 * Lo pide el menú de «Sonando» («Ir al artista»): esa pantalla es una ruta
 * apilada sobre la principal y no sabe qué panel mostrar ni qué historial
 * dejar. Mismo puente que `abrirLista`, con el nombre además del id porque la
 * página lo muestra antes de que llegue la ficha.
 */
let onAbrirArtista: ((id: string, nombre: string) => void) | null = null

export function registerAbrirArtista(handler: ((id: string, nombre: string) => void) | null) {
  onAbrirArtista = handler
}

export function abrirArtista(id: string, nombre: string) {
  onAbrirArtista?.(id, nombre)
}

/*
 * Abrir una conversación por pairId, desde afuera de la pantalla principal.
 *
 * Lo usa el toque de una notificación push. Es el mismo puente que
 * `registerAbrirLista`, con una diferencia: la app puede estar **naciendo** de
 * ese toque, y entonces la pantalla principal todavía no registró nada. El
 * pedido queda guardado y se entrega en cuanto el handler aparece — sin esto,
 * el toque en frío te dejaba en la portada como si nada.
 */
let onAbrirChat: ((pairId: string) => void) | null = null
let chatPendiente: string | null = null

export function registerAbrirChat(handler: ((pairId: string) => void) | null) {
  onAbrirChat = handler
  if (handler && chatPendiente) {
    const pendiente = chatPendiente
    chatPendiente = null
    handler(pendiente)
  }
}

export function abrirChat(pairId: string) {
  if (onAbrirChat) onAbrirChat(pairId)
  else chatPendiente = pairId
}

/*
 * Qué hacer cuando alguien toca una pestaña.
 *
 * Lo registra la pantalla principal, que es la única que sabe qué significa
 * cada una —qué panel mostrar, qué historial dejar—. Es el mismo puente que usa
 * la barra de abajo con `registerPlaylistOpener`: la cáscara no puede saber de
 * listas ni de conversaciones, y la pantalla no puede dibujarse abajo de todo.
 */
let onTab: ((tab: Tab) => void) | null = null
let tabPendiente: Tab | null = null

export function registerTabHandler(handler: ((tab: Tab) => void) | null) {
  onTab = handler
  if (handler && tabPendiente) {
    const pendiente = tabPendiente
    tabPendiente = null
    handler(pendiente)
  }
}

export function setTab(tab: Tab) {
  /* Cambiar de sección despliega. Aterrizar en una pantalla nueva con la barra
     plegada sin haber desplazado nada la deja escondida sin explicación. */
  store.set({ tab, colapsada: false })
  if (onTab) onTab(tab)
  else tabPendiente = tab
}

export function setTabsVisible(tabsVisible: boolean) {
  if (store.get().tabsVisible !== tabsVisible) store.set({ tabsVisible })
}

export function setChromeH(chromeH: number) {
  if (store.get().chromeH !== chromeH) store.set({ chromeH })
}

export function setTechoH(techoH: number) {
  if (store.get().techoH !== techoH) store.set({ techoH })
}

/*
 * El alto del teclado, para decidir **qué se dibuja**.
 *
 * El movimiento no sale de acá: eso lo lleva `useAnimatedKeyboard`, que da el
 * alto real cuadro a cuadro en el hilo de la interfaz. Este número es el de
 * JavaScript y sirve para lo otro — si la cáscara se muestra, cuánto reserva
 * una lista al final. Mover píxeles con él es lo que se veía a los saltos.
 */
export function setEnChat(enChat: boolean) {
  if (store.get().enChat !== enChat) store.set({ enChat })
}

export function setColapsada(colapsada: boolean) {
  if (store.get().colapsada !== colapsada) store.set({ colapsada })
}

export function setKeyboardH(keyboardH: number) {
  if (store.get().keyboardH !== keyboardH) store.set({ keyboardH })
}

/**
 * Lo que hay que dejar libre al final de una lista para llegar a la última fila.
 *
 * El contenedor del contenido corre **hasta el borde de abajo** —es lo único
 * que le da sentido al vidrio: si nada pasa por debajo, no hay qué difuminar y
 * el material se ve como un gris más— así que el hueco no se descuenta del
 * alto, se reserva acá adentro como margen del contenido. La diferencia se ve
 * al desplazar: llegás a la última fila igual, pero las de arriba pasan por
 * detrás del material en vez de terminar contra él.
 *
 * `extra` es el margen que la lista quiere de todos modos, el que tendría sin
 * nada flotando encima. En escritorio es lo único que queda: ahí el reproductor
 * se apila y no tapa nada.
 */
export function usePiso(extra = 0) {
  return useChromeH() + extra
}

/**
 * Lo que hay que dejar libre al principio de una lista para que la primera
 * fila arranque a la vista, debajo del encabezado que flota.
 *
 * Es el espejo de `usePiso` y sigue su misma regla: el contenedor corre hasta
 * el borde de arriba —por detrás del reloj y de los redondeles— y el hueco se
 * reserva **adentro**, como margen del contenido. Al desplazar, las filas
 * pasan por detrás del degradado del encabezado y se apagan antes de tocar el
 * reloj, como en Apple Music.
 *
 * `extra` es el margen que la lista quiere de todos modos, el que tendría sin
 * nada flotando encima. En escritorio es lo único que queda.
 */
export function useTecho(extra = 0) {
  return useStore(store, (s) => s.techoH) + extra
}

export const useTab = () => useStore(store, (s) => s.tab)
export const useTabsVisible = () => useStore(store, (s) => s.tabsVisible)
export const useChromeH = () => useStore(store, (s) => s.chromeH)
export const useKeyboardH = () => useStore(store, (s) => s.keyboardH)
export const useColapsada = () => useStore(store, (s) => s.colapsada)
export const useEnChat = () => useStore(store, (s) => s.enChat)
export const useDrawer = () => useStore(store, (s) => s.drawer)
