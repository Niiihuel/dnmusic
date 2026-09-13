import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { TECLADO_FISICO } from '../lib/teclado'
import { clasificarRedPrecarga, type RedPrecarga } from '../lib/politicaPrecarga'

type ConexionWeb = { saveData?: boolean; effectiveType?: string; type?: string; addEventListener?: (event: string, fn: () => void) => void; removeEventListener?: (event: string, fn: () => void) => void }

export function useTipoRedPrecarga(datosPermitidos: boolean): RedPrecarga {
  const [permitida, setPermitida] = useState<RedPrecarga>('no')
  useEffect(() => {
    let vivo = true
    const aplicar = (value: RedPrecarga) => { if (vivo) setPermitida(value) }
    if (Platform.OS === 'web') {
      const conexion = (navigator as Navigator & { connection?: ConexionWeb }).connection
      const revisar = () => aplicar(clasificarRedPrecarga({
        conectada: navigator.onLine && conexion?.type !== 'none',
        segura: conexion?.type === 'wifi' || conexion?.type === 'ethernet' || (TECLADO_FISICO && !conexion?.type),
        datosPermitidos, ahorro: conexion?.saveData,
        lenta: ['slow-2g', '2g'].includes(conexion?.effectiveType ?? ''),
      }))
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
      const revisar = (state: import('expo-network').NetworkState) => aplicar(clasificarRedPrecarga({
        conectada: state.isConnected === true && state.isInternetReachable !== false && state.type !== red.NetworkStateType.NONE,
        segura: state.type === red.NetworkStateType.WIFI || state.type === red.NetworkStateType.ETHERNET,
        datosPermitidos,
      }))
      let eventos = 0
      const sub = red.addNetworkStateListener(state => { eventos++; revisar(state) })
      // Un snapshot que llega tarde no debe deshacer un cambio de conectividad.
      void red.getNetworkStateAsync().then(state => { if (!eventos) revisar(state) }).catch(() => { if (!eventos) aplicar('no') })
      quitar = () => sub.remove()
    } catch { aplicar('no') }
    return () => { vivo = false; quitar?.() }
  }, [datosPermitidos])
  return permitida
}

export function useRedPrecarga(datosPermitidos: boolean): boolean {
  return useTipoRedPrecarga(datosPermitidos) !== 'no'
}
