import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native'
import { BotonHoja, EncabezadoHoja } from './EncabezadoHoja'
import { ICON_COLOR } from './icons'

/** Anatomía compartida por chats, detalles, fragmentos y Jam. */
export function CabeceraSocial({ titulo, detalle, onCerrar, accion, ocupado = false }: {
  titulo: string; detalle?: string; onCerrar?: () => void; accion?: ReactNode; ocupado?: boolean
}) {
  return <EncabezadoHoja titulo={titulo} sobre={detalle} velo={false}
    izquierda={onCerrar ? <BotonHoja tipo="cerrar" label={`Cerrar ${titulo.toLowerCase()}`} onPress={onCerrar} disabled={ocupado} /> : undefined}
    derecha={accion} />
}

export function AccionSocial({ label, onPress, secundaria = false, busy = false, disabled = false, icono, expandida, compacta = false, style }: {
  label: string; onPress: () => void; secundaria?: boolean; busy?: boolean; disabled?: boolean; icono?: ReactNode; expandida?: boolean; compacta?: boolean; style?: StyleProp<ViewStyle>
}) {
  const escritorio = useWindowDimensions().width >= 780
  const inactiva = disabled || busy
  const densa = compacta && escritorio
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: inactiva, busy }}
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
    {busy ? <ActivityIndicator size="small" color={ICON_COLOR.foreground} /> : icono}
    <Text style={{ flexShrink: 1, fontSize: densa ? 14 : 15 }} className={`text-center font-semibold ${inactiva ? 'text-muted-foreground' : secundaria ? 'text-foreground' : 'text-primary-foreground'}`}>{label}</Text>
  </Pressable>
}

export function SeccionSocial({ titulo, detalle, children }: { titulo?: string; detalle?: string; children: ReactNode }) {
  return <View className="gap-2">
    {titulo ? <Text accessibilityRole="header" className="text-foreground px-1 text-[15px] font-semibold">{titulo}</Text> : null}
    <View className="overflow-hidden rounded-2xl bg-card">{children}</View>
    {detalle ? <Text className="text-muted-foreground px-1 text-[13px] leading-5">{detalle}</Text> : null}
  </View>
}
