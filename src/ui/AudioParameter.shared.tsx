import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { BotonSuperficie } from './BotonSuperficie'
import type { AudioParameterProps } from './AudioParameter.types'

export function AudioParameterFrame({ props, value, disabled, commit, children }: {
  props: AudioParameterProps
  value: number
  disabled: boolean
  commit: (value: number) => void
  children: ReactNode
}) {
  if (props.compact) return <>{children}</>
  return <View style={{ gap: 6, opacity: disabled ? 0.45 : 1 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <Text style={{ color: '#FFFFFF', fontSize: 15, flex: 1 }}>{props.label}</Text>
      <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{props.format(value)}</Text>
    </View>
    {children}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text style={{ color: '#B3B3B3', fontSize: 11, flex: 1, fontVariant: ['tabular-nums'] }}>{props.format(props.min)}</Text>
      <BotonSuperficie accessibilityRole="button" accessibilityLabel={`Reducir ${props.label}, ${props.format(props.step)}`}
        disabled={disabled || value <= props.min} onPress={() => commit(value - props.step)}
        style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#303030', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#FFFFFF', fontSize: 20 }}>−</Text>
      </BotonSuperficie>
      {props.resetValue !== undefined ? <BotonSuperficie accessibilityRole="button"
        accessibilityLabel={`Restablecer ${props.label} a ${props.format(props.resetValue)}`}
        disabled={disabled || value === props.resetValue} onPress={() => commit(props.resetValue!)}
        style={{ minWidth: 62, height: 44, paddingHorizontal: 8, borderRadius: 22, backgroundColor: '#303030', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#B3B3B3', fontSize: 12 }}>Restablecer</Text>
      </BotonSuperficie> : null}
      <BotonSuperficie accessibilityRole="button" accessibilityLabel={`Aumentar ${props.label}, ${props.format(props.step)}`}
        disabled={disabled || value >= props.max} onPress={() => commit(value + props.step)}
        style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#303030', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#FFFFFF', fontSize: 20 }}>+</Text>
      </BotonSuperficie>
      <Text style={{ color: '#B3B3B3', fontSize: 11, flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{props.format(props.max)}</Text>
    </View>
  </View>
}
