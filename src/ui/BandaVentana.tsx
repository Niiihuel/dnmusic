import { ES_WEB } from './Glass'

/**
 * La ventana sin barra de título: quién la arrastra.
 *
 * En el escritorio la barra de título del sistema está apagada
 * (`titleBarStyle: 'hidden'` en `desktop/src/main.ts`). Los botones de
 * minimizar, maximizar y cerrar los sigue poniendo el sistema, **flotando sobre
 * la página**, así que la app llega hasta el borde de arriba y el cromo se
 * apoya encima: no hay ninguna fila reservada. Antes sí la había —una franja de
 * 38px como primer hijo del árbol— y se leía como una banda negra muerta
 * cruzando toda la ventana, con la app empezando debajo. El cromo va **sobre**
 * el layout, no adentro.
 *
 * Lo que sí hay que declarar es desde dónde se arrastra, porque sin barra de
 * título nadie lo hace y la ventana queda clavada. Eso lo pone el encabezado de
 * la barra lateral —el mismo lugar del que se arrastra Música para Mac— con
 * `dn-arrastrar`, y sus controles se salen con `dn-no-arrastrar`: una zona de
 * arrastre se come el click de todo lo que tenga adentro.
 *
 * `navigator.windowControlsOverlay` existe **únicamente** cuando el overlay
 * está activo, que es exactamente cuando hay botones flotando y una ventana sin
 * marco. En el navegador, en la app instalada como PWA y en el teléfono no hay
 * nada que arrastrar y estas clases quedan vacías.
 */
type ControlesDeVentana = { visible: boolean }

function hayControlesPropios(): boolean {
  if (!ES_WEB || typeof navigator === 'undefined') return false
  return Boolean((navigator as { windowControlsOverlay?: ControlesDeVentana }).windowControlsOverlay)
}

/** Si la ventana dibuja su propio cromo. */
export const HAY_BANDA_VENTANA = hayControlesPropios()

/** La clase de la zona desde la que se arrastra la ventana. Vacía si no aplica. */
export const ARRASTRE_VENTANA = HAY_BANDA_VENTANA ? 'dn-arrastrar' : ''

/** La de un control que vive adentro de esa zona y tiene que seguir recibiendo el click. */
export const SIN_ARRASTRE = HAY_BANDA_VENTANA ? 'dn-no-arrastrar' : ''

/**
 * La franja de arrastre de las pantallas **sin barra lateral**: el acceso y las
 * de link compartido. Sin esto, la ventana queda clavada antes de iniciar
 * sesión — que es justo cuando alguien la abre por primera vez y quiere
 * moverla. Va absoluta y no ocupa alto; arriba, donde flotan los botones, no
 * hay nada de la app.
 */
export const ARRASTRE_SUPERIOR = HAY_BANDA_VENTANA ? 'dn-arrastre-superior' : ''
