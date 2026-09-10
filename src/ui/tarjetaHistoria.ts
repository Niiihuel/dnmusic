/**
 * La anatomía de la tarjeta que se comparte, en un solo lugar.
 *
 * La tarjeta se dibuja **dos veces**: una vista de React Native que el teléfono
 * fotografía, y un canvas en la web. Mientras las medidas vivían adentro de
 * cada dibujo, cambiar el diseño era cambiarlo dos veces y descubrir en la
 * cuarta captura que no coincidían. Acá están una vez y las dos las leen.
 *
 * ## Por qué se ve así
 *
 * El referente es la tarjeta que arma Música de Apple para una historia, y la
 * regla que la ordena es la misma de toda la app: **todo alineado a la
 * izquierda contra un margen**. La versión anterior centraba absolutamente
 * todo —rótulo, tapa, título, artista, barra, sello—, y una columna de seis
 * cosas centradas no tiene composición: tiene simetría, que es otra cosa. Con
 * un margen, la tapa y el texto comparten borde y la tarjeta se lee como una
 * pieza y no como una lista de elementos apilados.
 *
 * Lo que **se fue**:
 *
 * - **«AHORA SUENA» en versalitas espaciadas.** Es el mismo vocabulario que
 *   sacamos de los botones (ver `docs/DESIGN.md`): Apple no grita en ningún
 *   control, y un rótulo así arriba de todo se lee como una plantilla gratuita.
 * - **La barra de reproducción falsa**, con su perilla y sus dos relojes
 *   inventados a un 38% de la canción. Era el gesto que decía «esto es música»,
 *   pero decía una mentira —esa canción no está en ese segundo— y la app tiene
 *   una regla sobre eso: nunca mostrar un estado que no es. La tapa, el título
 *   y el artista ya dicen que es música.
 *
 * Lo que **entró** en su lugar es el código escaneable. La documentación de los
 * links compartidos ya marcaba el problema: la historia «es linda y no lleva a
 * ningún lado», así que quien la veía tenía que buscar la canción a mano. Con
 * el código, la foto de una historia vuelve a ser un link — que es exactamente
 * para qué existen los códigos de Spotify.
 */

/** El formato de una historia: 9:16 exacto. */
export const ANCHO = 1080
export const ALTO = 1920

/** El margen contra el que se alinea todo. La tapa lo define: es su ancho. */
export const MARGEN = 110
export const TAPA = ANCHO - MARGEN * 2

/** La firma de arriba: el sello cuadrado y el nombre al lado. */
export const SELLO_Y = 132
export const SELLO_LADO = 68
export const SELLO_RADIO = 19
export const NOMBRE_TAM = 42

/** La tapa, con la sombra que la despega del fondo. */
export const TAPA_Y = 300
export const TAPA_RADIO = 40

/** El bloque de texto, apoyado en el borde izquierdo de la tapa. */
export const TITULO_Y = TAPA_Y + TAPA + 104
export const TITULO_TAM = 74
export const TITULO_INTERLINEA = 84
export const ARTISTA_TAM = 44
/** Cuánto baja el artista respecto de la **última** línea del título. */
export const ARTISTA_SALTO = 26

/** El código escaneable y su leyenda, abajo del todo. */
export const QR_LADO = 208
export const QR_RADIO = 26
/** El respiro blanco alrededor de los módulos, adentro de la placa. */
export const QR_MARGEN = 18
export const QR_Y = ALTO - MARGEN - QR_LADO
export const LEYENDA_TAM = 38
export const LEYENDA_TAM_CHICO = 32

export const LEYENDA = 'Escaneá para escuchar'
export const LEYENDA_PIE = 'en dnmusic'

/** Los grises de la tarjeta. El color lo pone la portada, nunca la paleta. */
export const FONDO = '#0B0B0B'
export const TEXTO = '#FFFFFF'
export const TEXTO_SUAVE = 'rgba(255,255,255,0.68)'
export const TEXTO_TENUE = 'rgba(255,255,255,0.45)'
export const PLACA = '#FFFFFF'

/**
 * Las paradas del velo sobre la portada desenfocada.
 *
 * Más oscuro arriba y abajo que en el medio: arriba tiene que leerse la firma y
 * abajo el título y el código, y la franja del medio queda clara para que el
 * color de la tapa siga estando. Es la viñeta de la portada de un disco.
 */
export const VELO_COLORES = [
  'rgba(0,0,0,0.72)',
  'rgba(0,0,0,0.34)',
  'rgba(0,0,0,0.52)',
  'rgba(0,0,0,0.9)',
] as const
export const VELO_PARADAS = [0, 0.28, 0.62, 1] as const

/** Las mismas paradas emparejadas, que es como las quiere el canvas. */
export const VELO = VELO_PARADAS.map((parada, i) => ({ parada, color: VELO_COLORES[i] }))

/** Cuánto se agranda la portada del fondo para que el desenfoque no deje bordes. */
export const FONDO_ESCALA = 1.4
export const FONDO_OPACIDAD = 0.62
