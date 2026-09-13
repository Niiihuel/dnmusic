import type { ReactNode } from 'react'
import { Host, Image, Text, VStack } from '@expo/ui/swift-ui'
import { accessibilityAddTraits, accessibilityLabel, font, foregroundStyle } from '@expo/ui/swift-ui/modifiers'

export type CabeceraAccesoProps = { titulo: string; detalle?: string; escritorio: boolean }

export function CabeceraAcceso({ titulo, detalle }: CabeceraAccesoProps) {
  return <Host matchContents={{ vertical: true }} style={{ width: '100%' }} colorScheme="dark">
    <VStack alignment="leading" spacing={12}>
      <Image systemName="waveform" size={40} color="#FFFFFF" modifiers={[accessibilityLabel('dnmusic')]} />
      <Text modifiers={[font({ textStyle: 'title2', weight: 'semibold' }), foregroundStyle('#FFFFFF'), accessibilityAddTraits(['isHeader'])]}>{titulo}</Text>
      {detalle ? <Text modifiers={[font({ textStyle: 'subheadline' }), foregroundStyle('#B3B3B3')]}>{detalle}</Text> : null}
    </VStack>
  </Host>
}

export function NotaAcceso({ children }: { children: ReactNode }) {
  return <Host matchContents={{ vertical: true }} style={{ width: '100%' }} colorScheme="dark">
    <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle('#B3B3B3')]}>{children}</Text>
  </Host>
}
