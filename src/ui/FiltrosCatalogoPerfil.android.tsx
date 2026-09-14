import { ScrollView, View, useWindowDimensions } from 'react-native'
import { SegmentedButton, SingleChoiceSegmentedButtonRow, Text } from '@expo/ui/jetpack-compose'
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers'
import { AndroidHost, androidAccessibility, ANDROID_COLORS as color } from './AndroidHost'
import { SearchField } from './SearchField'
import { IconButton } from './IconButton'
import { Menu } from './Menu'
import type { FiltrosCatalogoPerfilProps } from './FiltrosCatalogoPerfil.types'

const etiquetas: Record<string, string> = { marco: 'Avatar', efecto: 'Efectos', placa: 'Nombre', marcoPerfil: 'Perfil', paquete: 'Packs' }

/** Material categories stay in one row; larger fonts scroll instead of clipping labels. */
export function FiltrosCatalogoPerfil(props: FiltrosCatalogoPerfilProps) {
  const { width, fontScale } = useWindowDimensions()
  const ancho = Math.max(width - 32, props.tipos.length * 80 * fontScale)
  const nombreColeccion = props.colecciones.find(c => c.id === props.coleccion)?.nombre ?? 'Todas las colecciones'
  return <>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
      <AndroidHost matchContents={{ vertical: true }} style={{ width: ancho, minHeight: 48 }}>
        <SingleChoiceSegmentedButtonRow modifiers={[fillMaxWidth()]}>
          {props.tipos.map(tipo => <SegmentedButton key={tipo.id} selected={tipo.id === props.tipo} enabled={!props.ocupado}
            onClick={props.ocupado ? undefined : () => props.onTipo(tipo.id)}
            modifiers={[androidAccessibility(tipo.nombre)]}
            colors={{ activeContainerColor: color.primary, activeContentColor: color.onPrimary,
              inactiveContainerColor: color.surface, inactiveContentColor: color.text,
              activeBorderColor: color.primary, inactiveBorderColor: color.raised,
              disabledActiveContainerColor: color.raised, disabledActiveContentColor: color.muted,
              disabledInactiveContainerColor: color.surface, disabledInactiveContentColor: color.muted }}>
            <SegmentedButton.Label><Text style={{ typography: 'labelMedium' }}>{etiquetas[tipo.id] ?? tipo.nombre}</Text></SegmentedButton.Label>
          </SegmentedButton>)}
        </SingleChoiceSegmentedButtonRow>
      </AndroidHost>
    </ScrollView>
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
