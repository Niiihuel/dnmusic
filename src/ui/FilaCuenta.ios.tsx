import { Button, Host, HStack, Image, ProgressView, RNHostView, Spacer, Text, VStack } from '@expo/ui/swift-ui'
import { accessibilityLabel, buttonStyle, disabled, font, foregroundStyle, frame, padding, tint } from '@expo/ui/swift-ui/modifiers'
import { contactLabel, contactTitle } from '../services/contacts'
import { Avatar } from './Avatar'
import type { FilaCuentaProps } from './FilaCuenta.types'

/** Una fila nativa con acciones hermanas: elegir no dispara la visita al perfil. */
export function FilaCuenta({ cuenta, busy = false, onAbrir, onVerPerfil, rotuloAbrir = 'Elegir', onSolicitar, onAceptar }: FilaCuentaProps) {
  const nombre = contactLabel(cuenta)
  const subtitulo = cuenta.pairId ? 'Abrir conversación' : cuenta.solicitud === 'enviada' ? 'Solicitud enviada' : cuenta.solicitud === 'recibida' ? 'Quiere ser tu contacto' : 'Todavía no son contactos'
  const detalle = `${cuenta.displayName?.trim() ? `@${cuenta.username} · ` : ''}${subtitulo}`
  const aceptar = cuenta.solicitud === 'recibida' && onAceptar
  const solicitar = !cuenta.pairId && cuenta.solicitud === null && onSolicitar
  const accion = aceptar || solicitar || (onVerPerfil ? onAbrir : undefined)
  const rotulo = aceptar ? `Aceptar la solicitud de ${nombre}` : solicitar ? `Enviarle una solicitud a ${nombre}` : `${rotuloAbrir} a ${nombre}`
  return <Host ignoreSafeArea="all" colorScheme="dark" seedColor="#FFFFFF" matchContents={{ vertical: true }} style={{ width: '100%' }}>
    <HStack spacing={8} modifiers={[padding({ horizontal: 8, vertical: 8 })]}>
      <Button onPress={busy ? undefined : onVerPerfil ?? onAbrir} modifiers={[buttonStyle('plain'), disabled(busy), accessibilityLabel(`${onVerPerfil ? 'Ver perfil de' : 'Abrir a'} ${nombre}, ${detalle}`)]}>
        <HStack spacing={8} modifiers={[frame({ minHeight: 44 })]}>
          <RNHostView matchContents><Avatar name={nombre} path={cuenta.avatarPath} size={44} /></RNHostView>
          <VStack alignment="leading" spacing={4}>
            <Text modifiers={[font({ textStyle: 'subheadline', weight: 'semibold' }), foregroundStyle('#FFFFFF')]}>{contactTitle(cuenta)}</Text>
            <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle('#B3B3B3')]}>{detalle}</Text>
          </VStack>
          <Spacer />
        </HStack>
      </Button>
      {busy ? <ProgressView modifiers={[frame({ width: 44, height: 44 }), tint('#FFFFFF'), accessibilityLabel('Enviando solicitud')]} /> : accion ?
        <Button onPress={accion} modifiers={[buttonStyle('bordered'), tint('#FFFFFF'), accessibilityLabel(rotulo)]}>
          <HStack modifiers={[frame({ minWidth: 28, minHeight: 28 })]}>
            {aceptar || solicitar ? <Image systemName={aceptar ? 'checkmark' : 'plus'} /> : <Text>{rotuloAbrir}</Text>}
          </HStack>
        </Button> : null}
    </HStack>
  </Host>
}
