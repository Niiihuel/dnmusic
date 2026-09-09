import { Platform } from 'react-native'
import Constants from 'expo-constants'
import { nativeApplicationVersion } from 'expo-application'
import { detectarPlataforma, esVersionEstable, type Instalacion } from './politicaActualizacion'

export async function obtenerInstalacion(): Promise<Instalacion> {
  const puente = (globalThis as { dnmusicEscritorio?: { version?: () => Promise<string> } }).dnmusicEscritorio
  const platform = detectarPlataforma(Platform.OS, !!puente, globalThis.navigator?.userAgent)
  let version: unknown
  if (puente) {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      version = await Promise.race([
        puente.version?.(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('El escritorio no respondió con su versión.')), 5000) }),
      ])
    } finally { clearTimeout(timer) }
  } else {
    // En móvil manda el binario: un manifiesto OTA no prueba que se haya instalado otra app.
    version = Platform.OS === 'web' ? Constants.expoConfig?.version : nativeApplicationVersion
  }
  if (!platform || !esVersionEstable(version)) throw new Error('No se pudo identificar una instalación estable de DMusic.')
  return { platform, version }
}
