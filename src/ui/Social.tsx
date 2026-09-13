import { CopyFeedback } from './CopyFeedback'
import { useEstadoCopia } from '../state/copia'
import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native'
import { BotonHoja, EncabezadoHoja } from './EncabezadoHoja'
import { ICON_COLOR } from './icons'
import { texto } from './tipografia'

export type AccionSocialProps = {
  copyText?: string; label: string; accessibilityLabel?: string; onPress: () => void; secundaria?: boolean; selected?: boolean; busy?: boolean; disabled?: boolean; icono?: ReactNode; expandida?: boolean; compacta?: boolean; style?: StyleProp<ViewStyle>
}

/** Anatomía compartida por chats, detalles, fragmentos y Jam. */
export function CabeceraSocial({ titulo, detalle, onCerrar, accion, ocupado = false }: {
  titulo: string; detalle?: string; onCerrar?: () => void; accion?: ReactNode; ocupado?: boolean
}) {
  return <EncabezadoHoja titulo={titulo} sobre={detalle} velo={false}
    izquierda={onCerrar ? <BotonHoja tipo="cerrar" label={`Cerrar ${titulo.toLowerCase()}`} onPress={onCerrar} disabled={ocupado} /> : undefined}
    derecha={accion} />
}

export function AccionSocial({ label, accessibilityLabel, onPress, secundaria = false, selected, busy = false, disabled = false, icono, expandida, compacta = false, style, copyText }: AccionSocialProps) {
  const escritorio = useWindowDimensions().width >= 780
  const copyState = useEstadoCopia(copyText)
  const inactiva = disabled || busy || copyState === 'pending'
  const densa = compacta && escritorio
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled: inactiva, busy, selected }}
    disabled={inactiva} onPress={onPress}
    style={[{
      alignSelf: (expandida ?? !escritorio) ? 'stretch' : 'flex-start',
      maxWidth: '100%',
      minHeight: densa ? 36 : 44,
      borderRadius: densa ? 10 : 16,
      paddingHorizontal: densa ? 14 : 16,
      paddingVertical: densa ? 8 : 12,
    }, style]}
    className={`flex-row items-center justify-center gap-2 ${secundaria || inactiva ? 'bg-muted' : 'bg-primary'} active:opacity-75`}>
    {copyText !== undefined ? <CopyFeedback text={copyText} label={label} icon={icono} color={inactiva ? ICON_COLOR.muted : secundaria ? ICON_COLOR.foreground : ICON_COLOR.onPrimary} /> : <>
    {busy ? <ActivityIndicator size="small" color={ICON_COLOR.foreground} /> : icono}
    {/* El rótulo mide igual denso que suelto: la densidad vive en la caja
        —alto, radio, padding, acá arriba— y no en el tamaño de la letra. Antes
        era `densa ? 14 : 15`, un píxel de diferencia que no separaba nada y
        que además dejaba el 14 fuera de toda escala. Apple tampoco baja de
        `subheadline` el rótulo de un botón de 34-36pt. */}
    <Text style={{ flexShrink: 1, ...texto('subheadline') }} className={`text-center font-semibold ${inactiva ? 'text-muted-foreground' : secundaria ? 'text-foreground' : 'text-primary-foreground'}`}>{label}</Text>
    </>}
  </Pressable>
}

export function SeccionSocial({ titulo, detalle, children }: { titulo?: string; detalle?: string; children: ReactNode }) {
  return <View className="gap-2">
    {titulo ? <Text accessibilityRole="header" className="text-foreground px-1 text-subheadline font-semibold">{titulo}</Text> : null}
    <View className="overflow-hidden rounded-2xl bg-card">{children}</View>
    {detalle ? <Text className="text-muted-foreground px-1 text-footnote leading-5">{detalle}</Text> : null}
  </View>
}
