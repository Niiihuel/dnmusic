import { useEffect, useRef } from 'react'
import { Alert } from 'react-native'
import type { ConfirmarProps } from './Confirmar.types'

/** iOS administra el material, Dynamic Type, VoiceOver y las acciones del alert. */
export function Confirmar({ visible, titulo, mensaje, rotulo, onCancelar, onConfirmar }: ConfirmarProps) {
  const presentado = useRef(false)
  useEffect(() => {
    if (!visible) { presentado.current = false; return }
    if (presentado.current) return
    presentado.current = true
    Alert.alert(titulo, mensaje, [
      { text: 'Cancelar', style: 'cancel', isPreferred: true, onPress: onCancelar },
      { text: rotulo, style: 'destructive', onPress: onConfirmar },
    ], { userInterfaceStyle: 'dark' })
  }, [visible, titulo, mensaje, rotulo, onCancelar, onConfirmar])
  return null
}
