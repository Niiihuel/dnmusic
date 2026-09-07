import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ICON_COLOR } from './icons'
import { Glass } from './Glass'

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
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Restablecer cambios del perfil"
                accessibilityState={{ disabled: ocupado }}
                disabled={ocupado}
                onPress={onRestablecer}
                className="min-h-11 items-center justify-center rounded-xl px-4 active:opacity-70"
                style={{ minHeight: 44, flexGrow: compacto ? 1 : 0 }}
              >
                <Text style={{ color: ocupado ? '#aaa' : '#fff', fontSize: 15 }}>Restablecer</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={ocupado ? 'Guardando cambios' : 'Guardar cambios'}
                accessibilityState={{ disabled: !habilitado, busy: ocupado }}
                disabled={!habilitado}
                onPress={onGuardar}
                className="min-h-11 flex-row items-center justify-center gap-2 rounded-xl px-4 active:opacity-80"
                style={{ minHeight: 44, flexGrow: compacto ? 1 : 0, backgroundColor: habilitado ? '#fff' : '#393939' }}
              >
                {ocupado ? <ActivityIndicator size="small" color={ICON_COLOR.foreground} /> : null}
                <Text style={{ color: habilitado ? '#121212' : '#bbb', fontSize: 15, fontWeight: '600' }}>
                  {ocupado ? 'Guardando…' : 'Guardar cambios'}
                </Text>
              </Pressable>
            </View>
          </View>
          {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{ color: '#fff', fontSize: 14, lineHeight: 20 }}>{error}</Text> : null}
        </Glass>
      </View>
    </View>
  )
}
