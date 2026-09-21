import type { ComponentProps } from 'react'
import { View } from 'react-native'
import { ListItem, RNHostView, Row, Surface, Switch, Text } from '@expo/ui/jetpack-compose'
import { defaultMinSize, fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers'
import * as Shared from './Ajustes.shared'
import { AndroidHost, ANDROID_COLORS, androidAccessibility } from './AndroidHost'
import { IconChevronRight } from './icons'

export {
  AjustesCompactos,
  useAjustesCompactos,
  IconoAjuste,
  GrupoAjustes,
  FilaDato,
  FilaTexto,
  FilaAccion,
  FilaCuenta,
  FilaOpciones,
  ListaAjustes,
} from './Ajustes.shared'
export { FilaSostener as FilaConfirmable } from './Mantener'

const colores = {
  containerColor: 'transparent',
  contentColor: ANDROID_COLORS.text,
  leadingContentColor: ANDROID_COLORS.muted,
  trailingContentColor: ANDROID_COLORS.muted,
  supportingContentColor: ANDROID_COLORS.muted,
} as const

/** Fila Material 3 real; React Native conserva solamente el contenedor agrupado. */
export function FilaAjuste({ rotulo, detalle, valor, vacio = 'Sin poner', icono, globito, onPress, destructivo = false, disabled = false }: ComponentProps<typeof Shared.FilaAjuste>) {
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
          <ListItem.HeadlineContent><Text color={destructivo ? ANDROID_COLORS.error : ANDROID_COLORS.text} style={{ typography: 'bodyLarge' }}>{rotulo}</Text></ListItem.HeadlineContent>
          {detalle ? <ListItem.SupportingContent><Text color={ANDROID_COLORS.muted} style={{ typography: 'bodySmall' }}>{detalle}</Text></ListItem.SupportingContent> : null}
          {visible || globito || !destructivo ? <ListItem.TrailingContent><Row verticalAlignment="center" horizontalArrangement={{ spacedBy: 8 }}>
            {visible ? <Text color={ANDROID_COLORS.muted} style={{ typography: 'bodyMedium' }}>{visible}</Text> : null}
            {globito ? <Text color={ANDROID_COLORS.text} style={{ typography: 'labelMedium', fontWeight: '600' }}>{globito > 99 ? '99+' : String(globito)}</Text> : null}
            {!destructivo ? <RNHostView matchContents><IconChevronRight size={18} color={ANDROID_COLORS.muted} /></RNHostView> : null}
          </Row></ListItem.TrailingContent> : null}
        </ListItem>
      </Surface>
    </AndroidHost>
  </View>
}

/** Interruptor y fila pertenecen a la misma superficie Material y toda la fila alterna el valor. */
export function FilaInterruptor({ rotulo, detalle, activo, onCambiar, icono, disabled = false }: ComponentProps<typeof Shared.FilaInterruptor>) {
  const alto = detalle ? 68 : 56
  const alternar = () => { if (!disabled) onCambiar(!activo) }
  return <View style={{ width: '100%', minHeight: alto, overflow: 'hidden' }}>
    <AndroidHost style={{ width: '100%', minHeight: alto }} matchContents={{ vertical: true }}>
      <Surface color="transparent" enabled={!disabled} onClick={disabled ? undefined : alternar}
        modifiers={[fillMaxWidth(), defaultMinSize({ minHeight: alto }), androidAccessibility(rotulo, activo ? 'Activado' : 'Desactivado')]}>
        <ListItem colors={colores} modifiers={[fillMaxWidth(), defaultMinSize({ minHeight: alto })]}>
          {icono ? <ListItem.LeadingContent><RNHostView matchContents><View>{icono}</View></RNHostView></ListItem.LeadingContent> : null}
          <ListItem.HeadlineContent><Text color={disabled ? ANDROID_COLORS.muted : ANDROID_COLORS.text} style={{ typography: 'bodyLarge' }}>{rotulo}</Text></ListItem.HeadlineContent>
          {detalle ? <ListItem.SupportingContent><Text color={ANDROID_COLORS.muted} style={{ typography: 'bodySmall' }}>{detalle}</Text></ListItem.SupportingContent> : null}
          <ListItem.TrailingContent><Switch value={activo} enabled={!disabled} onCheckedChange={next => { if (!disabled) onCambiar(next) }}
            colors={{ checkedTrackColor: ANDROID_COLORS.primary, checkedThumbColor: ANDROID_COLORS.onPrimary,
              uncheckedTrackColor: ANDROID_COLORS.raised, uncheckedThumbColor: ANDROID_COLORS.muted, uncheckedBorderColor: ANDROID_COLORS.muted }} /></ListItem.TrailingContent>
        </ListItem>
      </Surface>
    </AndroidHost>
  </View>
}
