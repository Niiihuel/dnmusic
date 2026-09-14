import { useRef, useState } from 'react'
import { Text, View } from 'react-native'
import type { SharedValue } from 'react-native-reanimated'
import { Slider } from '@expo/ui/jetpack-compose'
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers'
import { AndroidHost, ANDROID_COLORS, androidAccessibility } from './AndroidHost'
import { formatClock } from './tiempos'
export { formatClock, formatLength } from './tiempos'

/** Compose conserva el pulgar durante el arrastre; el audio sólo busca al terminar. */
export function SeekBar({ label, progress, elapsedMs, totalMs, onSeek, compact = false, envivo = false }: {
  label: string; progress: number; elapsedMs: number; totalMs: number; onSeek: (fraction: number) => void
  compact?: boolean; envivo?: boolean; posicionMs?: SharedValue<number>
}) {
  const [arrastre, setArrastre] = useState<number | null>(null)
  const ultimo = useRef<number | null>(null)
  const fraccion = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0
  const valor = arrastre ?? fraccion
  return <View style={{ width: '100%' }}>
    <AndroidHost matchContents={{ vertical: true }} style={{ width: '100%', minHeight: 48 }}>
      <Slider min={0} max={1} value={valor}
        colors={{ thumbColor: ANDROID_COLORS.text, activeTrackColor: ANDROID_COLORS.text, inactiveTrackColor: ANDROID_COLORS.raised }}
        modifiers={[fillMaxWidth(), androidAccessibility(envivo ? label : `Posición de ${label}`, `${Math.round(valor * 100)} %`)]}
        onValueChange={next => {
          if (!Number.isFinite(next)) return
          const v = Math.max(0, Math.min(1, next))
          ultimo.current = v; setArrastre(v)
          if (envivo) onSeek(v)
        }}
        onValueChangeFinished={() => {
          const destino = ultimo.current
          ultimo.current = null; setArrastre(null)
          if (!envivo && destino !== null) onSeek(destino)
        }} />
    </AndroidHost>
    {!compact ? <View pointerEvents="none" style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: -2 }}>
      <Text style={{ fontSize: 11, color: ANDROID_COLORS.muted, fontVariant: ['tabular-nums'] }}>{formatClock(arrastre === null ? elapsedMs : arrastre * totalMs)}</Text>
      <Text style={{ fontSize: 11, color: ANDROID_COLORS.muted, fontVariant: ['tabular-nums'] }}>{formatClock(totalMs)}</Text>
    </View> : null}
  </View>
}
