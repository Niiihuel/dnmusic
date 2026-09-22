import { useState, type ReactNode } from 'react'
import { View } from 'react-native'
import { Column, Text } from '@expo/ui/jetpack-compose'
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers'
import { AndroidHost, ANDROID_COLORS as color } from './AndroidHost'
import { IconButton } from './IconButton'
import { ANDROID_TYPE } from './androidDesign'

/** Yoga reserves header space; text and actions render through Compose. */
export function EncabezadoHoja({ titulo, sobre, izquierda, derecha }: {
  titulo: string; sobre?: string; izquierda?: ReactNode; derecha?: ReactNode; velo?: boolean
}) {
  const [izq, setIzq] = useState(48)
  const [der, setDer] = useState(48)
  const lado = Math.max(48, izq, der)
  return <View style={{ flexShrink: 0, backgroundColor: color.background, paddingTop: 4 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 4, minHeight: 64 }}>
      <View style={{ width: lado, alignItems: 'flex-start' }}><View onLayout={e => setIzq(e.nativeEvent.layout.width)}>{izquierda}</View></View>
      <View accessibilityRole="header" style={{ flex: 1, minWidth: 0 }}>
        <AndroidHost matchContents={{ vertical: true }} style={{ width: '100%' }}>
          <Column modifiers={[fillMaxWidth()]} verticalArrangement={{ spacedBy: 2 }}>
            <Text color={color.text} style={{ ...ANDROID_TYPE.title, textAlign: 'center' }} modifiers={[fillMaxWidth()]}>{titulo}</Text>
            {sobre ? <Text color={color.muted} style={{ ...ANDROID_TYPE.body, textAlign: 'center' }} modifiers={[fillMaxWidth()]}>{sobre}</Text> : null}
          </Column>
        </AndroidHost>
      </View>
      <View style={{ width: lado, alignItems: 'flex-end' }}><View onLayout={e => setDer(e.nativeEvent.layout.width)}>{derecha}</View></View>
    </View>
  </View>
}

export function BotonHoja({ tipo, label, onPress, disabled = false }: {
  tipo?: 'cerrar' | 'volver'; label?: string; onPress: () => void; children?: ReactNode; disabled?: boolean
}) {
  return <IconButton label={label ?? (tipo === 'volver' ? 'Volver' : 'Cerrar')}
    symbol={tipo === 'volver' ? 'chevron.left' : 'xmark'} onPress={onPress} disabled={disabled} variant="glass" size={20} />
}

export function BotonConfirmar({ label, activo, ocupado = false, onPress }: {
  label: string; activo: boolean; ocupado?: boolean; onPress: () => void
}) {
  return <IconButton label={label} symbol="checkmark" onPress={onPress} disabled={!activo}
    busy={ocupado} disableWhileBusy variant="primary" size={20} />
}
