import type { TrackResult } from '../services/music'

/**
 * La canción que se va a recortar, entregada de una pantalla a la otra.
 *
 * El editor de fragmento sabe buscar por su cuenta, y esa es su puerta normal:
 * entrás desde un mensaje y buscás ahí. Pero desde el buscador del perfil ya
 * elegiste cuál querés — mandarte a buscar de nuevo es pedirte dos veces el
 * mismo trabajo, y es lo que se veía como «le doy al + y me vuelve a aparecer
 * el buscador».
 *
 * Va en una variable de módulo y no en un store con suscriptores porque **nadie
 * la mira**: se deja antes de navegar y se levanta una sola vez al llegar. Un
 * store obligaría a limpiarla desde un efecto y a decidir qué pasa si alguien
 * se suscribe tarde, para un dato que vive tres cuadros.
 *
 * Es el mismo puente que ya usan las pestañas y la búsqueda para cruzar entre
 * árboles, en su versión más chica.
 */
let elegida: TrackResult | null = null

/** La deja lista para la pantalla que se va a abrir. */
export function proponerRecorte(track: TrackResult) {
  elegida = track
}

/**
 * La mira sin consumirla.
 *
 * Leer y borrar en el mismo paso parece más prolijo y es frágil: quien la
 * levanta es el inicializador de un `useState`, y React puede invocarlo más de
 * una vez —lo hace en modo estricto, y se reserva el derecho de hacerlo cuando
 * quiera—. La segunda llamada encontraría la entrega ya consumida y la pantalla
 * abriría en el buscador con la canción perdida.
 */
export function leerRecorte(): TrackResult | null {
  return elegida
}

/**
 * La borra, ya recibida.
 *
 * Va aparte y se llama desde un efecto, que corre una sola vez de verdad. Si
 * quedara puesta, volver al editor por la puerta normal —desde un mensaje—
 * abriría con la canción de la vez pasada en vez del buscador.
 */
export function limpiarRecorte() {
  elegida = null
}
