import { createContext, useContext, type ComponentProps, type ReactNode } from 'react'
import { Alert, View } from 'react-native'
import { Button, HStack, Host, Image, LabeledContent, List, Menu, NavigationDestination, NavigationLink, NavigationStack, ProgressView, RNHostView, Section, Spacer, Text, TextField, Toggle, Toolbar, VStack, useNativeState } from '@expo/ui/swift-ui'
import { accessibilityLabel, autocorrectionDisabled, background, buttonStyle, clipShape, disabled, font, foregroundStyle, frame, listRowBackground, listRowSeparator, listStyle, navigationTitle, padding, scrollContentBackground, scrollDismissesKeyboard, textInputAutocapitalization, tint, toggleStyle } from '@expo/ui/swift-ui/modifiers'
import { useEffect, useState } from 'react'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useKeyboardH } from '../state/shell'
import { SearchField } from './SearchField'
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

/**
 * Configuración de iPhone como jerarquía SwiftUI real.
 *
 * La raíz sólo muestra cuenta y categorías; cada categoría entra en un destino
 * de NavigationStack con gesto de regreso, título y material de barra nativos.
 * Así el contenido desplaza por debajo de la cabecera en vez de empezar tras
 * una franja opaca dibujada por React Native.
 */
export function AjustesNativos({ categorias, initialId, cuenta, piso, buscando, busqueda, onBusqueda, onVolver }: Shared.AjustesNativosProps) {
  const initialPath = initialId && categorias.some(c => c.id === initialId) ? [initialId] : []
  const [path, setPath] = useState<string[]>(initialPath)
  const insets = useSafeAreaInsets()
  const keyboard = useKeyboardH()
  const searchBottom = Math.max(insets.bottom, 12) + keyboard

  const buscar = (value: string) => {
    if (value.trim() && path.length) setPath([])
    onBusqueda(value)
  }

  const lista = (titulo: string, children: ReactNode, raiz = false) => (
    <Toolbar>
      <EnLista.Provider value>
        <List modifiers={[navigationTitle(titulo), listStyle('insetGrouped'), scrollContentBackground('hidden'), scrollDismissesKeyboard('interactively'), tint(TEXTO)]}>
          {children}
          <Text modifiers={[frame({ height: piso + 72 }), listRowBackground('clear'), listRowSeparator('hidden'), accessibilityLabel('')]}>{' '}</Text>
        </List>
      </EnLista.Provider>
      {raiz ? <Toolbar.Content><Button label="Listo" role="cancel" onPress={onVolver} /></Toolbar.Content> : null}
    </Toolbar>
  )

  return <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#121212' }}>
    <Host style={{ flex: 1 }} ignoreSafeArea="container" colorScheme="dark" seedColor={TEXTO}>
      <NavigationStack path={path} onPathChange={setPath}>
        {lista('Configuración', <>
          {!buscando ? cuenta : null}
          <Section title={buscando ? 'Resultados' : undefined}>
            {categorias.map(c => <NavigationLink key={c.id} value={c.id} modifiers={[listRowBackground(FILA)]}>
              <HStack spacing={12} modifiers={[frame({ minHeight: 50 })]}>
                <Image systemName={c.simbolo as never} size={21} modifiers={[frame({ width: 28 })]} />
                <VStack alignment="leading" spacing={3}>
                  <Text>{c.titulo}</Text>
                  <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(SECUNDARIO)]}>{c.resumen}</Text>
                </VStack>
              </HStack>
            </NavigationLink>)}
            {!categorias.length ? <Text modifiers={[foregroundStyle(SECUNDARIO)]}>No encontramos ese ajuste.</Text> : null}
          </Section>
        </>, true)}
        {categorias.map(c => <NavigationDestination key={c.id} value={c.id}>
          {lista(c.titulo, c.bloques)}
        </NavigationDestination>)}
      </NavigationStack>
    </Host>
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom: searchBottom }}>
      <SearchField value={busqueda} onChangeText={buscar} placeholder="Buscar" />
    </View>
  </SafeAreaView>
}

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
