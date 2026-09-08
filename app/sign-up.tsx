import { useRef, useState } from 'react'
import { useRouter } from 'expo-router'
import { signInWithGoogle } from '../src/services/auth'
import { isSupabaseConfigured } from '../src/lib/supabase'
import { EnlaceAcceso, PantallaAcceso } from '../src/ui/Acceso'
import { FormError } from '../src/ui/Button'
import { AccionSocial } from '../src/ui/Social'
import { GoogleIcon } from '../src/ui/GoogleIcon'

export default function SignUp() {
  const router = useRouter()
  const submitting = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!isSupabaseConfigured || submitting.current) return
    submitting.current = true
    setBusy(true)
    setError(null)
    try {
      await signInWithGoogle()
      // La sesión y su permiso se resuelven en el guardia de acceso.
    } catch {
      setError('No se pudo continuar con Google. Intentá de nuevo.')
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return <PantallaAcceso titulo="Crear cuenta" detalle="Usá tu cuenta de Google para solicitar acceso. @nihuel revisará tu solicitud antes de que puedas entrar.">
    {!isSupabaseConfigured ? <FormError message="El registro no está disponible por ahora." /> : null}
    <FormError message={error} />
    <AccionSocial label="Continuar con Google" icono={<GoogleIcon />} onPress={submit} disabled={!isSupabaseConfigured || busy} busy={busy} expandida compacta />
    <EnlaceAcceso label="Ya tengo cuenta · Iniciar sesión" centrado disabled={busy} onPress={() => router.replace('/sign-in')} />
  </PantallaAcceso>
}
