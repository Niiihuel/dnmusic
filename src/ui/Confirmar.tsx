import { Dialogo } from './Dialogo'
import { EncabezadoHoja, BotonHoja } from './EncabezadoHoja'
import { estadoControlWeb } from './estadoControl'
import type { ConfirmarProps } from './Confirmar.types'
import { Pressable, Text, View } from 'react-native'
import { BORDE_REFERENTE, Glass } from './Glass'

/**
 * Un diálogo de «¿seguro?», para lo que no se deshace.
 *
 * Es el alert de dos botones de iOS, dibujado por nosotros para Android y web. En iOS se usa el alert del sistema
 * (`Confirmar.ios.tsx`): el del sistema en web no
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
}: ConfirmarProps) {
  const acciones = (
    <View className="flex-row gap-2 p-4">
      <Pressable
        accessibilityRole="button"
        onPress={onCancelar}
        className="h-11 flex-1 items-center justify-center rounded-full bg-muted active:opacity-70"
      >
        <Text className="text-foreground text-subheadline font-semibold">Cancelar</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={onConfirmar}
        className="h-11 flex-1 items-center justify-center rounded-full bg-muted active:opacity-70"
      >
        <Text className="text-foreground text-subheadline font-semibold">{rotulo}</Text>
      </Pressable>
    </View>
  )
  return (
    <Dialogo titulo={titulo} ancho={400} contenidoPC={<><EncabezadoHoja titulo={titulo} izquierda={<BotonHoja onPress={onCancelar} />} /><View className="px-5 pb-1"><Text className="text-muted-foreground text-subheadline leading-6">{mensaje}</Text></View>{acciones}</>} visible={visible} transparent animationType="fade" onRequestClose={onCancelar}>
      <View className="flex-1 items-center justify-center px-8">
        {/* El velo cierra, como cualquier diálogo del sistema. Va como hermano
            y no envolviendo la tarjeta: un Pressable adentro de otro es en web
            un botón dentro de otro. */}
        <Pressable
          accessibilityRole="button"
          {...estadoControlWeb('none')}
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
            <Text className="text-foreground text-center text-callout font-bold">{titulo}</Text>
            <Text className="text-muted-foreground text-center text-footnote leading-5">{mensaje}</Text>
          </View>
          {acciones}
        </Glass>
      </View>
    </Dialogo>
  )
}
