import { Host, Picker, Text } from '@expo/ui/swift-ui'
import { accessibilityLabel, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers'
import type { SegmentadoProps } from './Segmentado.types'

/**
 * El control segmentado **del sistema**: un `Picker` de SwiftUI con estilo
 * segmentado. Es el mismo que usan los Ajustes de iOS, con su animación del
 * elegido, su respuesta háptica y el material que le toque al tema oscuro.
 * Metro elige este archivo en el iPhone; el resto de las plataformas dibuja el
 * de `Segmentado.tsx`.
 */
export function Segmentado<T extends string>({ value, options, onChange, label }: SegmentadoProps<T>) {
  return (
    <Host colorScheme="dark" matchContents={{ vertical: true }} style={{ width: '100%' }}>
      <Picker
        selection={value}
        onSelectionChange={(v) => onChange(v as T)}
        modifiers={[pickerStyle('segmented'), accessibilityLabel(label)]}
      >
        {options.map((o) => (
          <Text key={o.value} modifiers={[tag(o.value)]}>
            {o.label}
          </Text>
        ))}
      </Picker>
    </Host>
  )
}
