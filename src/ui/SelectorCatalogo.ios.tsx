import { useState } from 'react'
import { Modal, View } from 'react-native'
import { Button, Host, HStack, Image, List, Menu, Spacer, Text } from '@expo/ui/swift-ui'
import { accessibilityAddTraits, accessibilityLabel, buttonStyle, controlSize, listRowBackground, listStyle, scrollContentBackground } from '@expo/ui/swift-ui/modifiers'
import { AccionSocial, CabeceraSocial } from './Social'
import { SearchField } from './SearchField'

const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
type Props = { etiqueta: string; valor: string; opciones: { id: string; nombre: string }[]; onChange: (id: string) => void }

/** The modal owns one native List; search and close never persist the profile draft. */
export function SelectorCatalogo({ etiqueta, valor, opciones, onChange }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const texto = opciones.find(o => o.id === valor)?.nombre ?? etiqueta
  const cerrar = () => { setAbierto(false); setBusqueda('') }
  const elegir = (id: string) => { onChange(id); cerrar() }
  if (opciones.length <= 8) return <Host ignoreSafeArea="all" matchContents colorScheme="dark" seedColor="#FFFFFF" style={{ minHeight: 44 }}>
    <Menu label={texto} modifiers={[buttonStyle('bordered'), controlSize('large'), accessibilityLabel(`${etiqueta}: ${texto}`)]}>
      {opciones.map(o => <Button key={o.id} label={o.nombre} systemImage={o.id === valor ? 'checkmark' : undefined} onPress={() => elegir(o.id)} />)}
    </Menu>
  </Host>
  const resultados = opciones.filter(o => normalizar(o.nombre).includes(normalizar(busqueda)))
  return <>
    <AccionSocial label={etiqueta} accessibilityLabel={`${etiqueta}: ${texto}`} secundaria expandida={false} onPress={() => setAbierto(true)} />
    <Modal visible={abierto} animationType="slide" presentationStyle="pageSheet" allowSwipeDismissal onRequestClose={cerrar}>
      <View style={{ flex: 1, backgroundColor: '#121212' }}>
        <CabeceraSocial titulo={etiqueta} onCerrar={cerrar} />
        <View style={{ padding: 16 }}><SearchField value={busqueda} onChangeText={setBusqueda} placeholder="Buscar colección" accessibilityLabel={`Buscar ${etiqueta.toLowerCase()}`} /></View>
        <Host colorScheme="dark" seedColor="#FFFFFF" style={{ flex: 1 }} ignoreSafeArea="container">
          <List modifiers={[listStyle('insetGrouped'), scrollContentBackground('hidden')]}>
            {resultados.length ? resultados.map(o => <Button key={o.id} onPress={() => elegir(o.id)} modifiers={[
              listRowBackground('#181818'), ...(o.id === valor ? [accessibilityAddTraits(['isSelected'])] : []),
            ]}>
              <HStack><Text>{o.nombre}</Text><Spacer />{o.id === valor ? <Image systemName="checkmark" /> : null}</HStack>
            </Button>) : <Text>No encontramos esa colección.</Text>}
          </List>
        </Host>
      </View>
    </Modal>
  </>
}
