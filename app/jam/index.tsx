import { KeyboardAvoidingView, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import { volver } from '../../src/lib/volver'
import { Hoja } from '../../src/ui/Hoja'
import { JamBody } from '../../src/ui/JamPanel'
import { CabeceraSocial } from '../../src/ui/Social'

/** El mismo contenido y acciones en el panel de PC y la hoja de iOS. */
export default function JamSheet() {
  const router = useRouter()
  return <Hoja anchoMaximo={560}>
    <KeyboardAvoidingView className="flex-1 bg-background" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <CabeceraSocial titulo="Escuchar juntos" detalle="Una cola compartida, en cualquier lugar" onCerrar={() => volver(router, '/')} />
      <JamBody enHoja />
    </KeyboardAvoidingView>
  </Hoja>
}
