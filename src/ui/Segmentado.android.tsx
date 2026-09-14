import { SegmentedButton, SingleChoiceSegmentedButtonRow, Text } from '@expo/ui/jetpack-compose'
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers'
import { AndroidHost, ANDROID_COLORS, androidAccessibility } from './AndroidHost'
import type { SegmentadoProps } from './Segmentado.types'

export function Segmentado<T extends string>({ value, options, onChange, label }: SegmentadoProps<T>) {
  return <AndroidHost matchContents={{ vertical: true }} style={{ width: '100%', minHeight: 48, flexShrink: 0 }}>
    <SingleChoiceSegmentedButtonRow modifiers={[fillMaxWidth()]}>
      {options.map(option => <SegmentedButton key={option.value} selected={option.value === value} onClick={() => onChange(option.value)}
        colors={{ activeContainerColor: ANDROID_COLORS.primary, activeContentColor: ANDROID_COLORS.onPrimary,
          inactiveContainerColor: ANDROID_COLORS.surface, inactiveContentColor: ANDROID_COLORS.text,
          activeBorderColor: ANDROID_COLORS.primary, inactiveBorderColor: ANDROID_COLORS.raised }}
        modifiers={[androidAccessibility(`${label}: ${option.label}`)]}>
        <SegmentedButton.Label><Text style={{ typography: 'labelLarge' }}>{option.label}</Text></SegmentedButton.Label>
      </SegmentedButton>)}
    </SingleChoiceSegmentedButtonRow>
  </AndroidHost>
}
