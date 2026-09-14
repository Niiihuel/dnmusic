import { Column, LinearProgressIndicator, Text } from '@expo/ui/jetpack-compose'
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers'
import { AndroidHost, ANDROID_COLORS, androidAccessibility } from './AndroidHost'

export function BarraDeProgreso({ valor, rotulo }: { valor: number; rotulo?: string }) {
  const fraccion = Number.isFinite(valor) ? Math.max(0, Math.min(1, valor)) : 0
  return <AndroidHost matchContents={{ vertical: true }} style={{ width: '100%' }}>
    <Column verticalArrangement={{ spacedBy: 8 }} modifiers={[fillMaxWidth()]}>
      <LinearProgressIndicator progress={fraccion} color={ANDROID_COLORS.text} trackColor={ANDROID_COLORS.raised}
        modifiers={[fillMaxWidth(), androidAccessibility(rotulo ?? 'Progreso')]} />
      {rotulo ? <Text color={ANDROID_COLORS.muted} style={{ typography: 'bodySmall' }}>{rotulo}</Text> : null}
    </Column>
  </AndroidHost>
}

export function porciento(fraccion: number): string {
  return `${Math.round(Math.max(0, Math.min(1, Number.isFinite(fraccion) ? fraccion : 0)) * 100)} %`
}
