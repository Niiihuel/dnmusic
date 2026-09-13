import type { ReactNode } from 'react'
import { View } from 'react-native'
import { Host, Text, VStack } from '@expo/ui/swift-ui'
import { accessibilityAddTraits, font, foregroundStyle, multilineTextAlignment } from '@expo/ui/swift-ui/modifiers'
import { LinearGradient } from 'expo-linear-gradient'
import { IconButton } from './IconButton'

export function EncabezadoHoja({ titulo, sobre, izquierda, derecha, velo = true }: {
  titulo: string; sobre?: string; izquierda?: ReactNode; derecha?: ReactNode; velo?: boolean
}) {
  return <View style={{ zIndex: 10, minHeight: 68, flexShrink: 0 }}>
    {velo ? <LinearGradient pointerEvents="none" colors={['rgba(18,18,18,0.98)', 'rgba(18,18,18,0.9)', 'rgba(18,18,18,0)']}
      locations={[0, 0.68, 1]} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: -24 }} /> : null}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 68 }}>
      <View style={{ minWidth: 44, alignItems: 'flex-start' }}>{izquierda}</View>
      <Host ignoreSafeArea="all" matchContents={{ vertical: true }} style={{ flex: 1, minWidth: 0 }} colorScheme="dark">
        <VStack spacing={2}>
          <Text modifiers={[font({ textStyle: 'headline' }), foregroundStyle('#FFFFFF'), multilineTextAlignment('center'), accessibilityAddTraits(['isHeader'])]}>{titulo}</Text>
          {sobre ? <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle('#B3B3B3'), multilineTextAlignment('center')]}>{sobre}</Text> : null}
        </VStack>
      </Host>
      <View style={{ minWidth: 44, alignItems: 'flex-end' }}>{derecha}</View>
    </View>

  </View>
}

export function BotonHoja({ tipo, label, onPress, disabled = false }: {
  tipo?: 'cerrar' | 'volver'; label?: string; onPress: () => void; children?: ReactNode; disabled?: boolean
}) {
  return <IconButton label={label ?? (tipo === 'volver' ? 'Volver' : 'Cerrar')}
    symbol={tipo === 'volver' ? 'chevron.left' : 'xmark'} onPress={onPress} disabled={disabled} variant="glass" size={18} />
}

export function BotonConfirmar({ label, activo, ocupado = false, onPress }: {
  label: string; activo: boolean; ocupado?: boolean; onPress: () => void
}) {
  return <IconButton label={label} symbol="checkmark" onPress={onPress} disabled={!activo}
    busy={ocupado} disableWhileBusy variant="primary" size={17} />
}
