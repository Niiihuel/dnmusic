import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { TECLADO_FISICO } from '../lib/teclado'

type ConexionWeb = { saveData?: boolean; effectiveType?: string; type?: string; addEventListener?: (event: string, fn: () => void) => void; removeEventListener?: (event: string, fn: () => void) => void }

export function useRedPrecarga(datosPermitidos: boolean): boolean {
  const [permitida, setPermitida] = useState(false)
  useEffect(() => {
    let vivo = true
    const aplicar = (value: boolean) => { if (vivo) setPermitida(value) }
    if (Platform.OS === 'web') {
      const conexion = (navigator as Navigator & { connection?: ConexionWeb }).connection
      const revisar = () => aplicar(navigator.onLine && !conexion?.saveData &&
        !['slow-2g', '2g'].includes(conexion?.effectiveType ?? '') &&
        (datosPermitidos || (TECLADO_FISICO && conexion?.type !== 'cellular')))
      revisar()
      window.addEventListener('online', revisar); window.addEventListener('offline', revisar)
      conexion?.addEventListener?.('change', revisar)
      return () => {
        vivo = false; window.removeEventListener('online', revisar); window.removeEventListener('offline', revisar)
        conexion?.removeEventListener?.('change', revisar)
      }
    }
    let quitar: (() => void) | undefined
    try {
      // El binario anterior puede no incluir el módulo: no habilitar trabajo especulativo.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const red = require('expo-network') as typeof import('expo-network')
      const revisar = (state: import('expo-network').NetworkState) => aplicar(
        state.isConnected === true && state.isInternetReachable !== false &&
        (datosPermitidos || state.type === red.NetworkStateType.WIFI || state.type === red.NetworkStateType.ETHERNET))
      void red.getNetworkStateAsync().then(revisar).catch(() => aplicar(false))
      const sub = red.addNetworkStateListener(revisar)
      quitar = () => sub.remove()
    } catch { aplicar(false) }
    return () => { vivo = false; quitar?.() }
  }, [datosPermitidos])
  return permitida
}
