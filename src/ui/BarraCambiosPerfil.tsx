import { useState } from 'react'
import { Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Glass } from './Glass'
import { AccionSocial } from './Social'

export type BarraCambiosPerfilProps = {
  visible: boolean
  ocupado?: boolean
  error?: string | null
  puedeGuardar?: boolean
  onRestablecer: () => void
  onGuardar: () => void
  /** Distancia al borde inferior del contenedor; incluye el reproductor si corresponde. */
  abajo?: number
  /** Para reservar espacio en el scroll sin tapar sus últimos controles. */
  onAltura?: (alto: number) => void
  /** En formularios embebidos se puede usar en el flujo, con la misma presentación. */
  flotante?: boolean
}

/** Un solo punto de confirmación para cualquier borrador de perfil. No guarda por su cuenta. */
export function BarraCambiosPerfil({
  visible, ocupado = false, error = null, puedeGuardar = true,
  onRestablecer, onGuardar, abajo, onAltura, flotante = true,
}: BarraCambiosPerfilProps) {
  const insets = useSafeAreaInsets()
  const [ancho, setAncho] = useState(0)
  if (!visible && !ocupado && !error) return null
  const compacto = ancho < 600
  const habilitado = visible && puedeGuardar && !ocupado

  return (
    <View
      pointerEvents="box-none"
      style={flotante
        ? { position: 'absolute', left: 12, right: 12, bottom: abajo ?? Math.max(12, insets.bottom), zIndex: 30, alignItems: 'center' }
        : { width: '100%', alignItems: 'center' }}
    >
      <View
        testID="barra-cambios-perfil"
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout
          setAncho(width)
          onAltura?.(height)
        }}
        style={{ width: '100%', maxWidth: 760 }}
      >
        <Glass radius={18} style={{ paddingVertical: 12, paddingHorizontal: 16, gap: 12 }}>
          <View style={{ flexDirection: compacto ? 'column' : 'row', alignItems: compacto ? 'stretch' : 'center', gap: 12 }}>
            <Text accessibilityLiveRegion="polite" style={{ flex: compacto ? undefined : 1, color: '#fff', fontSize: 15, fontWeight: '600' }}>
              {ocupado ? 'Guardando tus cambios…' : 'Tenés cambios sin guardar'}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }}>
              <View style={{ flex: 1 }}><AccionSocial label="Restablecer" secundaria disabled={ocupado} onPress={onRestablecer} /></View>
              <View style={{ flex: 1 }}><AccionSocial label={ocupado ? 'Guardando…' : 'Guardar cambios'} busy={ocupado} disabled={!habilitado} onPress={onGuardar} /></View>
            </View>
          </View>
          {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{ color: '#fff', fontSize: 14, lineHeight: 20 }}>{error}</Text> : null}
        </Glass>
      </View>
    </View>
  )
}
