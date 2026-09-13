import { useState, type ReactNode } from 'react'
import { Text, View } from 'react-native'
import { IconButton } from './IconButton'

/** El encabezado reserva su altura en Yoga; sólo los botones hospedan SwiftUI. */
export function EncabezadoHoja({ titulo, sobre, izquierda, derecha }: {
  titulo: string; sobre?: string; izquierda?: ReactNode; derecha?: ReactNode; velo?: boolean
}) {
  const [izq, setIzq] = useState(44)
  const [der, setDer] = useState(44)
  const lado = Math.max(44, izq, der)
  return <View style={{ flexShrink: 0, backgroundColor: '#121212', paddingTop: 8 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, minHeight: 60 }}>
      <View style={{ width: lado, alignItems: 'flex-start' }}>
        <View onLayout={e => setIzq(e.nativeEvent.layout.width)}>{izquierda}</View>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text accessibilityRole="header" style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '600', textAlign: 'center' }}>{titulo}</Text>
        {sobre ? <Text style={{ color: '#B3B3B3', fontSize: 13, textAlign: 'center' }}>{sobre}</Text> : null}
      </View>
      <View style={{ width: lado, alignItems: 'flex-end' }}>
        <View onLayout={e => setDer(e.nativeEvent.layout.width)}>{derecha}</View>
      </View>
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
