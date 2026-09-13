import { Platform, Text, View } from 'react-native'
import {
  textoEsperaGooglePara,
  type ContextoGoogle,
  type SuperficieGoogle,
} from './GoogleOAuthFeedback.shared'

export { mensajeErrorGoogle, type ContextoGoogle } from './GoogleOAuthFeedback.shared'

function superficieGoogle(): SuperficieGoogle {
  if (Platform.OS === 'web') {
    return (globalThis as { dnmusicEscritorio?: unknown }).dnmusicEscritorio ? 'escritorio' : 'web'
  }
  return Platform.OS === 'ios' ? 'ios' : 'otro'
}

export function textoEsperaGoogle(contexto: ContextoGoogle): string {
  return textoEsperaGooglePara(contexto, superficieGoogle())
}

/** Explica el salto al navegador mientras la transacción PKCE sigue abierta. */
export function EstadoGoogle({ activo, contexto }: { activo: boolean; contexto: ContextoGoogle }) {
  if (!activo) return null
  return <View accessibilityLiveRegion="polite" className="rounded-xl border border-border bg-muted px-3 py-3">
    <Text style={{ fontSize: 13, lineHeight: 20 }} className="text-muted-foreground">{textoEsperaGoogle(contexto)}</Text>
  </View>
}
