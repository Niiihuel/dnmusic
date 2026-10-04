import { Dialogo } from './Dialogo'
import { EncabezadoHoja, BotonHoja } from './EncabezadoHoja'
import { useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { Menu, type MenuItem } from './Menu'
import { SearchField } from './SearchField'
import { IconCheck, IconChevronDown, IconClose } from './icons'
const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

function MenuSelector({ label, texto, items }: { label: string; texto: string; items: MenuItem[] }) {
  return <Menu label={label} items={items} trigger={
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#242424' }}>
      <Text numberOfLines={1} style={s.texto}>{texto}</Text><IconChevronDown size={14} color="#aaa" />
    </View>} />
}
export function SelectorCatalogo({ etiqueta, valor, opciones, onChange }: { etiqueta: string; valor: string; opciones: { id: string; nombre: string }[]; onChange: (id: string) => void }) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const resultados = opciones.filter(o => normalizar(o.nombre).includes(normalizar(busqueda)))
  const cerrar = () => { setAbierto(false); setBusqueda('') }
  const contenido = (<>
          {opciones.length > 8 ? <SearchField value={busqueda} onChangeText={setBusqueda} placeholder="Buscar colección" /> : null}
          <FlatList data={resultados} keyExtractor={o => o.id} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }}
            ListEmptyComponent={<Text style={s.secundario}>No encontramos esa colección.</Text>}
            renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityState={{ selected: valor === item.id }} onPress={() => { onChange(item.id); cerrar() }}
              style={{ minHeight: 48, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: valor === item.id ? '#353535' : 'transparent', borderRadius: 10 }}>
              <Text style={[s.texto, { flexShrink: 1 }]}>{item.nombre}</Text>{valor === item.id ? <IconCheck size={16} color="#fff" /> : null}
            </Pressable>} />
  </>)
  if (opciones.length <= 8) return <MenuSelector label={etiqueta} texto={opciones.find(o => o.id === valor)?.nombre ?? etiqueta}
    items={opciones.map(o => ({ label: o.nombre, selected: o.id === valor, onPress: () => onChange(o.id) }))} />
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`${etiqueta}: ${opciones.find(o => o.id === valor)?.nombre}`} accessibilityState={{ expanded: abierto }} onPress={() => setAbierto(true)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#242424', flexShrink: 1 }}>
      <Text numberOfLines={1} style={[s.texto, { flexShrink: 1 }]}>{opciones.find(o => o.id === valor)?.nombre}</Text><IconChevronDown size={14} color="#aaa" />
    </Pressable>
    <Dialogo titulo={etiqueta} ancho={440} contenidoPC={<><EncabezadoHoja titulo={etiqueta} izquierda={<BotonHoja onPress={cerrar} />} /><View style={{ paddingHorizontal: 20, paddingBottom: 20, gap: 12, flexShrink: 1 }}>{contenido}</View></>} transparent visible={abierto} animationType="fade" onRequestClose={cerrar}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#0009' }}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Cerrar filtros" onPress={cerrar} />
        <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 440, maxHeight: '80%', backgroundColor: '#202020', borderRadius: 20, padding: 16, gap: 12 }}>
          <View style={s.entre}><Text style={s.titulo}>{etiqueta}</Text><Pressable accessibilityRole="button" accessibilityLabel="Cerrar selector" onPress={cerrar} style={s.redondo}><IconClose size={18} color="#fff" /></Pressable></View>
          {contenido}
        </View>
      </View>
    </Dialogo>
  </>
}
const s = StyleSheet.create({
  entre: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  redondo: { width: 44, height: 44, borderRadius: 24, backgroundColor: '#242424', alignItems: 'center', justifyContent: 'center' },
  titulo: { color: '#fff', fontSize: 22, fontWeight: '700' },
  texto: { color: '#eee', fontSize: 13, fontWeight: '500' },
  secundario: { color: '#aaa', fontSize: 12, lineHeight: 18 },
})
