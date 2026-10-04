import { Platform, Text, View } from 'react-native'
import { AudioParameter } from './AudioParameter'
import { IconButton } from './IconButton'
import { ICON_COLOR, IconVolume, IconVolumeOff } from './icons'

const porcentaje = (valor: number) => `${Math.round(valor * 100)} %`

export function VolumenAudio({ value, onChange, onToggleMute, compact = false, angosto = false }: {
  value: number
  onChange: (valor: number) => void
  onToggleMute: () => void
  compact?: boolean
  angosto?: boolean
}) {
  const volumen = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
  const silenciado = volumen === 0
  const lecturaNativa = !compact && Platform.OS !== 'web'
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? 2 : 8, minWidth: 0 }}>
    <IconButton label={silenciado ? 'Devolver el sonido' : 'Silenciar'}
      symbol={silenciado ? 'speaker.slash.fill' : 'speaker.wave.2.fill'} lado={compact ? 36 : 44} size={16}
      onPress={onToggleMute}
      icon={silenciado ? <IconVolumeOff size={16} color={ICON_COLOR.muted} /> : <IconVolume size={16} color={ICON_COLOR.muted} />} />
    <View style={compact ? { width: angosto ? 60 : 88 } : { flex: 1, minWidth: 0 }}>
      <AudioParameter label="Volumen" value={volumen} min={0} max={1} step={0.01} inputScale={0.01}
        unit="%" format={porcentaje} onChange={onChange} resetValue={1} compact={compact || lecturaNativa} />
    </View>
    {lecturaNativa ? <Text style={{ color: '#B3B3B3', fontSize: 12, minWidth: 48, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{porcentaje(volumen)}</Text> : null}
  </View>
}
