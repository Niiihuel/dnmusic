import { Host, ProgressView, Text, VStack } from '@expo/ui/swift-ui'
import { accessibilityLabel, font, foregroundStyle, progressViewStyle, tint } from '@expo/ui/swift-ui/modifiers'

export function BarraDeProgreso({ valor, rotulo }: { valor: number; rotulo?: string }) {
  const fraccion = Number.isFinite(valor) ? Math.max(0, Math.min(1, valor)) : 0
  return <Host matchContents={{ vertical: true }} style={{ width: '100%' }} colorScheme="dark">
    <VStack alignment="leading" spacing={8}>
      <ProgressView value={fraccion} modifiers={[progressViewStyle('linear'), tint('#FFFFFF'), accessibilityLabel(rotulo ?? 'Progreso')]} />
      {rotulo ? <Text modifiers={[font({ textStyle: 'caption' }), foregroundStyle('#B3B3B3')]}>{rotulo}</Text> : null}
    </VStack>
  </Host>
}

export function porciento(fraccion: number): string {
  return `${Math.round(Math.max(0, Math.min(1, Number.isFinite(fraccion) ? fraccion : 0)) * 100)} %`
}
