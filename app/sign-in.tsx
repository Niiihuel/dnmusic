import { useRef, useState } from 'react'
import { signInWithGoogle } from '../src/services/auth'
import { isSupabaseConfigured } from '../src/lib/supabase'
import { NotaAcceso, PantallaAcceso } from '../src/ui/Acceso'
import { FormError } from '../src/ui/Button'
import { EstadoGoogle, mensajeErrorGoogle } from '../src/ui/GoogleOAuthFeedback'
import { GoogleOAuthButton } from '../src/ui/GoogleOAuthButton'

/** Una sola puerta: Google inicia la sesión o crea la solicitud de acceso. */
export default function SignIn() {
  const submitting = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function google() {
    if (!isSupabaseConfigured || submitting.current) return
    submitting.current = true
    setBusy(true)
    setError(null)
    try {
      await signInWithGoogle()
    } catch (e) {
      setError(mensajeErrorGoogle(e, 'No se pudo continuar con Google. Intentá de nuevo.'))
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return <PantallaAcceso titulo="Iniciar sesión" detalle="Volvé a tu música.">
    {!isSupabaseConfigured ? <FormError message="El acceso no está disponible por ahora." /> : null}
    <GoogleOAuthButton label={busy ? 'Esperando a Google…' : 'Continuar con Google'}
      onPress={google} disabled={!isSupabaseConfigured || busy} busy={busy} />
    <EstadoGoogle activo={busy} contexto="acceso" />
    <FormError message={error} />
    <NotaAcceso>Si es tu primera vez, usá Google para crear tu cuenta y solicitar acceso.</NotaAcceso>
  </PantallaAcceso>
}
