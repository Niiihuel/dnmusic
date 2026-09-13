import { isValidElement, type ReactNode } from 'react'
import { View } from 'react-native'
import { Host, Text } from '@expo/ui/swift-ui'
import { accessibilityAddTraits, font, foregroundStyle } from '@expo/ui/swift-ui/modifiers'
import type { SFSymbol } from 'sf-symbols-typescript'
import { IconButton } from './IconButton'
import * as Icons from './icons'
import { BotonLateral as Respaldo } from './CabeceraLateral.shared'

const symbols = new Map<unknown, SFSymbol>([
  [Icons.IconBack, 'chevron.left'], [Icons.IconForward, 'chevron.right'],
  [Icons.IconChevronDown, 'chevron.down'], [Icons.IconChevronUp, 'chevron.up'],
  [Icons.IconCollapseLeft, 'sidebar.left'], [Icons.IconCollapseRight, 'sidebar.right'],
  [Icons.IconExpandRight, 'sidebar.right'], [Icons.IconEye, 'eye'], [Icons.IconEyeOff, 'eye.slash'],
  [Icons.IconNewConversation, 'square.and.pencil'], [Icons.IconPlay, 'play.fill'],
  [Icons.IconClose, 'xmark'], [Icons.IconPlus, 'plus'], [Icons.IconSearch, 'magnifyingglass'],
])

export function CabeceraLateral({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4 }}>
    <Host matchContents={{ vertical: true }} style={{ flex: 1 }} colorScheme="dark">
      <Text modifiers={[font({ textStyle: 'footnote', weight: 'semibold' }), foregroundStyle('#FFFFFF'), accessibilityAddTraits(['isHeader'])]}>{titulo}</Text>
    </Host>{children}
  </View>
}

export function BotonLateral(props: { label: string; onPress: () => void; icono: ReactNode; disabled?: boolean }) {
  const symbol = isValidElement(props.icono) ? symbols.get(props.icono.type) : undefined
  if (!symbol) return <Respaldo {...props} />
  return <IconButton label={props.label} symbol={symbol} onPress={props.onPress} disabled={props.disabled} size={17} muted />
}
