import { HStack, Host, ProgressView, Text } from '@expo/ui/swift-ui'
import {
  accessibilityLabel,
  background,
  controlSize,
  font,
  foregroundStyle,
  frame,
  multilineTextAlignment,
  padding,
  shapes,
  tint,
} from '@expo/ui/swift-ui/modifiers'
import { textoEsperaGooglePara, type ContextoGoogle } from './GoogleOAuthFeedback.shared'

export { mensajeErrorGoogle, type ContextoGoogle } from './GoogleOAuthFeedback.shared'

export function textoEsperaGoogle(contexto: ContextoGoogle): string {
  return textoEsperaGooglePara(contexto, 'ios')
}

/** Estado de retorno dibujado íntegramente por SwiftUI y anunciado por VoiceOver. */
export function EstadoGoogle({ activo, contexto }: { activo: boolean; contexto: ContextoGoogle }) {
  if (!activo) return null
  const mensaje = textoEsperaGoogle(contexto)
  return (
    <Host ignoreSafeArea="all" matchContents={{ vertical: true }} colorScheme="dark" seedColor="#FFFFFF" style={{ width: '100%' }}>
      <HStack
        alignment="top"
        spacing={10}
        modifiers={[
          frame({ maxWidth: Infinity, alignment: 'leading' }),
          padding({ horizontal: 14, vertical: 12 }),
          background('#1F1F1F', shapes.roundedRectangle({ cornerRadius: 12, roundedCornerStyle: 'continuous' })),
          accessibilityLabel(mensaje),
        ]}
      >
        <ProgressView modifiers={[controlSize('small'), tint('#B3B3B3')]} />
        <Text modifiers={[
          font({ textStyle: 'footnote' }),
          foregroundStyle('#B3B3B3'),
          multilineTextAlignment('leading'),
        ]}>{mensaje}</Text>
      </HStack>
    </Host>
  )
}
