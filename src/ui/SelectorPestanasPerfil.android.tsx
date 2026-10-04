import { SegmentedButton, SingleChoiceSegmentedButtonRow, Text } from '@expo/ui/jetpack-compose'
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers'
import { AndroidHost, ANDROID_COLORS as color, androidAccessibility } from './AndroidHost'
import type { PestanaPerfil } from './PestanasPerfil'
import { ANDROID_TYPE } from './androidDesign'

const PESTANAS: { id: PestanaPerfil; rotulo: string }[] = [
  { id: 'reciente', rotulo: 'Reciente' },
  { id: 'space', rotulo: 'Space' },
]

/** Selector Material 3 compacto para cambiar la sección del perfil. */
export function SelectorPestanasPerfil({ activa, onCambiar }: {
  activa: PestanaPerfil | null
  onCambiar: (pestana: PestanaPerfil) => void
}) {
  return <AndroidHost matchContents={{ vertical: true }} style={{ width: 220, minHeight: 48 }}>
    <SingleChoiceSegmentedButtonRow modifiers={[fillMaxWidth()]}>
      {PESTANAS.map(pestana => {
        const seleccionada = activa === pestana.id
        return <SegmentedButton key={pestana.id} selected={seleccionada} onClick={() => onCambiar(pestana.id)}
          colors={{
            activeContainerColor: color.primary,
            activeContentColor: color.onPrimary,
            inactiveContainerColor: color.surface,
            inactiveContentColor: color.text,
            activeBorderColor: color.primary,
            inactiveBorderColor: color.raised,
          }}
          modifiers={[androidAccessibility(`Sección del perfil: ${pestana.rotulo}`, seleccionada ? 'Seleccionada' : undefined)]}>
          <SegmentedButton.Label><Text style={ANDROID_TYPE.body}>{pestana.rotulo}</Text></SegmentedButton.Label>
        </SegmentedButton>
      })}
    </SingleChoiceSegmentedButtonRow>
  </AndroidHost>
}
