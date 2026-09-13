import { AccionSocial } from './Social'
import { IconButton } from './IconButton'
import { Image, Text, View } from 'react-native'
import { artworkSource } from '../lib/artwork'
import { usePiso } from '../state/shell'
import { Glass, HAY_VIDRIO } from './Glass'
import { useOfertaCaptura } from './useOfertaCaptura'
import { ICON_COLOR, IconClose, IconMusic } from './icons'

/** Oferta discreta; el archivo compartido es la tarjeta de música de la app. */
export function AvisoCaptura() {
  const { oferta, cerrar, compartir } = useOfertaCaptura()
  const piso = usePiso(12)

  if (!oferta) return null

  const arte = artworkSource(oferta.artworkPath, oferta.artworkUrl, 96)

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 12, right: 12, bottom: piso, zIndex: 60 }}
    >
      <Glass radius={16} style={HAY_VIDRIO ? {} : { backgroundColor: 'rgb(31,31,31)' }}>
        <View className="flex-row items-center gap-3 p-3">
          {arte ? (
            <Image source={{ uri: arte }} className="h-11 w-11 rounded-lg bg-card" />
          ) : (
            <View className="h-11 w-11 items-center justify-center rounded-lg bg-card">
              <IconMusic size={17} color={ICON_COLOR.muted} />
            </View>
          )}
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-foreground text-footnote font-semibold" numberOfLines={1}>
              ¿La compartís en tu historia?
            </Text>
            <Text className="text-muted-foreground text-caption2" numberOfLines={1}>
              {oferta.title} — {oferta.artist}
            </Text>
          </View>
          <AccionSocial label="Historia" accessibilityLabel="Compartir en una historia" expandida={false} onPress={compartir} />
          <IconButton label="Cerrar" symbol="xmark" onPress={cerrar} icon={<IconClose size={14} color={ICON_COLOR.muted} />} />
        </View>
      </Glass>
    </View>
  )
}
