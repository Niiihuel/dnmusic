import { Slider } from '@expo/ui/jetpack-compose'
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers'
import type { AudioParameterProps } from './AudioParameter.types'
import { AudioParameterFrame } from './AudioParameter.shared'
import { AndroidHost, ANDROID_COLORS, androidAccessibility } from './AndroidHost'
import { parameterFromPosition, parameterPosition } from './audioParameterValue'
import { useAudioParameter } from './useAudioParameter'

export function AudioParameter(props: AudioParameterProps) {
  const control = useAudioParameter(props)
  const logarithmic = props.scale === 'log'
  const intervals = (props.max - props.min) / props.step
  return <AudioParameterFrame props={props} {...control}>
    <AndroidHost matchContents={{ vertical: true }} style={{ width: '100%', minHeight: 48 }}>
      <Slider value={logarithmic ? parameterPosition(control.value, props) : control.value}
        min={logarithmic ? 0 : props.min} max={logarithmic ? 1 : Math.max(props.min + props.step, props.max)}
        steps={!logarithmic && Number.isInteger(intervals) && intervals <= 100 ? Math.max(0, intervals - 1) : 0}
        enabled={!control.disabled}
        colors={{ thumbColor: ANDROID_COLORS.text, activeTrackColor: ANDROID_COLORS.text, inactiveTrackColor: ANDROID_COLORS.raised }}
        modifiers={[fillMaxWidth(), androidAccessibility(props.label, props.format(control.value))]}
        onValueChange={value => control.change(logarithmic ? parameterFromPosition(value, props) : value)}
        onValueChangeFinished={control.finish} />
    </AndroidHost>
  </AudioParameterFrame>
}
