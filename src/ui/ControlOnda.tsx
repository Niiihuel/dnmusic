import { useEffect, useState } from 'react'
import { View } from 'react-native'
import type { SharedValue } from 'react-native-reanimated'
import { useAppActiva } from '../lib/appActiva'
import { formatClock } from './tiempos'

export type ControlOndaProps = {
  etiqueta: string
  posicionMs: SharedValue<number>
  desdeMs: number
  duracionMs: number
  activa: boolean
  onSeek: (fraccion: number) => void
  onPreview: (fraccion: number | null) => void
}

/** La tecnología asistiva busca en tiempo real; la pintura sigue en el hilo de UI. */
export function ControlOnda({ etiqueta, posicionMs, desdeMs, duracionMs, activa, onSeek }: ControlOndaProps) {
  const visible = useAppActiva()
  const [tiempo, setTiempo] = useState(0)
  const posicion = () => activa ? Math.max(0, Math.min(duracionMs, posicionMs.value - desdeMs)) : 0
  useEffect(() => {
    if (!visible || !activa) return
    const timer = setInterval(() => {
      const ms = Math.floor(Math.max(0, Math.min(duracionMs, posicionMs.value - desdeMs)) / 1000) * 1000
      setTiempo(prev => prev === ms ? prev : ms)
    }, 500)
    return () => clearInterval(timer)
  }, [visible, activa, posicionMs, desdeMs, duracionMs])
  return <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    accessible accessibilityRole="adjustable" accessibilityLabel={`Posición de ${etiqueta}`}
    accessibilityValue={{ min: 0, max: Math.round(duracionMs / 1000), now: activa ? Math.round(tiempo / 1000) : 0,
      text: `${formatClock(activa ? tiempo : 0)} / ${formatClock(duracionMs)}` }}
    accessibilityActions={[{ name: 'increment', label: 'Avanzar 5 segundos' }, { name: 'decrement', label: 'Retroceder 5 segundos' }]}
    onAccessibilityAction={event => {
      const cambio = event.nativeEvent.actionName === 'increment' ? 5000 : event.nativeEvent.actionName === 'decrement' ? -5000 : 0
      if (cambio && duracionMs > 0) onSeek(Math.max(0, Math.min(1, (posicion() + cambio) / duracionMs)))
    }} />
}
