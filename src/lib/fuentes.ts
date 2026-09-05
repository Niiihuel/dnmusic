import { useFonts } from 'expo-font'
import type { TextStyle } from 'react-native'

/**
 * Las tipografías de las piezas de texto del perfil.
 *
 * Es la otra mitad de «vestir» una pieza (ver `lib/tema`): el tema le da el
 * color, la fuente le da la voz. Un encabezado en una serif de revista no
 * dice lo mismo que en una manuscrita, y eso es exactamente lo que Airbuds
 * deja elegir en su Space.
 *
 * **Seis, con personalidad distinta, y una sola variante cada una.** Vienen
 * de Google Fonts, empaquetadas con la app (`@expo-google-fonts/*`): así se
 * ven igual en iOS, en la web y en el escritorio, y sin red. Se importa el
 * archivo puntual y no el índice del paquete, que arrastraría todos los pesos
 * al bundle. Una variante por familia es lo que mantiene el costo bajo —unos
 * 60–200 KB cada una— y lo que evita la trampa de iOS con los pesos: con un
 * solo archivo cargado, `fontWeight` tiene que ir en `normal`, porque el
 * archivo ya es del peso que se ve.
 *
 * La interfaz de la app no cambia de tipografía: esto es contenido de la
 * persona, como su tema y su fondo. Por eso vive en `estilo.fuente` de la
 * vitrina y no en `docs/DESIGN.md`. Un id que el cliente no conozca cae a la
 * del sistema, como los temas caen al vidrio.
 */
export type Fuente = {
  id: string
  nombre: string
  /** Cómo se llama la familia una vez cargada: lo que va en `fontFamily`. */
  familia: string
  /** Qué dice de sí misma, para la hoja de elegir. */
  detalle: string
  /** Ajuste de tamaño respecto de la del sistema: una condensada se ve chica. */
  escala: number
}

export const FUENTES: Fuente[] = [
  { id: 'revista', nombre: 'Revista', familia: 'PlayfairDisplay_700Bold', detalle: 'Serif de tapa, elegante', escala: 1 },
  { id: 'redonda', nombre: 'Redonda', familia: 'Nunito_800ExtraBold', detalle: 'Amable y gordita', escala: 1 },
  { id: 'maquina', nombre: 'Máquina', familia: 'SpaceMono_700Bold', detalle: 'Monoespaciada, de código', escala: 0.92 },
  { id: 'manuscrita', nombre: 'Manuscrita', familia: 'Caveat_700Bold', detalle: 'A mano alzada', escala: 1.25 },
  { id: 'cartel', nombre: 'Cartel', familia: 'BebasNeue_400Regular', detalle: 'Condensada, de afiche', escala: 1.2 },
  { id: 'retro', nombre: 'Retro', familia: 'Righteous_400Regular', detalle: 'Redondeada, años setenta', escala: 1 },
]

/* Los archivos, uno por familia. Los `require` van con la ruta literal:
   el empaquetador copia solo lo que puede rastrear. */
const ARCHIVOS: Record<string, number> = {
  PlayfairDisplay_700Bold: require('@expo-google-fonts/playfair-display/700Bold/PlayfairDisplay_700Bold.ttf'),
  Nunito_800ExtraBold: require('@expo-google-fonts/nunito/800ExtraBold/Nunito_800ExtraBold.ttf'),
  SpaceMono_700Bold: require('@expo-google-fonts/space-mono/700Bold/SpaceMono_700Bold.ttf'),
  Caveat_700Bold: require('@expo-google-fonts/caveat/700Bold/Caveat_700Bold.ttf'),
  BebasNeue_400Regular: require('@expo-google-fonts/bebas-neue/400Regular/BebasNeue_400Regular.ttf'),
  Righteous_400Regular: require('@expo-google-fonts/righteous/400Regular/Righteous_400Regular.ttf'),
}

/**
 * Carga las seis al arrancar. No bloquea nada: mientras llegan, las piezas se
 * dibujan con la del sistema y cambian solas — es un lujo, no un requisito.
 * Va en la raíz de la app (`app/_layout.tsx`) para cargarlas una vez.
 */
export function useFuentesDelPerfil(): boolean {
  const [listas] = useFonts(ARCHIVOS)
  return listas
}

export function fuenteDe(id: string | null | undefined): Fuente | null {
  if (!id) return null
  return FUENTES.find((f) => f.id === id) ?? null
}

/**
 * El estilo de texto de una fuente elegida, para sumar al de la pieza.
 *
 * `fontWeight: 'normal'` a propósito: el archivo cargado ya es del peso que
 * se ve, y pedir negrita encima haría que iOS busque «Familia-Bold», no la
 * encuentre y caiga a la del sistema — la fuente elegida desaparecería justo
 * en los textos en negrita, que son casi todos.
 */
export function estiloDeFuente(id: string | null | undefined, tamano: number): TextStyle | null {
  const f = fuenteDe(id)
  if (!f) return null
  return { fontFamily: f.familia, fontWeight: 'normal', fontSize: Math.round(tamano * f.escala) }
}
