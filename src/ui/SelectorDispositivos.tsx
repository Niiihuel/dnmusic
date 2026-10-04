import { Dialogo } from './Dialogo'
import { EncabezadoHoja, BotonHoja } from './EncabezadoHoja'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { cerrarSelectorDispositivos, useSelectorDispositivos } from '../state/escucha'
import { usePanelDispositivos } from './Dispositivos.shared'
import { IconButton } from './IconButton'
import { ICON_COLOR, IconCheck, IconClose, IconDispositivo, IconPause } from './icons'
import { PlayingBars } from './PlayingBars'

/** Diálogo vivo: la transferencia conserva la hoja hasta que se vea su resultado. */
export function SelectorDispositivos() {
  const abierto = useSelectorDispositivos()
  const panel = usePanelDispositivos()
  const { height } = useWindowDimensions()
  const contenido = (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}>
      <View className="pb-5 pt-1 gap-2" accessibilityLiveRegion="polite">
        <Text className="text-foreground text-body font-semibold">{panel.resumen}</Text>
        <Text className="text-muted-foreground text-footnote">{panel.detalle}</Text>
      </View>
      <View className="gap-1">
        {panel.filas.map(fila => <Pressable key={fila.id} accessibilityRole="button"
          accessibilityLabel={`${fila.nombre}. ${fila.detalle}`}
          accessibilityState={{ selected: fila.seleccionado, disabled: fila.disabled, busy: fila.busy }}
          disabled={fila.disabled} onPress={() => panel.elegir(fila.id)}
          style={{ minHeight: 72, backgroundColor: fila.seleccionado ? '#292929' : 'transparent', opacity: fila.estado === 'desconectado' ? .6 : 1 }}
          className="flex-row items-center gap-4 rounded-2xl px-4 py-3 hover:bg-muted active:bg-muted">
          <IconDispositivo size={24} color={fila.seleccionado ? ICON_COLOR.foreground : ICON_COLOR.muted} />
          <View className="flex-1 min-w-0 gap-1">
            <Text numberOfLines={1} className={`text-foreground text-subheadline ${fila.seleccionado ? 'font-semibold' : ''}`}>{fila.nombre}</Text>
            <Text className="text-muted-foreground text-caption1">{fila.detalle}</Text>
          </View>
          {fila.busy ? <ActivityIndicator color={ICON_COLOR.foreground} />
            : fila.estado === 'sonando' ? <PlayingBars playing size={16} />
            : fila.estado === 'pausado' ? <IconPause size={16} color={ICON_COLOR.muted} />
            : fila.seleccionado ? <IconCheck size={18} color={ICON_COLOR.muted} /> : null}
        </Pressable>)}
      </View>
      {!panel.filas.some(f => !f.esEste && f.estado !== 'desconectado') ? <Text className="text-muted-foreground text-footnote pt-5">
        Para ver otro dispositivo, abrí DMusic e iniciá sesión con la misma cuenta.
      </Text> : null}
      {panel.mensaje ? <Text accessibilityRole={panel.error ? 'alert' : undefined} accessibilityLiveRegion="polite"
        className={`text-foreground text-footnote pt-5 ${panel.error ? 'font-semibold' : ''}`}>{panel.mensaje}</Text> : null}
    </ScrollView>
  )
  if (!abierto) return <Dialogo titulo="Escuchar en" visible={false} contenidoPC={null} />
  return <Dialogo titulo="Escuchar en" ancho={440} contenidoPC={<><EncabezadoHoja titulo="Escuchar en" izquierda={<BotonHoja onPress={cerrarSelectorDispositivos} />} />{contenido}</>} transparent visible animationType="fade" onRequestClose={cerrarSelectorDispositivos} accessibilityLabel="Escuchar en">
    <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }]}
        accessibilityRole="button" accessibilityLabel="Cerrar el selector de dispositivos" onPress={cerrarSelectorDispositivos} />
      <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 460, maxHeight: Math.max(240, height * .85), backgroundColor: '#181818', borderRadius: 24, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
        <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
          <Text accessibilityRole="header" className="text-foreground text-title3 font-semibold">Escuchar en</Text>
          <IconButton label="Cerrar" symbol="xmark" onPress={cerrarSelectorDispositivos} lado={44} icon={<IconClose size={18} color={ICON_COLOR.muted} />} />
        </View>
        {contenido}
      </View>
    </View>
  </Dialogo>
}
