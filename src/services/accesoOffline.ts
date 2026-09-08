import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import type { AccessStatus } from './acceso'

const key = (uid: string) => `dnmusic:acceso-local:v1:${uid}`

/** Recuerdo local para escuchar descargas sin red; nunca autoriza el servidor. */
export async function recordarAccesoLocal(uid: string, access: AccessStatus): Promise<void> {
  try {
    if (access.status === 'approved') await AsyncStorage.setItem(key(uid), uid)
    else await AsyncStorage.removeItem(key(uid))
  } catch { /* Una falla del almacenamiento no cambia el permiso remoto. */ }
}

/** Solo una cuenta ya aprobada en este aparato puede abrir su biblioteca sin conexión. */
export async function accesoSinConexion(uid: string): Promise<AccessStatus | null> {
  try {
    let offline: boolean
    if (Platform.OS === 'web') offline = typeof navigator !== 'undefined' && navigator.onLine === false
    else {
      // Un binario anterior sin el módulo no puede declarar que está sin red.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const network = require('expo-network') as typeof import('expo-network')
      const state = await network.getNetworkStateAsync()
      offline = state.isConnected === false || state.isInternetReachable === false
    }
    if (!offline || await AsyncStorage.getItem(key(uid)) !== uid) return null
    // La administración siempre exige una comprobación remota actual.
    return { status: 'approved', is_admin: false }
  } catch { return null }
}
