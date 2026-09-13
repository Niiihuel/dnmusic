import { createContext, useContext, type ComponentProps, type ReactNode } from 'react'
import { Alert, View } from 'react-native'
import { Button, HStack, Host, Image, LabeledContent, List, Menu, ProgressView, RNHostView, Section, Spacer, Text, TextField, Toggle, VStack, useNativeState } from '@expo/ui/swift-ui'
import { accessibilityLabel, autocorrectionDisabled, background, buttonStyle, clipShape, disabled, font, foregroundStyle, frame, listRowBackground, listRowSeparator, listStyle, padding, scrollContentBackground, scrollDismissesKeyboard, textInputAutocapitalization, tint, toggleStyle } from '@expo/ui/swift-ui/modifiers'
import { useEffect } from 'react'
import * as Shared from './Ajustes.shared'
import type { FilaSostener } from './Mantener'

export { AjustesCompactos, IconoAjuste, useAjustesCompactos } from './Ajustes.shared'
const EnLista = createContext(false)
const FILA = '#181818', TEXTO = '#FFFFFF', SECUNDARIO = '#B3B3B3'

/** Un único List desplaza todas las secciones, sin un ScrollView de RN alrededor. */
export function ListaAjustes({ children, piso = 24, titulo }: ComponentProps<typeof Shared.ListaAjustes>) {
  return <EnLista.Provider value><Host ignoreSafeArea="container" style={{ flex: 1 }} colorScheme="dark" seedColor={TEXTO}>
    <List modifiers={[listStyle('insetGrouped'), scrollContentBackground('hidden'), scrollDismissesKeyboard('interactively'), tint(TEXTO)]}>
      {titulo ? <Text modifiers={[font({ textStyle: 'largeTitle', weight: 'bold' }), listRowBackground('clear'), listRowSeparator('hidden')]}>{titulo}</Text> : null}
      {children}
      <Text modifiers={[frame({ height: piso }), listRowBackground('clear'), listRowSeparator('hidden'), accessibilityLabel('')]}>{' '}</Text>
    </List>
  </Host></EnLista.Provider>
}

/** Fuera de List conserva el grupo RN: varios editores alojan contenido visual propio. */
export function GrupoAjustes(props: ComponentProps<typeof Shared.GrupoAjustes>) {
  const lista = useContext(EnLista)
  if (!lista) return <Shared.GrupoAjustes {...props} />
  return <Section title={props.titulo} footer={props.error || props.pie ? <Text>{props.error ?? props.pie}</Text> : undefined}>{props.children}</Section>
}

function Fila({ children }: { children: ReactNode }) {
  const lista = useContext(EnLista)
  if (lista) return children
  return <Host ignoreSafeArea="all" style={{ width: '100%' }} matchContents={{ vertical: true }} colorScheme="dark" seedColor={TEXTO}>
    <VStack modifiers={[padding({ horizontal: 16, vertical: 6 }), frame({ minHeight: 52 })]}>{children}</VStack>
  </Host>
}
function ImagenExistente({ children, size = 24 }: { children: ReactNode; size?: number }) {
  if (!children) return null
  // Sólo gráficos con dimensiones fijas cruzan el puente; la fila y su alto son SwiftUI.
  return <HStack modifiers={[frame({ width: size, height: size })]}><RNHostView matchContents><View collapsable={false} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>{children}</View></RNHostView></HStack>
}
function Rotulo({ rotulo, detalle }: { rotulo: string; detalle?: string }) {
  return <VStack alignment="leading" spacing={3}>
    <Text modifiers={[font({ textStyle: 'body' }), foregroundStyle(TEXTO)]}>{rotulo}</Text>
    {detalle ? <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(SECUNDARIO)]}>{detalle}</Text> : null}
  </VStack>
}
const fondo = () => [listRowBackground(FILA), frame({ minHeight: 44, maxWidth: Infinity })]

export function FilaAjuste({ rotulo, detalle, valor, vacio = 'Sin poner', icono, globito, onPress, destructivo, disabled: apagada }: ComponentProps<typeof Shared.FilaAjuste>) {
  const valorVisible = valor?.trim() ? valor : vacio
  return <Fila><Button onPress={apagada ? undefined : onPress} role={destructivo ? 'destructive' : 'default'} modifiers={[...fondo(), buttonStyle('plain'), disabled(!!apagada)]}>
    <HStack spacing={10}>
      <ImagenExistente>{icono}</ImagenExistente><Rotulo rotulo={rotulo} detalle={detalle} /><Spacer />
      {valorVisible ? <Text modifiers={[foregroundStyle(SECUNDARIO)]}>{valorVisible}</Text> : null}
      {globito ? <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle('#121212'), padding({ horizontal: 7, vertical: 3 }), background(TEXTO), clipShape('capsule')]}>{globito > 99 ? '99+' : String(globito)}</Text> : null}
      {!destructivo ? <Image systemName="chevron.right" color={SECUNDARIO} size={13} /> : null}
    </HStack>
  </Button></Fila>
}
export function FilaDato({ rotulo, valor, icono }: ComponentProps<typeof Shared.FilaDato>) {
  const label = icono ? <HStack spacing={10}><ImagenExistente>{icono}</ImagenExistente><Text modifiers={[foregroundStyle(TEXTO)]}>{rotulo}</Text></HStack> : rotulo
  return <Fila><LabeledContent label={label} modifiers={fondo()}><Text modifiers={[foregroundStyle(SECUNDARIO)]}>{valor}</Text></LabeledContent></Fila>
}
export function FilaTexto({ rotulo, valor, onCambiar, marcador, editable = true, autoCapitalize = 'none', autoCorrect = false }: ComponentProps<typeof Shared.FilaTexto>) {
  const texto = useNativeState(valor)
  useEffect(() => { if (texto.get() !== valor) texto.set(valor) }, [texto, valor])
  return <Fila><LabeledContent label={rotulo} modifiers={fondo()}>
    <TextField text={texto} placeholder={marcador} onTextChange={editable ? onCambiar : undefined}
      modifiers={[disabled(!editable), accessibilityLabel(rotulo), autocorrectionDisabled(!autoCorrect), textInputAutocapitalization(autoCapitalize === 'none' ? 'never' : autoCapitalize)]} />
  </LabeledContent></Fila>
}
export function FilaAccion({ rotulo, onPress, icono, destacada, disabled: apagada, busy }: ComponentProps<typeof Shared.FilaAccion>) {
  const activa = !apagada && !busy
  return <Fila><Button onPress={activa ? onPress : undefined} modifiers={[...fondo(), disabled(!activa), buttonStyle('plain')]}>
    <HStack spacing={10}><ImagenExistente>{icono}</ImagenExistente><Text modifiers={[foregroundStyle(activa ? TEXTO : SECUNDARIO), font({ textStyle: 'body', weight: destacada ? 'semibold' : 'regular' })]}>{rotulo}</Text><Spacer />{busy ? <ProgressView /> : null}</HStack>
  </Button></Fila>
}
export function FilaCuenta({ nombre, detalle, onPress, avatar }: ComponentProps<typeof Shared.FilaCuenta>) {
  return <Fila><Button onPress={onPress} modifiers={[...fondo(), buttonStyle('plain')]}><HStack spacing={14}>
    <ImagenExistente size={58}>{avatar}</ImagenExistente><Rotulo rotulo={nombre} detalle={detalle} /><Spacer /><Image systemName="chevron.right" size={13} color={SECUNDARIO} />
  </HStack></Button></Fila>
}
export function FilaInterruptor({ rotulo, detalle, activo, onCambiar, disabled: apagada }: ComponentProps<typeof Shared.FilaInterruptor>) {
  return <Fila><Toggle isOn={activo} onIsOnChange={apagada ? undefined : onCambiar} modifiers={[...fondo(), toggleStyle('switch'), tint('#34C759'), disabled(!!apagada)]}>
    <Rotulo rotulo={rotulo} detalle={detalle} />
  </Toggle></Fila>
}
export function FilaOpciones<T extends string | number>({ rotulo, valor, opciones, onElegir, disabled: apagada }: ComponentProps<typeof Shared.FilaOpciones<T>>) {
  return <Fila><Menu modifiers={[...fondo(), disabled(!!apagada)]} label={<LabeledContent label={rotulo}><HStack spacing={5}><Text modifiers={[foregroundStyle(SECUNDARIO)]}>{opciones.find(o => o.value === valor)?.label ?? '—'}</Text><Image systemName="chevron.up.chevron.down" size={12} color={SECUNDARIO} /></HStack></LabeledContent>}>
    {opciones.map(o => <Button key={o.value} label={o.label} systemImage={o.value === valor ? 'checkmark' : o.sfSymbol} role={o.destructive ? 'destructive' : 'default'} onPress={apagada ? undefined : () => onElegir(o.value)} />)}
  </Menu></Fila>
}
/** Conserva la confirmación explícita antes de borrar datos o cerrar la sesión. */
export function FilaConfirmable({ rotulo, onCompletar }: ComponentProps<typeof FilaSostener>) {
  return <Fila><Button label={rotulo} role="destructive" modifiers={fondo()} onPress={() => Alert.alert(rotulo,
    rotulo.includes('historial') ? 'El historial de escucha se borrará y las recomendaciones empezarán de nuevo. No se puede deshacer.' : 'Tus listas y tu perfil se conservan en tu cuenta.',
    [{ text: 'Cancelar', style: 'cancel', isPreferred: true }, { text: rotulo, style: 'destructive', onPress: onCompletar }], { userInterfaceStyle: 'dark' })} /></Fila>
}
