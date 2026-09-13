import { Pressable, Text, View } from 'react-native'
import type { SegmentadoProps } from './Segmentado.types'

/**
 * Un control segmentado: elegir **una** de dos a cuatro opciones que se ven
 * todas a la vez.
 *
 * Es el `UISegmentedControl` de iOS —«Portada / Reproductor / Ambas»— y no una
 * fila de chips sueltos: los chips se leen como filtros que se prenden y se
 * apagan de a varios, y acá la pregunta tiene una sola respuesta. En iOS lo
 * dibuja el sistema (`Segmentado.ios.tsx`); acá es la píldora de siempre, con
 * el elegido en el blanco del acento, como el resto de los estados activos.
 */
export function Segmentado<T extends string>({ value, options, onChange, label }: SegmentadoProps<T>) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      className="flex-row rounded-full bg-card p-1"
    >
      {options.map((o) => {
        const activo = o.value === value
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: activo }}
            onPress={() => onChange(o.value)}
            className={`min-h-9 flex-1 items-center justify-center rounded-full px-3 ${
              activo ? 'bg-primary' : 'active:bg-muted'
            }`}
          >
            <Text
              className={`text-footnote font-semibold ${
                activo ? 'text-primary-foreground' : 'text-muted-foreground'
              }`}
            >
              {o.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
