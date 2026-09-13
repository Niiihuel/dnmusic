import { useState } from 'react'
import { DisclosureGroup, Host, List, Section, Text, VStack } from '@expo/ui/swift-ui'
import { font, foregroundStyle, frame, listRowBackground, listRowSeparator, listStyle, scrollContentBackground, tint } from '@expo/ui/swift-ui/modifiers'
import type { AjustesNovedadesProps } from './AjustesNovedades'

export function AjustesNovedades({ novedades, piso }: AjustesNovedadesProps) {
  return <Host style={{ flex: 1 }} useViewportSizeMeasurement colorScheme="dark" seedColor="#FFFFFF">
    <List modifiers={[listStyle('insetGrouped'), scrollContentBackground('hidden'), tint('#FFFFFF')]}>
      <Section title="Historial de versiones">
        {novedades.map((novedad, i) => <Version key={novedad.version} novedad={novedad} ultima={i === 0} />)}
      </Section>
      <Text modifiers={[frame({ height: piso }), listRowBackground('clear'), listRowSeparator('hidden')]}>{' '}</Text>
    </List>
  </Host>
}
function Version({ novedad, ultima }: { novedad: AjustesNovedadesProps['novedades'][number]; ultima: boolean }) {
  const [abierta, setAbierta] = useState(ultima)
  return <DisclosureGroup isExpanded={abierta} onIsExpandedChange={setAbierta} modifiers={[listRowBackground('#181818')]}>
    <DisclosureGroup.Label><VStack alignment="leading" spacing={4}>
      <Text modifiers={[font({ textStyle: 'headline' })]}>{novedad.titulo}</Text>
      <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle('#B3B3B3')]}>{`${novedad.version} · ${novedad.fecha}${ultima ? ' · Esta versión' : ''}`}</Text>
    </VStack></DisclosureGroup.Label>
    {novedad.cambios.map((cambio, i) => <Text key={i} modifiers={[font({ textStyle: 'body' }), foregroundStyle('#B3B3B3')]}>{cambio}</Text>)}
  </DisclosureGroup>
}
