import { useFonts } from 'expo-font'
import type { TextStyle } from 'react-native'

/** Fuentes empaquetadas para todo el perfil, disponibles también sin red.
 * `profiles.fuente` se comparte con quienes visitan el perfil; FuentePerfil
 * conserva los tamaños de cada texto y aplica la familia elegida en conjunto.
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
  { id: 'editorial', nombre: 'Editorial', familia: 'Lora_600SemiBold', detalle: 'Serif cálida y legible', escala: 1 },
  { id: 'geometrica', nombre: 'Geométrica', familia: 'Montserrat_600SemiBold', detalle: 'Líneas limpias y contemporáneas', escala: 0.96 },
  { id: 'urbana', nombre: 'Urbana', familia: 'Oswald_500Medium', detalle: 'Alta y compacta', escala: 1.08 },
  { id: 'caligrafica', nombre: 'Caligráfica', familia: 'Pacifico_400Regular', detalle: 'Cursiva fluida y expresiva', escala: 1 },
  { id: 'suave', nombre: 'Suave', familia: 'Quicksand_600SemiBold', detalle: 'Redondeada y ligera', escala: 1 },
  { id: 'clasica', nombre: 'Clásica', familia: 'CormorantGaramond_600SemiBold', detalle: 'Serif de libro', escala: 1.12 },
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
  Lora_600SemiBold: require('@expo-google-fonts/lora/600SemiBold/Lora_600SemiBold.ttf'),
  Montserrat_600SemiBold: require('@expo-google-fonts/montserrat/600SemiBold/Montserrat_600SemiBold.ttf'),
  Oswald_500Medium: require('@expo-google-fonts/oswald/500Medium/Oswald_500Medium.ttf'),
  Pacifico_400Regular: require('@expo-google-fonts/pacifico/400Regular/Pacifico_400Regular.ttf'),
  Quicksand_600SemiBold: require('@expo-google-fonts/quicksand/600SemiBold/Quicksand_600SemiBold.ttf'),
  CormorantGaramond_600SemiBold: require('@expo-google-fonts/cormorant-garamond/600SemiBold/CormorantGaramond_600SemiBold.ttf'),
}

/** SwiftUI Font.custom no resuelve los alias que expo-font agrega a React Native.
 * Son los nombres PostScript (nameID 6) de los TTF empaquetados, no sus filenames. */
const NOMBRES_SWIFTUI: Record<string, string> = {
  PlayfairDisplay_700Bold: 'PlayfairDisplay-Bold',
  Nunito_800ExtraBold: 'Nunito-ExtraBold',
  SpaceMono_700Bold: 'SpaceMono-Bold',
  Caveat_700Bold: 'Caveat-Bold',
  BebasNeue_400Regular: 'BebasNeue-Regular',
  Righteous_400Regular: 'Righteous-Regular',
  Lora_600SemiBold: 'Lora-SemiBold',
  Montserrat_600SemiBold: 'Montserrat-SemiBold',
  Oswald_500Medium: 'Oswald-Medium',
  Pacifico_400Regular: 'Pacifico-Regular',
  Quicksand_600SemiBold: 'Quicksand-SemiBold',
  CormorantGaramond_600SemiBold: 'CormorantGaramond-SemiBold',
}

export function familiaSwiftUI(alias: string | undefined): string | undefined {
  return alias ? NOMBRES_SWIFTUI[alias] ?? alias : undefined
}

/** Expo comparte la carga: suscribirse en la hoja no vuelve a descargar los TTF. */
export function useEstadoFuentesDelPerfil() {
  return useFonts(ARCHIVOS)
}

/**
 * Carga el catálogo al arrancar. No bloquea nada: mientras llegan, las piezas se
 * dibujan con la del sistema y cambian solas — es un lujo, no un requisito.
 * Va en la raíz de la app (`app/_layout.tsx`) para cargarlas una vez.
 */
export function useFuentesDelPerfil(): boolean {
  const [listas] = useEstadoFuentesDelPerfil()
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
