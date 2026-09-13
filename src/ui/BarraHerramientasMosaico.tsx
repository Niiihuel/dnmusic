import { View } from 'react-native'
import { IconButton } from './IconButton'
import { Menu } from './Menu'
import { ICON_COLOR, IconBack, IconMore, IconPalette, IconPlus, IconType } from './icons'

/** Herramientas de edición; la confirmación pertenece a Editar perfil. */
export function BarraHerramientasMosaico({ ocupado, onTema, onFuente, onAgregar, onEditor }: {
  ocupado: boolean; onTema?: () => void; onFuente?: () => void; onAgregar: () => void; onEditor: () => void
}) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
    {onTema || onFuente ? <View pointerEvents={ocupado ? 'none' : 'auto'} style={{ opacity: ocupado ? 0.5 : 1 }}>
      <Menu label="Herramientas del mosaico" tooltip="Herramientas" triggerSymbol="ellipsis.circle"
        items={[
          ...(onTema ? [{ label: 'Tema del perfil', disabled: ocupado, onPress: () => { if (!ocupado) onTema() }, icon: <IconPalette size={17} color={ICON_COLOR.foreground} />, sfSymbol: 'paintpalette' as const }] : []),
          ...(onFuente ? [{ label: 'Tipografía del perfil', disabled: ocupado, onPress: () => { if (!ocupado) onFuente() }, icon: <IconType size={17} color={ICON_COLOR.foreground} />, sfSymbol: 'textformat' as const }] : []),
        ]}
        trigger={<View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#242424' }}><IconMore size={21} color={ICON_COLOR.foreground} /></View>} />
    </View> : null}
    <IconButton label="Agregar una pieza" symbol="plus" disabled={ocupado} onPress={onAgregar} variant="primary" lado={48} size={22}
      icon={<IconPlus size={22} color={ICON_COLOR.onPrimary} strokeWidth={2.4} />} />
    <IconButton label="Volver al editor de perfil" symbol="chevron.left" disabled={ocupado} onPress={onEditor} variant="glass"
      icon={<IconBack size={16} color={ICON_COLOR.foreground} />} />
  </View>
}
