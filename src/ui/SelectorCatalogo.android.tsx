import { useRef, useState } from 'react'
import { useWindowDimensions } from 'react-native'
import { Column, DropdownMenu, DropdownMenuItem, LazyColumn, ModalBottomSheet, Row, Shape, Spacer, Surface, Text, TextButton, TextField, useNativeState, type ModalBottomSheetRef } from '@expo/ui/jetpack-compose'
import { fillMaxWidth, height, padding, weight } from '@expo/ui/jetpack-compose/modifiers'
import { AndroidIcon } from './AndroidIcon'
import { AndroidHost, androidAccessibility, ANDROID_COLORS as color } from './AndroidHost'

const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
type Props = { etiqueta: string; valor: string; opciones: { id: string; nombre: string }[]; onChange: (id: string) => void }

/** Short catalogs use the native popup; long catalogs use a searchable Material sheet. */
export function SelectorCatalogo({ etiqueta, valor, opciones, onChange }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const textoNativo = useNativeState('')
  const hoja = useRef<ModalBottomSheetRef>(null)
  const { height: alto } = useWindowDimensions()
  const texto = opciones.find(o => o.id === valor)?.nombre ?? etiqueta
  const cerrar = () => { setAbierto(false); setBusqueda(''); textoNativo.set('') }
  const ocultar = () => { void (hoja.current?.hide() ?? Promise.resolve()).then(cerrar, cerrar) }
  const elegir = (id: string) => { onChange(id); if (opciones.length > 8) ocultar(); else cerrar() }

  if (opciones.length <= 8) return <AndroidHost matchContents>
    <DropdownMenu expanded={abierto} onDismissRequest={cerrar} color={color.surface}>
      <DropdownMenu.Trigger><TextButton onClick={() => setAbierto(true)} colors={{ contentColor: color.text }}
        modifiers={[androidAccessibility(`${etiqueta}: ${texto}`)]}><Text>{texto}</Text></TextButton></DropdownMenu.Trigger>
      <DropdownMenu.Items>{opciones.map(o => <DropdownMenuItem key={o.id} onClick={() => elegir(o.id)}
        elementColors={{ textColor: color.text }} modifiers={[androidAccessibility(o.nombre, o.id === valor ? 'Seleccionada' : undefined)]}>
        <DropdownMenuItem.Text><Text>{o.nombre}</Text></DropdownMenuItem.Text>
        {o.id === valor ? <DropdownMenuItem.TrailingIcon><AndroidIcon symbol="checkmark" size={18} color={color.text} /></DropdownMenuItem.TrailingIcon> : null}
      </DropdownMenuItem>)}</DropdownMenu.Items>
    </DropdownMenu>
  </AndroidHost>

  const resultados = opciones.filter(o => normalizar(o.nombre).includes(normalizar(busqueda)))
  return <AndroidHost matchContents={{ vertical: true }} style={{ alignSelf: 'stretch' }}>
    <TextButton onClick={() => setAbierto(true)} colors={{ contentColor: color.text }}
      modifiers={[androidAccessibility(`${etiqueta}: ${texto}`)]}><Text maxLines={1} overflow="ellipsis">{texto}</Text></TextButton>
    {abierto ? <ModalBottomSheet ref={hoja} skipPartiallyExpanded onDismissRequest={cerrar}
      containerColor={color.background} contentColor={color.text}>
      <Column modifiers={[fillMaxWidth(), height(Math.min(alto * .78, 720))]}>
        <Row modifiers={[fillMaxWidth(), padding(20, 0, 8, 8)]} verticalAlignment="center">
          <Text style={{ typography: 'titleLarge' }} modifiers={[weight(1)]}>{etiqueta}</Text>
          <TextButton onClick={ocultar} colors={{ contentColor: color.text }}><Text>Cerrar</Text></TextButton>
        </Row>
        <TextField value={textoNativo} onValueChange={setBusqueda} singleLine keyboardOptions={{ imeAction: 'search', autoCorrectEnabled: false }}
          shape={Shape.RoundedCorner({ cornerRadii: { topStart: 24, topEnd: 24, bottomStart: 24, bottomEnd: 24 } })}
          modifiers={[fillMaxWidth(), padding(16, 0, 16, 12)]}
          colors={{ focusedContainerColor: color.surface, unfocusedContainerColor: color.surface,
            focusedTextColor: color.text, unfocusedTextColor: color.text, cursorColor: color.text,
            focusedIndicatorColor: 'transparent', unfocusedIndicatorColor: 'transparent' }}>
          <TextField.Placeholder><Text color={color.muted}>Buscar colección</Text></TextField.Placeholder>
        </TextField>
        <LazyColumn modifiers={[fillMaxWidth(), weight(1)]} contentPadding={{ start: 16, end: 16, bottom: 24 }}>
          {resultados.length ? resultados.map(o => <Surface key={o.id} selected={valor === o.id} onClick={() => elegir(o.id)}
            color={valor === o.id ? color.raised : color.background} contentColor={color.text} modifiers={[fillMaxWidth()]}
            shape={Shape.RoundedCorner({ cornerRadii: { topStart: 12, topEnd: 12, bottomStart: 12, bottomEnd: 12 } })}>
            <Row modifiers={[fillMaxWidth(), padding(16, 16, 16, 16)]} verticalAlignment="center" horizontalArrangement={{ spacedBy: 12 }}>
              <Text modifiers={[weight(1)]}>{o.nombre}</Text>
              {valor === o.id ? <AndroidIcon symbol="checkmark" size={20} color={color.text} /> : <Spacer />}
            </Row>
          </Surface>) : <Text color={color.muted} modifiers={[padding(16, 20, 16, 20)]}>No encontramos esa colección.</Text>}
        </LazyColumn>
      </Column>
    </ModalBottomSheet> : null}
  </AndroidHost>
}
