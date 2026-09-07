import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { isUsernameAvailable, signUp } from '../src/services/auth'
import { marcarOnboardingPendiente } from '../src/services/semillas'
import { isSupabaseConfigured } from '../src/lib/supabase'
import { CampoAcceso, PantallaAcceso } from '../src/ui/Acceso'
import { FormError } from '../src/ui/Button'
import { AccionSocial } from '../src/ui/Social'
import { ICON_COLOR, IconCheck, IconClose } from '../src/ui/icons'
import { normalizeUsername, passwordProblem, usernameProblem, PASSWORD_MIN } from '../src/models/username'

/** Espera tras la última tecla antes de preguntar si el usuario está libre. */
const CHECK_DEBOUNCE_MS = 400

type Availability = 'idle' | 'checking' | 'free' | 'taken' | 'unknown'

/** Registro con disponibilidad del usuario y validación antes de crear la cuenta. */
export default function SignUp() {
  const router = useRouter()
  const passwordRef = useRef<TextInput>(null)
  const confirmRef = useRef<TextInput>(null)
  const submitting = useRef(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  /** Última respuesta del servidor, atada al texto que se consultó. */
  const [checked, setChecked] = useState<{ username: string; free: boolean } | null>(null)
  /** Usuario cuya consulta falló; sirve para no reintentar en bucle. */
  const [checkFailed, setCheckFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Solo se marcan como erróneos los campos que ya se tocaron. */
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const userProblem = usernameProblem(username)
  const passProblem = passwordProblem(password)
  const confirmProblem = confirm.length > 0 && confirm !== password ? 'No coinciden.' : null

  /*
   * El estado se deriva, no se sincroniza.
   *
   * La respuesta se guarda junto al texto que se consultó, así que "estoy
   * consultando" es simplemente "todavía no tengo respuesta para lo que hay
   * escrito ahora". Eso resuelve solo el problema de las respuestas fuera de
   * orden —la de "dan" llegando después de la de "dany"— porque una respuesta
   * vieja nunca coincide con el texto actual y se ignora sin más.
   */
  const availability: Availability = userProblem
    ? 'idle'
    : checkFailed === username
      ? 'unknown'
      : checked?.username === username
        ? checked.free
          ? 'free'
          : 'taken'
        : 'checking'

  useEffect(() => {
    if (userProblem || checked?.username === username || checkFailed === username) return
    let alive = true
    const timer = setTimeout(() => {
      isUsernameAvailable(username)
        .then((free) => alive && setChecked({ username, free }))
        .catch(() => alive && setCheckFailed(username))
    }, CHECK_DEBOUNCE_MS)

    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [username, userProblem, checked, checkFailed])

  const canSubmit =
    isSupabaseConfigured &&
    !userProblem &&
    !passProblem &&
    confirm === password &&
    availability !== 'taken' &&
    availability !== 'checking' &&
    !busy

  async function submit() {
    if (!canSubmit || submitting.current) return
    submitting.current = true
    setTouched({ username: true, password: true, confirm: true })
    setBusy(true)
    setError(null)
    try {
      await signUp(username, password)
      /* La cuenta nueva todavía no sabe nada de sí misma: la bandera manda al
         onboarding en cuanto el guardia de `_layout` vea la sesión. Si el
         aparato pierde la app antes del paseo, retoma en el próximo login —
         y si no, la radio arranca sin semillas, como siempre hizo. */
      await marcarOnboardingPendiente()
      // La sesión queda iniciada; el guardia lleva a elegir géneros.
    } catch (e) {
      submitting.current = false
      setError(mapSignUpError(e))
      setBusy(false)
    }
  }


  return (
    <PantallaAcceso titulo="Crear cuenta" detalle="Elegí cómo te van a encontrar para escuchar juntos.">
      {!isSupabaseConfigured ? <FormError message="El registro no está disponible por ahora." /> : null}
      <View className="gap-4">
        <CampoAcceso label="Usuario" value={username} onChangeText={text => setUsername(normalizeUsername(text))}
          onBlur={() => setTouched(t => ({ ...t, username: true }))} placeholder="tu_usuario" editable={!busy}
          autoComplete="username" textContentType="username" returnKeyType="next" submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()} hint={hintFor(availability, username)}
          error={availability === 'taken' ? `@${username} ya está en uso.` : touched.username ? userProblem : null}
          accessory={<AvailabilityMark state={userProblem ? 'idle' : availability} />} />
        <CampoAcceso ref={passwordRef} label="Contraseña" password visible={showPassword}
          onToggleVisible={() => setShowPassword(v => !v)} value={password} onChangeText={setPassword}
          onBlur={() => setTouched(t => ({ ...t, password: true }))} editable={!busy}
          placeholder={`Mínimo ${PASSWORD_MIN} caracteres`} autoComplete="new-password" textContentType="newPassword"
          returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => confirmRef.current?.focus()}
          hint={`Al menos ${PASSWORD_MIN} caracteres.`} error={touched.password ? passProblem : null} />
        <CampoAcceso ref={confirmRef} label="Repetir contraseña" password visible={showPassword}
          onToggleVisible={() => setShowPassword(v => !v)} value={confirm} onChangeText={setConfirm}
          onBlur={() => setTouched(t => ({ ...t, confirm: true }))} editable={!busy} placeholder="Repetí tu contraseña"
          autoComplete="new-password" textContentType="newPassword" onSubmitEditing={submit} returnKeyType="go"
          error={touched.confirm ? confirmProblem : null} />
      </View>
      <View className="gap-3">
        <FormError message={error} />
        <AccionSocial label="Crear cuenta" onPress={submit} disabled={!canSubmit || !isSupabaseConfigured} busy={busy} style={{ alignSelf: 'flex-end' }} />
        <View className="flex-row flex-wrap items-center justify-center gap-x-1">
          <Text className="text-muted-foreground text-[15px]">¿Ya tenés cuenta?</Text>
          <Pressable accessibilityRole="link" disabled={busy} accessibilityState={{ disabled: busy }}
            onPress={() => router.replace('/sign-in')} className="min-h-11 items-center justify-center px-2 active:opacity-70">
            <Text className="text-foreground text-[15px] font-medium">Iniciar sesión</Text>
          </Pressable>
        </View>
      </View>
    </PantallaAcceso>
  )
}

/** Tilde, cruz o spinner al costado del usuario. */
function AvailabilityMark({ state }: { state: Availability }) {
  if (state === 'checking') return <ActivityIndicator size="small" color={ICON_COLOR.muted} />
  if (state === 'free') return <IconCheck size={18} color={ICON_COLOR.foreground} />
  // Gris, no rojo: la paleta no tiene colores de marca (docs/DESIGN.md).
  // Lo que marca el error es la palabra debajo del campo, no un tono.
  if (state === 'taken') return <IconClose size={18} color={ICON_COLOR.foreground} />
  return null
}

function hintFor(state: Availability, username: string): string {
  if (state === 'free') return `@${username} está libre.`
  if (state === 'unknown') return 'No se pudo verificar; se confirma al crear la cuenta.'
  return 'Letras, números y guion bajo.'
}

function mapSignUpError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? ''
  const message = (error as { message?: string })?.message ?? ''
  // El índice único de profiles es la defensa real contra el nombre repetido:
  // la consulta de disponibilidad puede quedar vieja entre que se escribe y se
  // envía, y dos altas simultáneas del mismo nombre solo chocan acá.
  if (message.includes('profiles_username_key') || message.includes('duplicate key')) {
    return 'Ese usuario ya está en uso. Probá con otro.'
  }
  if (code === 'user_already_exists' || message.includes('already registered')) {
    return 'Ese usuario ya está en uso. Probá con otro.'
  }
  if (code === 'weak_password') return 'Esa contraseña es demasiado débil.'
  if (code === 'signup_disabled') return 'El registro está cerrado por ahora.'
  if (code === 'over_request_rate_limit') return 'Demasiados intentos. Probá de nuevo en un rato.'
  if (message.includes('Failed to fetch') || message.includes('Network')) return 'Sin conexión.'
  return 'No se pudo crear la cuenta. Intentá de nuevo.'
}
