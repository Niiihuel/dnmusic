import type { TextStyle } from 'react-native'
import apple from './apple.json'

/**
 * La escala de texto de Apple, para donde no llega `className`.
 *
 * La vía normal son las clases —`text-body`, `text-footnote`—, que
 * `tailwind.config.js` arma del **mismo** `apple.json` que se lee acá: una sola
 * fuente y dos lectores, como `novedades.json`. Este módulo existe por los dos
 * lugares donde una clase no sirve:
 *
 *   - Los `Animated.*` de Reanimated, que NativeWind no procesa —un
 *     `Animated.Text className="text-body"` sale sin estilo y sin avisar; es
 *     una de las trampas escritas en docs/DESIGN.md.
 *   - Lo que se dibuja fuera de React: la tarjeta de la historia, el SVG del
 *     código, cualquier cosa que arme estilos a mano.
 *
 * Los nombres son los de Apple —`body`, `footnote`, `caption1`— y no una
 * traducción: son el nombre de la API del sistema, igual que `formSheet` o
 * `backdrop-filter`, y traducirlos rompería la correspondencia con la HIG y con
 * el `Font.TextStyle` de SwiftUI que usa la app en iOS.
 */
export type EstiloTexto = Exclude<keyof typeof apple.texto, `_${string}`>

type Medidas = { size: number; leading: number; tracking: number }

/* Las claves con guión bajo son la procedencia, no medidas: `EstiloTexto` ya
   las deja afuera, y acá alcanza con anotar el tipo para que sobren. */
const MEDIDAS: Record<EstiloTexto, Medidas> = apple.texto

/**
 * Un estilo de texto listo para `style`.
 *
 * `fontWeight` va aparte a propósito: en la escala de Apple el peso no es parte
 * del estilo sino una variante suya —cada uno tiene su «emphasized»—, y en esta
 * app la jerarquía sale sobre todo del peso (docs/DESIGN.md). Escribirlo en el
 * mismo objeto obligaría a un token por combinación.
 */
export function texto(estilo: EstiloTexto): TextStyle {
  const { size, leading, tracking } = MEDIDAS[estilo]
  return { fontSize: size, lineHeight: leading, letterSpacing: tracking }
}

/** La tabla entera, para quien necesite un número suelto. */
export const TEXTO = MEDIDAS

/**
 * Los radios de Apple, nombrados por la pieza.
 *
 * También están como clases (`rounded-menu`, `rounded-card`). Acá abajo, para
 * lo mismo que la tipografía: Reanimated y lo que se dibuja a mano.
 */
export const RADIO = apple.radio as Omit<typeof apple.radio, `_${string}`>

/** Alturas del sistema: el toque de 44, la barra de arriba, la de pestañas. */
export const CONTROL = apple.control as Omit<typeof apple.control, `_${string}`>
