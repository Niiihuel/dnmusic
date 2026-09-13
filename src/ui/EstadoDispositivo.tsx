import { IconButton } from './IconButton'
import { Text, View } from 'react-native'
import { abrirSelectorDispositivos } from '../state/escucha'
import { useDestinoEscucha } from './Dispositivos.shared'
import { BotonSuperficie } from './BotonSuperficie'
import { ICON_COLOR, IconDispositivo } from './icons'

/** Acceso siempre visible al destino: no hace falta abrir Más opciones. */
export function EstadoDispositivo({ compacto = false }: { compacto?: boolean }) {
  const destino = useDestinoEscucha()
  if (compacto) return <IconButton label={`${destino.resumen}. Escuchar en…`} symbol="laptopcomputer.and.iphone"
    onPress={abrirSelectorDispositivos} selected={destino.remoto} lado={40}
    icon={<IconDispositivo size={18} color={destino.remoto ? ICON_COLOR.foreground : ICON_COLOR.muted} />} />
  return <BotonSuperficie accessibilityRole="button" accessibilityLabel={`${destino.resumen}. Escuchar en otro dispositivo`}
    onPress={abrirSelectorDispositivos} className="rounded-xl px-2 active:bg-muted hover:bg-muted"
    style={{ minHeight: 44, justifyContent: 'center' }}>
    <View className="flex-row items-center gap-2">
      <IconDispositivo size={18} color={destino.remoto ? ICON_COLOR.foreground : ICON_COLOR.muted} />
      <Text className="text-muted-foreground text-caption1" numberOfLines={2} style={{ maxWidth: 170 }}>{destino.resumen}</Text>
    </View>
  </BotonSuperficie>
}
