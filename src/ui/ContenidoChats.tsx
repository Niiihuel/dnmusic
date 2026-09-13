import { superficieInteractivaWeb } from './estadoControl'
import { ActivityIndicator, Text, View } from 'react-native'
import { Avatar } from './Avatar'
import { BotonSuperficie } from './BotonSuperficie'
import { BotonVidrio } from './Glass'
import { IconButton } from './IconButton'
import { ICON_COLOR, IconCheck, IconClose, IconNewConversation } from './icons'
import type { CabeceraChatsProps, FilaConversacionProps, FilaSolicitudChatProps } from './ContenidoChats.types'

export function CabeceraChats({ cantidad, techo, onNew }: CabeceraChatsProps) {
  return <View className="flex-row items-end justify-between gap-4 px-4 pb-2" style={{ paddingTop: techo }}>
    <View className="gap-0.5">
      <Text className="text-foreground text-large-title font-bold tracking-[-0.4px]" numberOfLines={1}>Chats</Text>
      <Text className="text-muted-foreground text-caption1" numberOfLines={1}>{cantidad} {cantidad === 1 ? 'contacto' : 'contactos'}</Text>
    </View>
    <BotonVidrio label="Nueva conversación" onPress={onNew} radius={22} style={{ width: 44, height: 44 }}>
      <IconNewConversation size={17} color={ICON_COLOR.foreground} />
    </BotonVidrio>
  </View>
}
export function TituloSeccionChats({ texto }: { texto: string }) {
  return <Text className="px-2.5 pt-1 pb-1 text-muted-foreground text-footnote font-semibold uppercase">{texto}</Text>
}
export function CargaChats({ texto }: { texto: string }) {
  return <View accessibilityRole="progressbar" accessibilityLabel={texto} className="flex-row items-center gap-2 px-2 py-5">
    <ActivityIndicator size="small" color={ICON_COLOR.muted} />
    <Text className="text-muted-foreground text-caption1">{texto}</Text>
  </View>
}
export function FilaConversacion({ nombre, nombreAvatar = nombre, avatarPath, detalle, fecha, noLeidos, selected, compacto, onPress }: FilaConversacionProps) {
  return <BotonSuperficie {...superficieInteractivaWeb('row')} accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
    className={`flex-row items-center gap-2 rounded-lg px-2 py-2 active:opacity-80 ${selected ? 'bg-muted' : ''}`}>
    <Avatar name={nombreAvatar} path={avatarPath} size={compacto ? 36 : 44} />
    <View className="min-w-0 flex-1 gap-0.5">
      <View className="flex-row items-center gap-2">
        <Text className="min-w-0 flex-1 text-foreground font-semibold" style={{ fontSize: compacto ? 13 : 15 }} numberOfLines={1}>{nombre}</Text>
        {fecha ? <Text className="shrink-0 text-muted-foreground text-caption2">{fecha}</Text> : null}
      </View>
      <View className="flex-row items-center gap-2">
        <Text className="min-w-0 flex-1 text-muted-foreground text-footnote" numberOfLines={1}>{detalle}</Text>
        {noLeidos > 0 ? <View className="min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5">
          <Text className="text-primary-foreground text-caption1 font-semibold">{Math.min(noLeidos, 99)}</Text>
        </View> : null}
      </View>
    </View>
  </BotonSuperficie>
}
export function FilaSolicitudChat({ nombre, etiqueta, avatarPath, compacto, onAceptar, onRechazar }: FilaSolicitudChatProps) {
  const lado = compacto ? 32 : 44
  return <View className="flex-row items-center gap-2 rounded-lg px-2 py-2">
    <Avatar name={etiqueta} path={avatarPath} size={compacto ? 36 : 44} />
    <View className="min-w-0 flex-1 gap-0.5">
      <Text className="text-foreground text-subheadline font-semibold" numberOfLines={1}>{nombre}</Text>
      <Text className="text-muted-foreground text-caption1" numberOfLines={1}>Quiere ser tu contacto</Text>
    </View>
    <IconButton label={`Aceptar la solicitud de ${etiqueta}`} symbol="checkmark" onPress={onAceptar} lado={lado} variant="primary" icon={<IconCheck size={15} color={ICON_COLOR.onPrimary} />} />
    <IconButton label={`Rechazar la solicitud de ${etiqueta}`} symbol="xmark" onPress={onRechazar} lado={lado} icon={<IconClose size={14} color={ICON_COLOR.muted} />} />
  </View>
}
