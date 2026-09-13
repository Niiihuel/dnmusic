/**
 * Las colecciones de la vidriera: marcos y efectos que van juntos porque se
 * parecen, como las colecciones de la tienda de Discord («Arcade», «Fantasía
 * oscura», «Invierno»…). Cada una tiene un nombre, un lema y sus piezas, en
 * el orden en que se muestran; una pieza puede estar en más de una.
 *
 * Es una lista a mano, y esa es la idea: una colección se cura, no se
 * calcula. Las familias (`FAMILIAS_MARCO`) siguen existiendo para filtrar;
 * las colecciones son para **recorrer**.
 *
 * Los ids pueden ser marcos dibujados, marcos del catálogo en imagen o
 * efectos; lo que no exista en esta versión simplemente no se dibuja.
 */
export type Coleccion = {
  id: string
  nombre: string
  lema: string
  marcos: string[]
  efectos: string[]
  /** La placa de nombre de la colección (`ui/Placas`). */
  placas: string[]
  /** La tipografía del logo de la colección en la tienda (`lib/fuentes`); sin ella, la del sistema. */
  fuente?: string
  /**
   * Los dos tonos del banner de la colección en la tienda, de la misma
   * escala que `marcoBase` (Tailwind v4, 300 y 800). Van muy diluidos sobre
   * la placa: tiñen, no pintan — la interfaz sigue acromática y el color es
   * de la colección, como la tapa de un disco.
   */
  tonos: [string, string]
}
