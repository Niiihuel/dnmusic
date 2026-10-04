import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { ExpandableButtonProps } from './ExpandableButton.types'

/** Respaldo nativo; los botones de iOS existentes siguen usando SwiftUI. */
export function ExpandableButton({ icon, label, accessibilityLabel, disabled, busy, selected,
  size = 44, onPress, expanded, defaultExpanded = false, onExpandedChange,
}: ExpandableButtonProps) {
  const [localExpanded, setLocalExpanded] = useState(defaultExpanded)
  const isExpanded = expanded ?? localExpanded
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}
    accessibilityState={{ disabled, busy, selected, expanded: onPress ? undefined : isExpanded }}
    disabled={disabled} className="flex-row items-center rounded-full bg-muted"
    onPress={() => {
      if (onPress) { onPress(); return }
      const next = !isExpanded
      if (expanded === undefined) setLocalExpanded(next)
      onExpandedChange?.(next)
    }}>
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
    {isExpanded || onPress ? <Text className="pr-4 text-foreground text-footnote font-medium">{label}</Text> : null}
  </Pressable>
}
