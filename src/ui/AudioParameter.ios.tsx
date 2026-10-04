import { useRef } from 'react'
import { Host, Slider } from '@expo/ui/swift-ui'
import { accessibilityLabel, accessibilityValue, disabled, frame, tint } from '@expo/ui/swift-ui/modifiers'
import type { AudioParameterProps } from './AudioParameter.types'
import { AudioParameterFrame } from './AudioParameter.shared'
import { parameterFromPosition, parameterPosition } from './audioParameterValue'
import { useAudioParameter } from './useAudioParameter'

export function AudioParameter(props: AudioParameterProps) {
  const control = useAudioParameter(props)
  const editing = useRef(false)
  const logarithmic = props.scale === 'log'
  return <AudioParameterFrame props={props} {...control}>
    <Host ignoreSafeArea="all" colorScheme="dark" style={{ height: 44, width: '100%' }}>
      <Slider value={logarithmic ? parameterPosition(control.value, props) : control.value}
        min={logarithmic ? 0 : props.min} max={logarithmic ? 1 : Math.max(props.min + props.step, props.max)}
        step={logarithmic ? undefined : props.step}
        onEditingChanged={active => { editing.current = active; if (!active) control.finish() }}
        onValueChange={value => {
          const actual = logarithmic ? parameterFromPosition(value, props) : value
          // VoiceOver changes values without beginning a pointer drag.
          if (!editing.current) control.commit(actual)
          else control.change(actual)
        }}
        modifiers={[frame({ height: 44 }), tint('#FFFFFF'), disabled(control.disabled),
          accessibilityLabel(props.label), accessibilityValue(props.format(control.value))]} />
    </Host>
  </AudioParameterFrame>
}
