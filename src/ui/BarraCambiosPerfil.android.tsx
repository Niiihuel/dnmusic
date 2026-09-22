import { useState } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AlertDialog, Button, CircularProgressIndicator, Column, Row, Shape, Spacer, Surface, Text, TextButton } from '@expo/ui/jetpack-compose'
import { fillMaxWidth, paddingAll, size, weight } from '@expo/ui/jetpack-compose/modifiers'
import { AndroidHost, ANDROID_COLORS as color } from './AndroidHost'
import type { BarraCambiosPerfilProps } from './BarraCambiosPerfil'
import { ANDROID_TYPE } from './androidDesign'
import { androidControlModifiers } from './androidComposeDesign'

/** A persistent Material surface keeps save/reset available until the draft is resolved. */
export function BarraCambiosPerfil({ visible, ocupado = false, error, puedeGuardar = true,
  onRestablecer, onGuardar, abajo, onAltura, flotante = true }: BarraCambiosPerfilProps) {
  const [confirmarRestablecer, setConfirmarRestablecer] = useState(false)
  const insets = useSafeAreaInsets()
  if (!visible && !ocupado && !error) return null
  const puedeConfirmar = visible && !ocupado && puedeGuardar
  return <View pointerEvents="box-none" style={flotante
    ? { position: 'absolute', left: 16, right: 16, bottom: abajo ?? Math.max(12, insets.bottom), zIndex: 30 }
    : { width: '100%' }}>
    <AndroidHost matchContents={{ vertical: true }} style={{ width: '100%' }} onLayoutContent={e => onAltura?.(e.nativeEvent.height)}>
      <Surface color={color.surface} contentColor={color.text} shadowElevation={4} modifiers={[fillMaxWidth()]}
        shape={Shape.RoundedCorner({ cornerRadii: { topStart: 18, topEnd: 18, bottomStart: 18, bottomEnd: 18 } })}>
        <Column modifiers={[paddingAll(12), fillMaxWidth()]} verticalArrangement={{ spacedBy: 8 }}>
          <Row verticalAlignment="center" horizontalArrangement={{ spacedBy: 8 }}>
            {ocupado ? <CircularProgressIndicator color={color.text} modifiers={[size(18, 18)]} /> : null}
            <Text style={ANDROID_TYPE.body}>{ocupado ? 'Guardando cambios…' : 'Cambios sin guardar'}</Text>
          </Row>
          {error ? <Text color={color.error} style={ANDROID_TYPE.body}>{error}</Text> : null}
          <Row modifiers={[fillMaxWidth()]} verticalAlignment="center">
            <TextButton enabled={!ocupado} onClick={ocupado ? undefined : () => setConfirmarRestablecer(true)}
              colors={{ contentColor: color.text, disabledContentColor: color.muted }}><Text style={ANDROID_TYPE.body}>Restablecer</Text></TextButton>
            <Spacer modifiers={[weight(1)]} />
            <Button enabled={puedeConfirmar} onClick={puedeConfirmar ? onGuardar : undefined}
              modifiers={androidControlModifiers(true)}
              colors={{ containerColor: 'transparent', contentColor: color.text, disabledContainerColor: 'transparent', disabledContentColor: color.muted }}>
              <Text style={ANDROID_TYPE.body}>Guardar</Text>
            </Button>
          </Row>
        </Column>
      </Surface>
      {confirmarRestablecer ? <AlertDialog onDismissRequest={() => setConfirmarRestablecer(false)} tonalElevation={0}
        colors={{ containerColor: color.surface, titleContentColor: color.text, textContentColor: color.muted }}>
        <AlertDialog.Title><Text>¿Restablecer los cambios?</Text></AlertDialog.Title>
        <AlertDialog.Text><Text>Se recuperará la última versión guardada de tu perfil.</Text></AlertDialog.Text>
        <AlertDialog.DismissButton><TextButton onClick={() => setConfirmarRestablecer(false)} colors={{ contentColor: color.text }}><Text>Cancelar</Text></TextButton></AlertDialog.DismissButton>
        <AlertDialog.ConfirmButton><TextButton enabled={!ocupado} onClick={ocupado ? undefined : () => { setConfirmarRestablecer(false); onRestablecer() }}
          colors={{ contentColor: color.error, disabledContentColor: color.muted }}><Text>Restablecer</Text></TextButton></AlertDialog.ConfirmButton>
      </AlertDialog> : null}
    </AndroidHost>
  </View>
}
