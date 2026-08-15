import { Platform } from 'react-native'

/**
 * Si quien usa la app tiene un teclado de verdad.
 *
 * Sirve para decidir atajos que solo tienen sentido en una compu: Enter manda
 * el mensaje, Shift+Enter hace un renglón. En un teléfono ese mismo Enter es la
 * tecla de «nueva línea» del teclado en pantalla y robársela dejaría sin forma
 * de escribir dos renglones.
 *
 * Se mira el **puntero**, no el ancho: una ventana angosta en una compu sigue
 * teniendo teclado, y una tablet grande sigue sin tenerlo. `pointer: fine` es
 * lo que distingue un mouse de un dedo, y es la misma consulta que usan los
 * navegadores para decidir el tamaño de los blancos de toque.
 *
 * Se resuelve una sola vez al cargar, como `HAY_VIDRIO`: nadie enchufa un mouse
 * a mitad de una conversación, y volverlo reactivo costaría un listener por
 * campo de texto.
 */
export const TECLADO_FISICO =
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: fine)').matches
