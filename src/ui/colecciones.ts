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
}

export const COLECCIONES: Coleccion[] = [
  {
    id: 'arcade',
    nombre: 'Arcade',
    lema: 'Ocho bits, dos tonos y todo a saltos.',
    marcos: ['pixeles', 'invasor', 'corazones8bit'],
    efectos: ['lluvia-de-pixeles'],
  },
  {
    id: 'gotico',
    nombre: 'Gótico',
    lema: 'Plata sobre humo: murciélagos, telarañas y velas.',
    marcos: ['murcielagos', 'telarana', 'velas'],
    efectos: ['bandada'],
  },
  {
    id: 'medianoche',
    nombre: 'Después de medianoche',
    lema: 'Plata, órbitas y jardines nocturnos.',
    marcos: ['eclipse', 'astral', 'zarza', 'jardin', 'cromo', 'reliquia'],
    efectos: ['estrellas-fugaces'],
  },
  {
    id: 'tormenta',
    nombre: 'Neón y tormenta',
    lema: 'Luz que zumba y cielo que se parte.',
    marcos: ['neon', 'rayo', 'trazos', 'pulso'],
    efectos: ['lluvia'],
  },
  {
    id: 'cosmos',
    nombre: 'Cosmos',
    lema: 'Órbitas, satélites y auroras.',
    marcos: ['planetas', 'aurora', 'estrellas', 'luna', 'orbita', 'destello', 'saturno', 'lunita', 'estrella-fugaz'],
    efectos: ['estrellas-fugaces'],
  },
  {
    id: 'fiesta',
    nombre: 'Fiesta',
    lema: 'Papelitos, corazones y burbujas.',
    marcos: ['confeti', 'corazones', 'burbujas', 'orejas', 'chispas', 'corazon-brillante', 'fantasma', 'gatito'],
    efectos: ['lluvia-de-confeti'],
  },
  {
    id: 'bosque',
    nombre: 'Bosque de noche',
    lema: 'Lo que crece, cae y brilla cuando oscurece.',
    marcos: ['luciernagas', 'petalos', 'nieve', 'nubes', 'llamas', 'mariposa', 'flor', 'huellas', 'fuego'],
    efectos: ['luciernagas-de-noche', 'nevada'],
  },
  {
    id: 'maquinas',
    nombre: 'Sala de máquinas',
    lema: 'Surcos, barras y corcheas.',
    marcos: ['vinilo', 'ecualizador', 'ondas', 'notas', 'musica', 'auriculares'],
    efectos: [],
  },
  {
    id: 'corte',
    nombre: 'La corte',
    lema: 'Oro, plumas y laureles.',
    marcos: ['corona', 'alas', 'laurel', 'aureola', 'coronita'],
    efectos: [],
  },
  {
    id: 'clasicos',
    nombre: 'Clásicos',
    lema: 'Anillos, para quien quiere marco sin espectáculo.',
    marcos: ['aro', 'pulso', 'orbita', 'trazos', 'destello', 'cromo'],
    efectos: [],
  },
]
