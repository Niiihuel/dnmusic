import { useEffect, useState, type ComponentProps } from 'react'
import { BackHandler, Text as RNText, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { ListItem, RNHostView, Row, Surface, Switch, Text } from '@expo/ui/jetpack-compose'
import { defaultMinSize, fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers'
import * as Shared from './Ajustes.shared'
import { AndroidHost, ANDROID_COLORS, androidAccessibility } from './AndroidHost'
import { IconChevronRight } from './icons'
import { ANDROID_CARD, ANDROID_COLORS as palette, ANDROID_TYPE } from './androidDesign'
import { ScrollArea } from './ScrollArea'
import { SearchField } from './SearchField'
import { BotonVolver } from './BotonVolver'
import { useKeyboardH } from '../state/shell'

export {
  AjustesCompactos,
  useAjustesCompactos,
  IconoAjuste,
  FilaDato,
  FilaTexto,
  FilaAccion,
  FilaCuenta,
  FilaOpciones,
  ListaAjustes,
} from './Ajustes.shared'
export { FilaSostener as FilaConfirmable } from './Mantener'

/** Jerarquía breve; el botón Atrás de Android vuelve primero a las categorías. */
export function AjustesNativos({ categorias, initialId, cuenta, piso, buscando, busqueda, onBusqueda, onVolver }: Shared.AjustesNativosProps) {
  const [selected, setSelected] = useState<string | undefined>(initialId)
  const category = !buscando ? categorias.find(item => item.id === selected) : undefined
  const categoryId = category?.id
  const insets = useSafeAreaInsets()
  const keyboard = useKeyboardH()
  useEffect(() => {
    if (!categoryId) return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { setSelected(undefined); return true })
    return () => subscription.remove()
  }, [categoryId])
  return <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: palette.background }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 }}>
      <BotonVolver onPress={category ? () => setSelected(undefined) : onVolver} />
      <RNText accessibilityRole="header" style={{ ...ANDROID_TYPE.title, color: palette.text, flex: 1 }}>{category?.titulo ?? 'Configuración'}</RNText>
    </View>
    <ScrollArea key={category?.id ?? 'root'} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: piso + 84, gap: 24 }}>
      {category ? category.bloques : <>
        {!buscando ? cuenta : null}
        <GrupoAjustes titulo={buscando ? 'Resultados' : 'Preferencias'}>
          {categorias.map((item, index) => <FilaAjuste key={item.id} rotulo={item.titulo} detalle={item.resumen} vacio=""
            ultima={index === categorias.length - 1} onPress={() => { onBusqueda(''); setSelected(item.id) }} />)}
          {!categorias.length ? <RNText style={{ ...ANDROID_TYPE.body, color: palette.muted, padding: 20 }}>No encontramos ese ajuste.</RNText> : null}
        </GrupoAjustes>
      </>}
    </ScrollArea>
    <View style={{ position: 'absolute', left: 20, right: 20, bottom: keyboard + Math.max(insets.bottom, 12) }}>
      <SearchField value={busqueda} onChangeText={value => { setSelected(undefined); onBusqueda(value) }} placeholder="Buscar ajustes" />
    </View>
  </SafeAreaView>
}

export function GrupoAjustes({ children, titulo, pie, error }: ComponentProps<typeof Shared.GrupoAjustes>) {
  return <View style={{ gap: 10 }}>
    {titulo ? <RNText accessibilityRole="header" style={{ ...ANDROID_TYPE.section, color: palette.text, paddingHorizontal: 2 }}>{titulo}</RNText> : null}
    <View style={ANDROID_CARD}><View style={{ borderRadius: ANDROID_CARD.borderRadius, overflow: 'hidden' }}>{children}</View></View>
    {error || pie ? <RNText accessibilityLiveRegion={error ? 'polite' : 'none'} style={{ ...ANDROID_TYPE.body, color: error ? palette.error : palette.muted, paddingHorizontal: 4 }}>{error ?? pie}</RNText> : null}
  </View>
}

function Divider() { return <View style={{ height: 1, marginLeft: 16, marginRight: 16, backgroundColor: palette.track }} /> }

const colores = {
  containerColor: 'transparent',
  contentColor: ANDROID_COLORS.text,
  leadingContentColor: ANDROID_COLORS.muted,
  trailingContentColor: ANDROID_COLORS.muted,
  supportingContentColor: ANDROID_COLORS.muted,
} as const

/** Fila Material 3 real; React Native conserva solamente el contenedor agrupado. */
export function FilaAjuste({ rotulo, detalle, valor, vacio = 'Sin poner', icono, globito, onPress, destructivo = false, disabled = false, ultima }: ComponentProps<typeof Shared.FilaAjuste>) {
  const puesto = !!valor?.trim()
  const visible = puesto ? valor : vacio
  const alto = detalle ? 64 : 56
  return <View style={{ width: '100%', minHeight: alto, overflow: 'hidden' }}>
    <AndroidHost style={{ width: '100%', minHeight: alto }} matchContents={{ vertical: true }}>
      <Surface color="transparent" contentColor={destructivo ? ANDROID_COLORS.error : ANDROID_COLORS.text}
        enabled={!disabled} onClick={disabled ? undefined : onPress}
        modifiers={[fillMaxWidth(), defaultMinSize({ minHeight: alto }), androidAccessibility(`${rotulo}${visible ? `, ${visible}` : ''}`, disabled ? 'Deshabilitado' : undefined)]}>
        <ListItem colors={colores} modifiers={[fillMaxWidth(), defaultMinSize({ minHeight: alto })]}>
          {icono ? <ListItem.LeadingContent><RNHostView matchContents><View>{icono}</View></RNHostView></ListItem.LeadingContent> : null}
          <ListItem.HeadlineContent><Text color={destructivo ? ANDROID_COLORS.error : ANDROID_COLORS.text} style={ANDROID_TYPE.body}>{rotulo}</Text></ListItem.HeadlineContent>
          {detalle ? <ListItem.SupportingContent><Text color={ANDROID_COLORS.muted} style={ANDROID_TYPE.body}>{detalle}</Text></ListItem.SupportingContent> : null}
          {visible || globito || !destructivo ? <ListItem.TrailingContent><Row verticalAlignment="center" horizontalArrangement={{ spacedBy: 8 }}>
            {visible ? <Text color={ANDROID_COLORS.muted} style={ANDROID_TYPE.body}>{visible}</Text> : null}
            {globito ? <Text color={ANDROID_COLORS.text} style={{ typography: 'labelMedium', fontWeight: '600' }}>{globito > 99 ? '99+' : String(globito)}</Text> : null}
            {!destructivo ? <RNHostView matchContents><IconChevronRight size={18} color={ANDROID_COLORS.muted} /></RNHostView> : null}
          </Row></ListItem.TrailingContent> : null}
        </ListItem>
      </Surface>
    </AndroidHost>
    {!ultima ? <Divider /> : null}
  </View>
}

/** Interruptor y fila pertenecen a la misma superficie Material y toda la fila alterna el valor. */
export function FilaInterruptor({ rotulo, detalle, activo, onCambiar, icono, disabled = false, ultima }: ComponentProps<typeof Shared.FilaInterruptor>) {
  const alto = detalle ? 68 : 56
  const alternar = () => { if (!disabled) onCambiar(!activo) }
  return <View style={{ width: '100%', minHeight: alto, overflow: 'hidden' }}>
    <AndroidHost style={{ width: '100%', minHeight: alto }} matchContents={{ vertical: true }}>
      <Surface color="transparent" enabled={!disabled} onClick={disabled ? undefined : alternar}
        modifiers={[fillMaxWidth(), defaultMinSize({ minHeight: alto }), androidAccessibility(rotulo, activo ? 'Activado' : 'Desactivado')]}>
        <ListItem colors={colores} modifiers={[fillMaxWidth(), defaultMinSize({ minHeight: alto })]}>
          {icono ? <ListItem.LeadingContent><RNHostView matchContents><View>{icono}</View></RNHostView></ListItem.LeadingContent> : null}
          <ListItem.HeadlineContent><Text color={disabled ? ANDROID_COLORS.muted : ANDROID_COLORS.text} style={ANDROID_TYPE.body}>{rotulo}</Text></ListItem.HeadlineContent>
          {detalle ? <ListItem.SupportingContent><Text color={ANDROID_COLORS.muted} style={ANDROID_TYPE.body}>{detalle}</Text></ListItem.SupportingContent> : null}
          <ListItem.TrailingContent><Switch value={activo} enabled={!disabled} onCheckedChange={next => { if (!disabled) onCambiar(next) }}
            colors={{ checkedTrackColor: ANDROID_COLORS.primary, checkedThumbColor: ANDROID_COLORS.onPrimary,
              uncheckedTrackColor: ANDROID_COLORS.raised, uncheckedThumbColor: ANDROID_COLORS.muted, uncheckedBorderColor: ANDROID_COLORS.muted }} /></ListItem.TrailingContent>
        </ListItem>
      </Surface>
    </AndroidHost>
    {!ultima ? <Divider /> : null}
  </View>
}
