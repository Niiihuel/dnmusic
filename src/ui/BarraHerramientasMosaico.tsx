import { Text, View } from 'react-native'
import { BotonVidrio } from './Glass'
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
    <BotonVidrio label="Agregar una pieza" disabled={ocupado} onPress={onAgregar} radius={999}
      tint={ICON_COLOR.foreground} style={{ width: 48, height: 48 }}>
      <IconPlus size={22} color={ICON_COLOR.onPrimary} strokeWidth={2.4} />
    </BotonVidrio>
    <BotonVidrio label="Volver al editor de perfil" disabled={ocupado} onPress={onEditor} radius={999}
      style={{ height: 44, paddingHorizontal: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <IconBack size={16} color={ICON_COLOR.foreground} />
        <Text className="text-foreground text-[13px] font-semibold">Editor</Text>
      </View>
    </BotonVidrio>
  </View>
}
