import { AlertDialog, Text, TextButton } from '@expo/ui/jetpack-compose'
import { AndroidHost, ANDROID_COLORS as color } from './AndroidHost'
import type { ConfirmarProps } from './Confirmar.types'

/** Material owns the dialog window, TalkBack and the Android back gesture. */
export function Confirmar({ visible, titulo, mensaje, rotulo, onCancelar, onConfirmar }: ConfirmarProps) {
  if (!visible) return null
  return <AndroidHost matchContents>
    <AlertDialog onDismissRequest={onCancelar} tonalElevation={0}
      colors={{ containerColor: color.surface, titleContentColor: color.text, textContentColor: color.muted }}>
      <AlertDialog.Title><Text>{titulo}</Text></AlertDialog.Title>
      <AlertDialog.Text><Text>{mensaje}</Text></AlertDialog.Text>
      <AlertDialog.DismissButton><TextButton onClick={onCancelar} colors={{ contentColor: color.text }}><Text>Cancelar</Text></TextButton></AlertDialog.DismissButton>
      <AlertDialog.ConfirmButton><TextButton onClick={onConfirmar} colors={{ contentColor: color.error }}><Text>{rotulo}</Text></TextButton></AlertDialog.ConfirmButton>
    </AlertDialog>
  </AndroidHost>
}
