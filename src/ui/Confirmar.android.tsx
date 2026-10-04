import { AlertDialog, Text, TextButton } from '@expo/ui/jetpack-compose'
import { AndroidHost, ANDROID_COLORS as color } from './AndroidHost'
import type { ConfirmarProps } from './Confirmar.types'
import { ANDROID_TYPE } from './androidDesign'

/** Material owns the dialog window, TalkBack and the Android back gesture. */
export function Confirmar({ visible, titulo, mensaje, rotulo, onCancelar, onConfirmar }: ConfirmarProps) {
  if (!visible) return null
  return <AndroidHost matchContents>
    <AlertDialog onDismissRequest={onCancelar} tonalElevation={0}
      colors={{ containerColor: color.surface, titleContentColor: color.text, textContentColor: color.muted }}>
      <AlertDialog.Title><Text style={ANDROID_TYPE.title}>{titulo}</Text></AlertDialog.Title>
      <AlertDialog.Text><Text style={ANDROID_TYPE.body}>{mensaje}</Text></AlertDialog.Text>
      <AlertDialog.DismissButton><TextButton onClick={onCancelar} colors={{ contentColor: color.text }}><Text style={ANDROID_TYPE.body}>Cancelar</Text></TextButton></AlertDialog.DismissButton>
      <AlertDialog.ConfirmButton><TextButton onClick={onConfirmar} colors={{ contentColor: color.error }}><Text style={ANDROID_TYPE.body}>{rotulo}</Text></TextButton></AlertDialog.ConfirmButton>
    </AlertDialog>
  </AndroidHost>
}
