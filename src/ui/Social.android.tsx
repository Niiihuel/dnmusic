import type { ReactNode } from 'react'
import { View, useWindowDimensions } from 'react-native'
import { Button, CircularProgressIndicator, RNHostView, Row, Shape, Text } from '@expo/ui/jetpack-compose'
import { defaultMinSize, fillMaxWidth, size } from '@expo/ui/jetpack-compose/modifiers'
import { useEstadoCopia } from '../state/copia'
import { AndroidHost, ANDROID_COLORS, androidAccessibility } from './AndroidHost'
import { BotonHoja, EncabezadoHoja } from './EncabezadoHoja'
import type { AccionSocialProps } from './Social'
import { ANDROID_CARD, ANDROID_TYPE } from './androidDesign'
import { androidControlModifiers } from './androidComposeDesign'

export function CabeceraSocial({ titulo, detalle, onCerrar, accion, ocupado = false }: {
  titulo: string; detalle?: string; onCerrar?: () => void; accion?: ReactNode; ocupado?: boolean
}) {
  return <EncabezadoHoja titulo={titulo} sobre={detalle}
    izquierda={onCerrar ? <BotonHoja tipo="cerrar" label={`Cerrar ${titulo.toLowerCase()}`} onPress={onCerrar} disabled={ocupado} /> : undefined}
    derecha={accion} />
}

/** Botón Material con la paleta de DMusic; la acción sigue perteneciendo al flujo compartido. */
export function AccionSocial({ label, accessibilityLabel: nombreAccesible, onPress, secundaria = false, selected,
  busy = false, disabled = false, icono, expandida, style, copyText }: AccionSocialProps) {
  const { width } = useWindowDimensions()
  const expandir = expandida ?? width < 780
  const copyState = useEstadoCopia(copyText)
  const ocupado = busy || copyState === 'pending'
  const inactiva = disabled || ocupado
  const rotulo = copyText !== undefined ? copyState === 'copied' ? 'Copiado'
    : copyState === 'pending' ? 'Copiando…' : copyState === 'error' ? 'Reintentar copia' : label : label
  const color = inactiva ? ANDROID_COLORS.muted : ANDROID_COLORS.text
  return <AndroidHost matchContents={expandir ? { vertical: true } : true}
    style={[{ minHeight: 48, maxWidth: '100%', alignSelf: expandir ? 'stretch' : 'flex-start', ...(expandir ? { width: '100%' as const } : {}) }, style]}>
    <Button enabled={!inactiva} onClick={inactiva ? undefined : onPress} shape={Shape.Pill({})}
      colors={{ containerColor: 'transparent',
        contentColor: color, disabledContainerColor: 'transparent', disabledContentColor: ANDROID_COLORS.muted }}
      modifiers={[defaultMinSize({ minHeight: 48 }), ...(expandir ? [fillMaxWidth()] : []), ...androidControlModifiers(!secundaria || selected),
        androidAccessibility(nombreAccesible ?? rotulo, ocupado ? 'En curso' : selected ? 'Seleccionado' : undefined)]}>
      <Row verticalAlignment="center" horizontalArrangement={{ spacedBy: 8 }}>
        {ocupado ? <CircularProgressIndicator color={color} strokeWidth={2} modifiers={[size(18, 18)]} />
          : icono ? <RNHostView matchContents><View pointerEvents="none">{icono}</View></RNHostView> : null}
        <Text color={color} style={{ ...ANDROID_TYPE.body, textAlign: 'center' }}>{rotulo}</Text>
      </Row>
    </Button>
  </AndroidHost>
}

/** El contenedor RN admite filas con su propio Host y conserva la medición dentro de listas. */
export function SeccionSocial({ titulo, detalle, children }: { titulo?: string; detalle?: string; children: ReactNode }) {
  return <View style={{ gap: 8 }}>
    {titulo ? <View accessibilityRole="header"><AndroidHost matchContents={{ vertical: true }} style={{ width: '100%' }}>
      <Text color={ANDROID_COLORS.text} style={ANDROID_TYPE.section}>{titulo}</Text>
    </AndroidHost></View> : null}
    <View style={ANDROID_CARD}><View style={{ overflow: 'hidden', borderRadius: 16 }}>{children}</View></View>
    {detalle ? <AndroidHost matchContents={{ vertical: true }} style={{ width: '100%' }}>
      <Text color={ANDROID_COLORS.muted} style={ANDROID_TYPE.body}>{detalle}</Text>
    </AndroidHost> : null}
  </View>
}
