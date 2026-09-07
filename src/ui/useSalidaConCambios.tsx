import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { useNavigation, usePreventRemove, type NavigationAction } from 'expo-router/react-navigation'
import { Confirmar } from './Confirmar'

/** Protege botón atrás, Escape, gesto de iOS y cierre de la pestaña. */
export function useSalidaConCambios(cambiado: boolean, ocupado = false, alDescartar?: () => void) {
  const navigation = useNavigation()
  const [pendiente, setPendiente] = useState<NavigationAction | null>(null)
  usePreventRemove(cambiado || ocupado, ({ data }) => {
    if (!ocupado) setPendiente(data.action)
  })
  useEffect(() => {
    if (Platform.OS !== 'web' || (!cambiado && !ocupado)) return
    const salir = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', salir)
    return () => window.removeEventListener('beforeunload', salir)
  }, [cambiado, ocupado])
  return <Confirmar visible={!!pendiente} titulo="¿Descartar los cambios?"
    mensaje="Lo que probaste todavía no está guardado. Tu perfil conservará su aspecto anterior."
    rotulo="Descartar" onCancelar={() => setPendiente(null)} onConfirmar={() => {
      const action = pendiente
      setPendiente(null)
      if (action) { alDescartar?.(); navigation.dispatch(action) }
    }} />
}
