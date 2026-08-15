import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'

/**
 * Quién es este aparato, para la escucha compartida entre dispositivos.
 *
 * El id es un opaco que cada instalación se inventa **una vez** y guarda: no
 * es el id de la sesión de auth a propósito, porque la misma cuenta en el
 * mismo navegador tiene que seguir siendo «la computadora» aunque cierre
 * sesión y vuelva a entrar. No identifica hardware ni viaja a ningún lado más
 * que a la fila de `escuchas` de la propia cuenta.
 */

const CLAVE = 'dispositivo:v1'

let enMemoria: string | null = null

export async function idDispositivo(): Promise<string> {
  if (enMemoria) return enMemoria
  try {
    const guardado = await AsyncStorage.getItem(CLAVE)
    if (guardado) {
      enMemoria = guardado
      return guardado
    }
  } catch {
    // Sin disco se genera uno por sesión: la escucha funciona igual, solo que
    // este aparato aparecerá como «nuevo» la próxima vez.
  }
  const nuevo = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  enMemoria = nuevo
  void AsyncStorage.setItem(CLAVE, nuevo).catch(() => {})
  return nuevo
}

/**
 * Cómo se llama este aparato en el modal y en la barra («Sonando en …»).
 *
 * Sin ninguna librería de dispositivo: el nombre solo tiene que distinguir
 * «la computadora» del «teléfono», que es la decisión que la persona está
 * tomando. En web se mira el user agent porque la web instalada en un iPhone
 * ES un teléfono, no una computadora.
 */
export function nombreDispositivo(): string {
  if (Platform.OS === 'ios') return 'iPhone'
  if (Platform.OS === 'android') return 'Teléfono'
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  return /iPhone|iPad|Android|Mobile/i.test(ua) ? 'Teléfono (web)' : 'Computadora'
}
