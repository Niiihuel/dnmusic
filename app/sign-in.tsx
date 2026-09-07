import { useRef, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { signIn } from '../src/services/auth'
import { isSupabaseConfigured } from '../src/lib/supabase'
import { CampoAcceso, PantallaAcceso } from '../src/ui/Acceso'
import { FormError } from '../src/ui/Button'
import { AccionSocial } from '../src/ui/Social'

export default function SignIn() {
  const router = useRouter()
  const passwordRef = useRef<TextInput>(null)
  const submitting = useRef(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = isSupabaseConfigured && username.trim().length > 0 && password.length > 0 && !busy

  async function submit() {
    if (!canSubmit || submitting.current) return
    submitting.current = true
    setBusy(true)
    setError(null)
    try {
      await signIn(username, password)
    } catch (e) {
      submitting.current = false
      setError(mapAuthError(e))
      setBusy(false)
    }
  }

  return (
    <PantallaAcceso titulo="Iniciar sesión" detalle="Volvé a tu música.">
      {!isSupabaseConfigured ? <FormError message="El acceso no está disponible por ahora." /> : null}
      <View className="gap-4">
        <CampoAcceso label="Usuario" value={username} onChangeText={setUsername} placeholder="Tu usuario"
          editable={!busy} autoComplete="username" textContentType="username" returnKeyType="next"
          submitBehavior="submit" onSubmitEditing={() => passwordRef.current?.focus()} />
        <CampoAcceso ref={passwordRef} label="Contraseña" password visible={showPassword}
          onToggleVisible={() => setShowPassword(v => !v)} value={password} onChangeText={setPassword}
          editable={!busy} placeholder="Tu contraseña" autoComplete="current-password" textContentType="password"
          onSubmitEditing={submit} returnKeyType="go" />
      </View>
      <View className="gap-3">
        <FormError message={error} />
        <AccionSocial label="Iniciar sesión" onPress={submit} disabled={!canSubmit || !isSupabaseConfigured} busy={busy} style={{ alignSelf: 'flex-end' }} />
        <View className="flex-row flex-wrap items-center justify-center gap-x-1">
          <Text className="text-muted-foreground text-[15px]">¿No tenés cuenta?</Text>
          <Pressable accessibilityRole="link" disabled={busy} accessibilityState={{ disabled: busy }}
            onPress={() => router.replace('/sign-up')} className="min-h-11 items-center justify-center px-2 active:opacity-70">
            <Text className="text-foreground text-[15px] font-medium">Crear cuenta</Text>
          </Pressable>
        </View>
      </View>
    </PantallaAcceso>
  )
}

function mapAuthError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? ''
  const message = (error as { message?: string })?.message ?? ''
  if (code === 'invalid_credentials') return 'Usuario o contraseña incorrectos.'
  if (code === 'validation_failed') return 'Ese usuario no tiene un formato válido.'
  if (code === 'over_request_rate_limit') return 'Demasiados intentos. Probá de nuevo en un rato.'
  if (message.includes('Failed to fetch') || message.includes('Network')) return 'Sin conexión.'
  return 'No se pudo entrar. Intentá de nuevo.'
}
