import { Platform } from 'react-native'
import { Button, Host, HStack, Image, ProgressView, RNHostView, Spacer, Text, VStack } from '@expo/ui/swift-ui'
import {
  accessibilityAddTraits, accessibilityHidden, accessibilityLabel, background, buttonBorderShape,
  buttonStyle, clipShape, contentShape, font, foregroundStyle, frame, layoutPriority, lineLimit, padding, shapes, tint,
} from '@expo/ui/swift-ui/modifiers'
import { Avatar } from './Avatar'
import type { CabeceraChatsProps, FilaConversacionProps, FilaSolicitudChatProps } from './ContenidoChats.types'

/** La lista virtualizada mantiene el scroll del shell; SwiftUI mide y dibuja
 * contenido/controles. Avatar conserva su carga y respaldo compartidos vía RNHostView. */
export function CabeceraChats({ cantidad, techo, onNew }: CabeceraChatsProps) {
  const vidrio = Number.parseInt(String(Platform.Version), 10) >= 26
  return <Host matchContents={{ vertical: true }} colorScheme="dark" seedColor="#FFFFFF" style={{ width: '100%' }}>
    <HStack alignment="bottom" spacing={12} modifiers={[padding({ horizontal: 16, top: techo, bottom: 8 })]}>
      <VStack alignment="leading" spacing={2} modifiers={[layoutPriority(1)]}>
        <Text modifiers={[font({ textStyle: 'largeTitle', weight: 'bold' }), foregroundStyle('#FFFFFF'), accessibilityAddTraits(['isHeader'])]}>Chats</Text>
        <Text modifiers={[font({ textStyle: 'caption' }), foregroundStyle('#B3B3B3')]}>{cantidad} {cantidad === 1 ? 'contacto' : 'contactos'}</Text>
      </VStack>
      <Spacer />
      <Button onPress={onNew} modifiers={[accessibilityLabel('Nueva conversación'), buttonStyle(vidrio ? 'glass' : 'bordered'), buttonBorderShape('circle'), tint('#FFFFFF'), frame({ minWidth: 44, minHeight: 44 })]}>
        <Image systemName="square.and.pencil" modifiers={[font({ textStyle: 'body' }), frame({ minWidth: 28, minHeight: 28 })]} />
      </Button>
    </HStack>
  </Host>
}
export function TituloSeccionChats({ texto }: { texto: string }) {
  return <Host matchContents={{ vertical: true }} colorScheme="dark" style={{ width: '100%' }}>
    <Text modifiers={[font({ textStyle: 'footnote', weight: 'semibold' }), foregroundStyle('#B3B3B3'), padding({ horizontal: 10, vertical: 4 }), accessibilityAddTraits(['isHeader'])]}>{texto}</Text>
  </Host>
}
export function CargaChats({ texto }: { texto: string }) {
  return <Host matchContents={{ vertical: true }} colorScheme="dark" style={{ width: '100%' }}>
    <HStack spacing={8} modifiers={[padding({ horizontal: 8, vertical: 20 }), accessibilityLabel(texto)]}>
      <ProgressView modifiers={[tint('#B3B3B3')]} />
      <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle('#B3B3B3')]}>{texto}</Text>
      <Spacer />
    </HStack>
  </Host>
}
export function FilaConversacion({ nombre, nombreAvatar = nombre, avatarPath, detalle, fecha, noLeidos, selected, onPress }: FilaConversacionProps) {
  const label = [nombre, fecha, detalle, noLeidos > 0 ? `${noLeidos} ${noLeidos === 1 ? 'mensaje sin leer' : 'mensajes sin leer'}` : null].filter(Boolean).join(', ')
  return <Host matchContents={{ vertical: true }} colorScheme="dark" seedColor="#FFFFFF" style={{ width: '100%', minHeight: 60 }}>
    <Button onPress={onPress} modifiers={[buttonStyle('plain'), accessibilityLabel(label), ...(selected ? [accessibilityAddTraits(['isSelected'])] : [])]}>
      <HStack spacing={12} modifiers={[frame({ minHeight: 60 }), padding({ horizontal: 8, vertical: 8 }),
        ...(selected ? [background('#262626')] : []), clipShape('roundedRectangle', 12), contentShape(shapes.rectangle())]}>
        <HStack modifiers={[accessibilityHidden()]}><RNHostView matchContents><Avatar key={avatarPath ?? nombreAvatar} name={nombreAvatar} path={avatarPath} size={48} /></RNHostView></HStack>
        <VStack alignment="leading" spacing={4} modifiers={[layoutPriority(1)]}>
          <HStack spacing={8}>
            <Text modifiers={[font({ textStyle: 'body', weight: noLeidos > 0 ? 'bold' : 'semibold' }), foregroundStyle('#FFFFFF'), lineLimit(2), layoutPriority(1)]}>{nombre}</Text>
            <Spacer />
            {fecha ? <Text modifiers={[font({ textStyle: 'caption2' }), foregroundStyle('#B3B3B3'), lineLimit(1)]}>{fecha}</Text> : null}
          </HStack>
          <HStack spacing={8}>
            <Text modifiers={[font({ textStyle: 'subheadline' }), foregroundStyle('#B3B3B3'), lineLimit(2), layoutPriority(1)]}>{detalle}</Text>
            <Spacer />
            {noLeidos > 0 ? <Text modifiers={[font({ textStyle: 'caption', weight: 'semibold' }), foregroundStyle('#121212'), padding({ horizontal: 7, vertical: 3 }), background('#FFFFFF'), clipShape('capsule')]}>{noLeidos > 99 ? '99+' : String(noLeidos)}</Text> : null}
          </HStack>
        </VStack>
      </HStack>
    </Button>
  </Host>
}
export function FilaSolicitudChat({ nombre, etiqueta, avatarPath, onAceptar, onRechazar }: FilaSolicitudChatProps) {
  return <Host matchContents={{ vertical: true }} colorScheme="dark" seedColor="#FFFFFF" style={{ width: '100%' }}>
    <HStack spacing={8} modifiers={[padding({ horizontal: 8, vertical: 8 }), frame({ minHeight: 60 })]}>
      <HStack modifiers={[accessibilityHidden()]}><RNHostView matchContents><Avatar key={avatarPath ?? etiqueta} name={etiqueta} path={avatarPath} size={48} /></RNHostView></HStack>
      <VStack alignment="leading" spacing={4} modifiers={[layoutPriority(1)]}>
        <Text modifiers={[font({ textStyle: 'body', weight: 'semibold' }), foregroundStyle('#FFFFFF'), lineLimit(2)]}>{nombre}</Text>
        <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle('#B3B3B3'), lineLimit(2)]}>Quiere ser tu contacto</Text>
      </VStack>
      <Spacer />
      <Button onPress={onAceptar} modifiers={[buttonStyle('plain'), accessibilityLabel(`Aceptar la solicitud de ${etiqueta}`)]}>
        <Image systemName="checkmark.circle.fill" modifiers={[font({ textStyle: 'title2' }), foregroundStyle('#FFFFFF'), frame({ minWidth: 44, minHeight: 44 }), contentShape(shapes.rectangle())]} />
      </Button>
      <Button onPress={onRechazar} modifiers={[buttonStyle('plain'), accessibilityLabel(`Rechazar la solicitud de ${etiqueta}`)]}>
        <Image systemName="xmark.circle" modifiers={[font({ textStyle: 'title2' }), foregroundStyle('#B3B3B3'), frame({ minWidth: 44, minHeight: 44 }), contentShape(shapes.rectangle())]} />
      </Button>
    </HStack>
  </Host>
}
