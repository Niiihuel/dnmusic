import { useCallback, useState } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { observarLectura } from '../services/lecturaViva'

/** El lector debe ser estable (useCallback). Al volver al perfil pide datos
 * nuevos; al dejarlo o mandar la app al fondo deja de consultar. */
export function useLecturaViva<T>(clave: string, leer: () => Promise<T>, intervalo = 3000): T | null {
  const [resultado, setResultado] = useState<{ clave: string; valor: T | null } | null>(null)
  useFocusEffect(useCallback(() => {
    const lectura = observarLectura(leer, valor => setResultado({ clave, valor }), intervalo)
    lectura.activar(AppState.currentState !== 'background' && AppState.currentState !== 'inactive')
    const sub = AppState.addEventListener('change', estado => {
      if (estado !== 'active') setResultado(null)
      lectura.activar(estado === 'active')
    })
    return () => { lectura.cerrar(); sub.remove(); setResultado(null) }
  }, [clave, leer, intervalo]))
  return resultado?.clave === clave ? resultado.valor : null
}
