import { CircularProgressIndicator, ListItem, Row, Surface, Text } from '@expo/ui/jetpack-compose'
import { fillMaxWidth, size } from '@expo/ui/jetpack-compose/modifiers'
import { useEstadoCopia } from '../state/copia'
import { AndroidHost, ANDROID_COLORS, androidAccessibility } from './AndroidHost'
import { AndroidIcon } from './AndroidIcon'
import type { FilaSocialProps } from './FilaSocial.types'
import { ANDROID_TYPE } from './androidDesign'

/** Fila Material medible dentro de la lista existente, con selección y pulsación nativas. */
export function FilaSocial({ titulo, detalle, fontFamily, valor, label, selected = false,
  busy = false, disabled = false, onPress, copyText }: FilaSocialProps) {
  const copyState = useEstadoCopia(copyText)
  const ocupado = busy || copyState === 'pending'
  const inactiva = disabled || ocupado
  const estadoCopia = copyText === undefined ? undefined : copyState === 'copied' ? 'Copiado'
    : copyState === 'pending' ? 'Copiando…' : copyState === 'error' ? 'Reintentar copia' : valor ?? 'Copiar'
  const color = inactiva ? ANDROID_COLORS.muted : ANDROID_COLORS.text
  return <AndroidHost matchContents={{ vertical: true }} style={{ width: '100%', minHeight: 48 }}>
    <Surface color="transparent" contentColor={color} enabled={!inactiva} selected={selected}
      onClick={() => { if (!inactiva) onPress() }}
      modifiers={[fillMaxWidth(), androidAccessibility(label ?? [titulo, detalle, estadoCopia ?? valor].filter(Boolean).join(', '), ocupado ? 'En curso' : selected ? 'Seleccionado' : undefined)]}>
      <ListItem colors={{ containerColor: 'transparent', contentColor: color, supportingContentColor: ANDROID_COLORS.muted }} modifiers={[fillMaxWidth()]}>
        <ListItem.HeadlineContent><Text color={color} style={{ ...ANDROID_TYPE.body, fontFamily: fontFamily ?? ANDROID_TYPE.body.fontFamily, fontWeight: 'normal' }}>{titulo}</Text></ListItem.HeadlineContent>
        {detalle ? <ListItem.SupportingContent><Text color={ANDROID_COLORS.muted} style={ANDROID_TYPE.body}>{detalle}</Text></ListItem.SupportingContent> : null}
        {ocupado || selected || valor || estadoCopia ? <ListItem.TrailingContent>
          <Row verticalAlignment="center" horizontalArrangement={{ spacedBy: 8 }}>
            {ocupado ? <CircularProgressIndicator color={ANDROID_COLORS.muted} strokeWidth={2} modifiers={[size(20, 20)]} />
              : selected || copyState === 'copied' ? <AndroidIcon symbol="checkmark" size={20} color={color} /> : null}
            {(estadoCopia ?? valor) ? <Text color={ANDROID_COLORS.muted} style={ANDROID_TYPE.body}>{estadoCopia ?? valor}</Text> : null}
          </Row>
        </ListItem.TrailingContent> : null}
      </ListItem>
    </Surface>
  </AndroidHost>
}
