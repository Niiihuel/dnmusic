import type { ReactNode } from 'react'
import { Platform, View } from 'react-native'
import { Button, Host, HStack, ProgressView, Spacer, Text } from '@expo/ui/swift-ui'
import { accessibilityAddTraits, accessibilityLabel, buttonBorderShape, buttonStyle, controlSize, disabled as deshabilitado, font, foregroundStyle, frame, tint } from '@expo/ui/swift-ui/modifiers'
import { BotonHoja, EncabezadoHoja } from './EncabezadoHoja'
import type { AccionSocialProps } from './Social'

export function CabeceraSocial({ titulo, detalle, onCerrar, accion, ocupado = false }: {
  titulo: string; detalle?: string; onCerrar?: () => void; accion?: ReactNode; ocupado?: boolean
}) {
  return <EncabezadoHoja titulo={titulo} sobre={detalle}
    izquierda={onCerrar ? <BotonHoja tipo="cerrar" label={`Cerrar ${titulo.toLowerCase()}`} onPress={onCerrar} disabled={ocupado} /> : undefined}
    derecha={accion} />
}

/** Native actions retain the shared business callbacks; SwiftUI owns interaction and text sizing. */
export function AccionSocial({ label, accessibilityLabel: nombreAccesible, onPress, secundaria = false, selected, busy = false, disabled = false, expandida = true, style }: AccionSocialProps) {
  const inactiva = disabled || busy
  const vidrio = Number.parseInt(String(Platform.Version), 10) >= 26
  return <Host ignoreSafeArea="all" colorScheme="dark" seedColor="#FFFFFF" matchContents={expandida ? { vertical: true } : true}
    style={[{ minHeight: 44, alignSelf: expandida ? 'stretch' : 'flex-start', ...(expandida ? { width: '100%' as const } : {}) }, style]}>
    <Button onPress={inactiva ? undefined : onPress} modifiers={[
      accessibilityLabel(busy ? `${nombreAccesible ?? label}, en curso` : nombreAccesible ?? label), deshabilitado(inactiva),
      ...(selected ? [accessibilityAddTraits(['isSelected'])] : []),
      buttonStyle(secundaria ? (vidrio ? 'glass' : 'bordered') : (vidrio ? 'glassProminent' : 'borderedProminent')),
      buttonBorderShape('capsule'), controlSize('large'), tint('#FFFFFF'),
    ]}>
      <HStack spacing={8} modifiers={[frame({ minHeight: 28 })]}>
        {expandida ? <Spacer /> : null}
        {busy ? <ProgressView modifiers={[tint(secundaria ? '#FFFFFF' : '#121212')]} /> : null}
        <Text modifiers={[font({ textStyle: 'subheadline', weight: 'semibold' }), foregroundStyle(secundaria ? '#FFFFFF' : '#121212')]}>{label}</Text>
        {expandida ? <Spacer /> : null}
      </HStack>
    </Button>
  </Host>
}

export function SeccionSocial({ titulo, detalle, children }: { titulo?: string; detalle?: string; children: ReactNode }) {
  return <View style={{ gap: 8 }}>
    {titulo ? <Host ignoreSafeArea="all" matchContents={{ vertical: true }} colorScheme="dark" style={{ width: '100%' }}>
      <Text modifiers={[font({ textStyle: 'headline' }), foregroundStyle('#FFFFFF')]}>{titulo}</Text>
    </Host> : null}
    <View style={{ overflow: 'hidden', borderRadius: 16, backgroundColor: '#181818' }}>{children}</View>
    {detalle ? <Host ignoreSafeArea="all" matchContents={{ vertical: true }} colorScheme="dark" style={{ width: '100%' }}>
      <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle('#B3B3B3')]}>{detalle}</Text>
    </Host> : null}
  </View>
}
