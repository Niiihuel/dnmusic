import { useEffect, useState } from 'react'
import { AppState } from 'react-native'

/**
 * Permite detener animaciones y relojes visuales cuando la app no está activa.
 * El audio de fondo puede mantener el proceso en ejecución: no depender de que
 * el sistema suspenda los timers. La reproducción y los controles de bloqueo
 * usan el motor nativo; los eventos de estado mantienen informado al store.
 */
export function useAppActiva(): boolean {
  const [activa, setActiva] = useState(() => AppState.currentState === 'active')

  useEffect(() => {
    const sub = AppState.addEventListener('change', (estado) => {
      setActiva(estado === 'active')
    })
    return () => sub.remove()
  }, [])

  return activa
}
