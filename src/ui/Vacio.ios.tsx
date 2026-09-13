import { View } from 'react-native'
import { Host, RNHostView, Text, VStack, Button } from '@expo/ui/swift-ui'
import { buttonStyle, controlSize, font, foregroundStyle, frame, multilineTextAlignment, padding, tint } from '@expo/ui/swift-ui/modifiers'
import { useNetworkState } from 'expo-network'
import { ICON_COLOR, IconWifiOff } from './icons'
import type { VacioProps } from './Vacio.types'

/** El arte mantiene tamaño fijo; textos y siguiente acción pertenecen a SwiftUI. */
export function Vacio({ icono, titulo, detalle, accion, compacto = false }: VacioProps) {
  const lado = compacto ? 48 : 56
  return <Host matchContents={{ vertical: true }} colorScheme="dark" seedColor="#FFFFFF" style={{ width: '100%' }}>
    <VStack spacing={12} modifiers={[padding({ horizontal: 28, vertical: compacto ? 32 : 64 }), frame({ maxWidth: Infinity })]}>
      <RNHostView matchContents><View style={{ width: lado, height: lado, borderRadius: lado / 2, backgroundColor: '#222222', alignItems: 'center', justifyContent: 'center' }}>{icono}</View></RNHostView>
      <Text modifiers={[font({ textStyle: 'headline' }), foregroundStyle('#FFFFFF'), multilineTextAlignment('center')]}>{titulo}</Text>
      {detalle ? <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle('#B3B3B3'), multilineTextAlignment('center')]}>{detalle}</Text> : null}
      {accion ? <Button label={accion.rotulo} onPress={accion.onPress} modifiers={[buttonStyle('borderedProminent'), controlSize('large'), tint('#FFFFFF'), foregroundStyle('#121212')]} /> : null}
    </VStack>
  </Host>
}

export function VacioError({ icono, titulo, detalle, onReintentar, compacto = false }: Omit<VacioProps, 'accion'> & { onReintentar: () => void }) {
  const conectado = useNetworkState().isConnected !== false
  return <Vacio icono={conectado ? icono : <IconWifiOff size={compacto ? 20 : 22} color={ICON_COLOR.muted} />}
    titulo={conectado ? titulo : 'Sin conexión'}
    detalle={conectado ? detalle : 'Cuando vuelva internet, esto se llena solo. También podés reintentar.'}
    accion={{ rotulo: 'Reintentar', onPress: onReintentar }} compacto={compacto} />
}
