import { Text, View } from 'react-native'
import { CampoMensaje } from './CampoMensaje'
import { IconButton } from './IconButton'
import { IconCheck, IconClose, ICON_COLOR } from './icons'

/** Occupies the existing composer; its parent already follows the keyboard. */
export function MessageEditBar({ text, onChangeText, onCancel, onSave, busy, editable, canSave, error }: {
  text: string; onChangeText: (text: string) => void; onCancel: () => void; onSave: () => void
  busy: boolean; editable: boolean; canSave: boolean; error: string | null
}) {
  return <View testID="message-edit-bar" style={{ gap: 6 }}>
    {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite"
      style={{ color: '#FF6961', paddingHorizontal: 16 }}>{error}</Text> : null}
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, padding: 4, borderRadius: 26, backgroundColor: '#181818' }}>
      <IconButton label="Cancelar edición" symbol="xmark.circle" size={24} disabled={busy} onPress={onCancel}
        icon={<IconClose size={22} color={ICON_COLOR.foreground} />} />
      <View style={{ flex: 1, minWidth: 0, borderRadius: 22, backgroundColor: '#303032', overflow: 'hidden' }}>
        <CampoMensaje value={text} onChangeText={onChangeText} placeholder="Mensaje"
          accessibilityLabel="Editar texto del mensaje" autoFocus editable={!busy && editable} maxLength={2000}
          className="max-h-28 min-h-11 px-4 py-3 text-foreground text-subheadline" />
      </View>
      <IconButton label="Guardar cambios del mensaje" symbol="checkmark" variant="primary" size={20}
        busy={busy} disableWhileBusy disabled={!canSave} onPress={onSave}
        icon={<IconCheck size={20} color={ICON_COLOR.onPrimary} />} />
    </View>
  </View>
}
