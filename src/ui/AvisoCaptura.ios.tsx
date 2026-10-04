import { Image as Artwork, StyleSheet, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FullWindowOverlay } from 'react-native-screens'
import { Button, HStack, Host, Image, RNHostView, Text, VStack } from '@expo/ui/swift-ui'
import { accessibilityHint, accessibilityLabel, background, buttonStyle, controlSize, font, foregroundStyle, frame, glassEffect, lineLimit, padding, shapes } from '@expo/ui/swift-ui/modifiers'
import { artworkSource } from '../lib/artwork'
import { usePiso } from '../state/shell'
import { HAY_VIDRIO } from './Glass'
import { useOfertaCaptura } from './useOfertaCaptura'

/** Aviso SwiftUI no modal: sólo un toque explícito abre UIActivityViewController. */
export function AvisoCaptura() {
  const { oferta, cerrar, compartir, reproductor } = useOfertaCaptura()
  const insets = useSafeAreaInsets()
  const piso = usePiso(12)
  const { fontScale } = useWindowDimensions()
  // Cierre (44), metadata (tapa o dos líneas), padding (24) y separación (12).
  const debajoDelHeader = insets.top + 44 + Math.max(48, 31 * fontScale * 1.3 + 3) + 24 + 12
  if (!oferta) return null
  const arte = artworkSource(oferta.artworkPath, oferta.artworkUrl, 96)
  return <FullWindowOverlay>
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, alignItems: 'center', ...(reproductor ? { top: debajoDelHeader } : { bottom: Math.max(piso, insets.bottom + 12) }) }}>
        <Host ignoreSafeArea="all" matchContents={{ vertical: true }} colorScheme="dark" style={{ width: '100%', maxWidth: 560 }}>
          <HStack spacing={10} modifiers={[
            padding({ horizontal: 12, vertical: 10 }),
            HAY_VIDRIO ? glassEffect({ glass: { variant: 'regular' }, shape: 'roundedRectangle', cornerRadius: 20 }) : background('#242424', shapes.roundedRectangle({ cornerRadius: 20 })),
          ]}>
            <HStack modifiers={[frame({ width: 40, height: 40 })]}>
              {arte ? <RNHostView matchContents><Artwork source={{ uri: arte }} style={{ width: 40, height: 40, borderRadius: 8 }} /></RNHostView> : <Image systemName="music.note" size={24} color="#B3B3B3" />}
            </HStack>
            <VStack alignment="leading" spacing={3} modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}>
              <Text modifiers={[font({ textStyle: 'subheadline', weight: 'semibold' }), foregroundStyle('#FFFFFF'), lineLimit(1)]}>Compartir canción</Text>
              <Text modifiers={[font({ textStyle: 'caption' }), foregroundStyle('#B3B3B3'), lineLimit(1)]}>{oferta.title} — {oferta.artist}</Text>
            </VStack>
            <Button onPress={compartir} modifiers={[buttonStyle('plain'), controlSize('regular'), frame({ minWidth: 44, minHeight: 44 }), accessibilityLabel('Compartir tarjeta de la canción'), accessibilityHint('Abre las opciones de compartir de iOS con una imagen de la canción')]}>
              <Image systemName="square.and.arrow.up" size={20} color="#FFFFFF" />
            </Button>
            <Button onPress={cerrar} modifiers={[buttonStyle('plain'), frame({ minWidth: 44, minHeight: 44 }), accessibilityLabel('Cerrar aviso de compartir')]}>
              <Image systemName="xmark" size={15} color="#B3B3B3" />
            </Button>
          </HStack>
        </Host>
      </View>
    </View>
  </FullWindowOverlay>
}
