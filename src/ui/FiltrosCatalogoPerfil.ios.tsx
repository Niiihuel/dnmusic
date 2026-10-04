import { View, useWindowDimensions } from 'react-native'
import { Host, Image, Picker, Text } from '@expo/ui/swift-ui'
import { accessibilityLabel, disabled, font, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers'
import type { SFSymbol } from 'sf-symbols-typescript'
import { SearchField } from './SearchField'
import { IconButton } from './IconButton'
import { Menu } from './Menu'
import type { FiltrosCatalogoPerfilProps } from './FiltrosCatalogoPerfil.types'

const etiquetas: Record<string, { texto: string; symbol: SFSymbol }> = {
  marco: { texto: 'Avatar', symbol: 'person.crop.circle' },
  efecto: { texto: 'Efectos', symbol: 'sparkles' },
  placa: { texto: 'Nombre', symbol: 'textformat.abc' },
  marcoPerfil: { texto: 'Perfil', symbol: 'square.grid.2x2' },
  paquete: { texto: 'Packs', symbol: 'shippingbox' },
}

/** Two compact rows: system categories, then search and secondary actions. */
export function FiltrosCatalogoPerfil(props: FiltrosCatalogoPerfilProps) {
  const { width, fontScale } = useWindowDimensions()
  const iconos = width < 360 || fontScale > 1.2
  const nombreColeccion = props.colecciones.find(c => c.id === props.coleccion)?.nombre ?? 'Todas las colecciones'
  return <>
    <Host colorScheme="dark" ignoreSafeArea="all" matchContents={{ vertical: true }} style={{ width: '100%', minHeight: 32 }}>
      <Picker selection={props.tipo} onSelectionChange={value => { if (!props.ocupado && props.tipos.some(t => t.id === value)) props.onTipo(String(value)) }}
        modifiers={[pickerStyle('segmented'), accessibilityLabel('Tipo de decoración'), disabled(!!props.ocupado)]}>
        {props.tipos.map(tipo => {
          const etiqueta = etiquetas[tipo.id]
          const modifiers = [tag(tipo.id), accessibilityLabel(tipo.nombre)]
          return iconos && etiqueta ? <Image key={tipo.id} systemName={etiqueta.symbol} modifiers={modifiers} /> :
            <Text key={tipo.id} modifiers={[...modifiers, font({ textStyle: 'footnote' })]}>{etiqueta?.texto ?? tipo.nombre}</Text>
        })}
      </Picker>
    </Host>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ flex: 1, minWidth: 0 }}><SearchField density="compact" value={props.buscar} onChangeText={props.onBuscar}
        placeholder="Buscar" accessibilityLabel="Buscar una pieza o colección" /></View>
      <Menu label={`Colección: ${nombreColeccion}`} triggerSymbol={props.coleccion === 'todas' ? 'line.3.horizontal.decrease' : 'line.3.horizontal.decrease.circle.fill'}
        items={props.colecciones.map(c => ({ label: c.nombre, selected: c.id === props.coleccion, disabled: props.ocupado,
          onPress: () => { if (!props.ocupado) props.onColeccion(c.id) } }))} />
      <IconButton label="Ver vista previa del perfil" symbol="eye" onPress={props.onPrevia} />
    </View>
  </>
}
