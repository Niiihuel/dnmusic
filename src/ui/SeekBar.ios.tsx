import { useRef, useState } from 'react'
import type { SharedValue } from 'react-native-reanimated'
import { Host, Slider } from '@expo/ui/swift-ui'
import { Text, View } from 'react-native'
import { accessibilityLabel, accessibilityValue, frame, tint } from '@expo/ui/swift-ui/modifiers'
import { formatClock } from './tiempos'
export { formatClock, formatLength } from './tiempos'

/** Slider del sistema: arrastre nativo, salto al soltar y volumen en vivo. */
export function SeekBar({ label, progress, elapsedMs, totalMs, onSeek, compact = false, envivo = false }: {
  label: string
  progress: number
  elapsedMs: number
  totalMs: number
  onSeek: (fraction: number) => void
  compact?: boolean
  envivo?: boolean
  posicionMs?: SharedValue<number>
}) {
  const [arrastre, setArrastre] = useState<number | null>(null)
  const editando = useRef(false)
  const ultimo = useRef<number | null>(null)
  const fraccion = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0
  const valor = arrastre ?? fraccion

  return <View style={{ width: '100%' }}>
    <Host ignoreSafeArea="all" style={{ height: 44, width: '100%' }} colorScheme="dark" seedColor="#FFFFFF">
    <Slider min={0} max={1} value={valor}
      modifiers={[frame({ height: 44 }), tint('#FFFFFF'), accessibilityLabel(`Posición de ${label}`), accessibilityValue(`${Math.round(valor * 100)} %`)]}
      onEditingChanged={(activo) => {
        editando.current = activo
        if (activo) ultimo.current = null
        else {
          const destino = ultimo.current
          ultimo.current = null
          setArrastre(null)
          if (!envivo && destino !== null) onSeek(destino)
        }
      }}
      onValueChange={(next) => {
        if (!Number.isFinite(next)) return
        const v = Math.max(0, Math.min(1, next))
        ultimo.current = v
        if (editando.current) setArrastre(v)
        // VoiceOver ajusta sin comenzar un arrastre.
        if (envivo || !editando.current) onSeek(v)
      }} />
    </Host>
    {!compact ? <View pointerEvents="none" style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: -2 }}>
      <Text style={{ fontSize: 11, color: '#B3B3B3', fontVariant: ['tabular-nums'] }}>{formatClock(arrastre === null ? elapsedMs : arrastre * totalMs)}</Text>
      <Text style={{ fontSize: 11, color: '#B3B3B3', fontVariant: ['tabular-nums'] }}>{formatClock(totalMs)}</Text>
    </View> : null}
  </View>
}
