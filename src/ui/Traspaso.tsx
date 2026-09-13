import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { PrimaryButton, GhostButton } from './Button'
import { estadoControlWeb } from './estadoControl'
import { useConfirmacionTraspaso } from './Traspaso.shared'

/** El modal conserva la decisión hasta confirmar el servidor. El cierre y la
 * opción de seguir allá esperan a que termine un envío que ya está en curso. */
export function Traspaso() {
  const { pendiente, ocupado, error, confirmar, cancelar } = useConfirmacionTraspaso()
  if (!pendiente) return null
  return <Modal visible transparent animationType="fade" onRequestClose={cancelar} accessibilityLabel="Traer la música">
    <View className="flex-1 items-center justify-center px-8">
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar sin traer la música"
        {...estadoControlWeb('none')} disabled={ocupado} onPress={cancelar}
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }]} />
      <View style={{ width: '100%', maxWidth: 400, backgroundColor: '#181818', borderRadius: 20,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
        <View className="gap-2 px-6 pb-4 pt-6">
          <Text className="text-foreground text-title3 font-semibold">Traer la música</Text>
          <Text className="text-muted-foreground text-subheadline">
            La escucha está en «{pendiente.nombre}». Podés traerla acá en el segundo por el que va, o dejarla donde está.
          </Text>
          {ocupado ? <Text accessibilityLiveRegion="polite" className="text-muted-foreground text-footnote">
            Esperando que se confirme el cambio de dispositivo.
          </Text> : null}
          {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" className="text-foreground text-footnote">{error}</Text> : null}
        </View>
        <View className="gap-2.5 px-6 pb-6 pt-2">
          <PrimaryButton label="Traer acá" onPress={() => { void confirmar() }} busy={ocupado} />
          <GhostButton label="Seguir allá" onPress={cancelar} disabled={ocupado} />
        </View>
      </View>
    </View>
  </Modal>
}
