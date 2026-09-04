import { Modal, Pressable, Text, View } from 'react-native'
import { BORDE_REFERENTE, Glass } from './Glass'

/**
 * Un diálogo de «¿seguro?», para lo que no se deshace.
 *
 * Es el alert de dos botones de iOS, dibujado por nosotros para que sea el
 * mismo en el teléfono, en Android y en la web: el del sistema en web no
 * existe (`window.confirm` es una caja del navegador que ignora el tema) y en
 * Android viene con el color de marca de Material.
 *
 * Convive con `BotonSostener`, que es la otra forma de confirmar de esta app:
 * sostener sirve cuando la acción es **un botón propio** —«Terminar el Jam»—
 * y el gesto puede vivir adentro de él. Acá la acción es el «−» de la esquina
 * de una tarjeta, un disco de 26px que no tiene dónde mostrar una marea que se
 * llena; la pregunta va aparte.
 *
 * Confirmar **no** se destaca: los dos botones son grises y el que borra dice
 * qué borra. Es la regla de `docs/DESIGN.md` para lo destructivo — se apoya en
 * la redacción, no en un color.
 */
export function Confirmar({
  visible,
  titulo,
  mensaje,
  rotulo,
  onCancelar,
  onConfirmar,
}: {
  visible: boolean
  titulo: string
  mensaje: string
  /** Lo que dice el botón que confirma. Que diga qué hace: «Sacar», no «Sí». */
  rotulo: string
  onCancelar: () => void
  onConfirmar: () => void
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancelar}>
      <View className="flex-1 items-center justify-center px-8">
        {/* El velo cierra, como cualquier diálogo del sistema. Va como hermano
            y no envolviendo la tarjeta: un Pressable adentro de otro es en web
            un botón dentro de otro. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancelar"
          onPress={onCancelar}
          className="absolute inset-0"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
        />
        <Glass
          radius={20}
          style={{
            width: '100%',
            maxWidth: 320,
            boxShadow: `0 12px 32px rgba(0,0,0,0.55), ${BORDE_REFERENTE}`,
          }}
        >
          <View className="gap-2 px-5 pt-5">
            <Text className="text-foreground text-center text-[16px] font-bold">{titulo}</Text>
            <Text className="text-muted-foreground text-center text-[13px] leading-5">{mensaje}</Text>
          </View>
          <View className="flex-row gap-2 p-4">
            <Pressable
              accessibilityRole="button"
              onPress={onCancelar}
              className="h-11 flex-1 items-center justify-center rounded-full bg-muted active:opacity-70"
            >
              <Text className="text-foreground text-[14px] font-semibold">Cancelar</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onConfirmar}
              className="h-11 flex-1 items-center justify-center rounded-full bg-muted active:opacity-70"
            >
              <Text className="text-foreground text-[14px] font-semibold">{rotulo}</Text>
            </Pressable>
          </View>
        </Glass>
      </View>
    </Modal>
  )
}
