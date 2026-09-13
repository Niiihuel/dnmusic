import { Host, Picker, Text } from '@expo/ui/swift-ui'
import { accessibilityLabel, frame, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers'
import type { PestanaPerfil } from './PestanasPerfil'

export function SelectorPestanasPerfil({ activa, onCambiar }: {
  activa: PestanaPerfil | null; onCambiar: (pestana: PestanaPerfil) => void
}) {
  return <Host matchContents={{ vertical: true }} style={{ width: 220, minHeight: 44 }} colorScheme="dark">
    <Picker selection={activa} onSelectionChange={(valor) => { if (valor === 'reciente' || valor === 'space') onCambiar(valor) }}
      modifiers={[pickerStyle('segmented'), frame({ minHeight: 44 }), accessibilityLabel('Sección del perfil')]}>
      <Text modifiers={[tag('reciente')]}>Reciente</Text>
      <Text modifiers={[tag('space')]}>Space</Text>
    </Picker>
  </Host>
}
