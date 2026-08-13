import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { isUsernameAvailable, signUp } from '../src/services/auth'
import { isSupabaseConfigured } from '../src/lib/supabase'
import { Field, PasswordField } from '../src/ui/Field'
import { FormError, PrimaryButton } from '../src/ui/Button'
import { ICON_COLOR, IconAt, IconCheck, IconClose, IconLock } from '../src/ui/icons'
import {
  normalizeUsername,
  passwordProblem,
  usernameProblem,
  PASSWORD_MIN,
} from '../src/models/username'

/** Espera tras la última tecla antes de preguntar si el usuario está libre. */
const CHECK_DEBOUNCE_MS = 400

type Availability = 'idle' | 'checking' | 'free' | 'taken' | 'unknown'

/**
 * Alta de cuenta.
 *
 * Es el gemelo del login y comparte con él el ancho, el ritmo y la decisión de
 * **no tener tarjeta**: el formulario es todo el contenido de la pantalla, así
 * que los campos se apoyan directo sobre el fondo y la profundidad la pone la
 * luz de arriba — ver el comentario largo en `sign-in`. La diferencia está en
 * que acá el usuario se verifica mientras se escribe: si el nombre está
 * tomado, enterarse recién al apretar "Crear cuenta" —después de haber elegido
 * contraseña dos veces— es la peor forma de descubrirlo.
 */
export default function SignUp() {
  const router = useRouter()
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
    !userProblem &&
    !passProblem &&
    confirm === password &&
    availability !== 'taken' &&
    availability !== 'checking' &&
    !busy

  async function submit() {
    if (!canSubmit) return
    setTouched({ username: true, password: true, confirm: true })
    setBusy(true)
    setError(null)
    try {
      await signUp(username, password)
      // La sesión queda iniciada; el guardia de _layout lleva al panel solo.
    } catch (e) {
      setError(mapSignUpError(e))
      setBusy(false)
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      {/* La misma luz de arriba que el login: profundidad por luminancia, sin
          una caja ni un borde. */}
      <LinearGradient
        pointerEvents="none"
        colors={['#222222', '#121212']}
        locations={[0, 1]}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 480 }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        {/* Con teclado abierto en pantalla chica el formulario no entra, así
            que va dentro de un scroll que se centra mientras sobra lugar. */}
        <ScrollView contentContainerClassName="grow items-center justify-center px-6 py-8">
          <View className="w-full max-w-[380px] gap-9">
            {/* El mismo ícono que el login; ver el comentario de allá. */}
            <View className="items-center gap-4">
              <Image
                source={require('../assets/icon.png')}
                /* Por `style`, no por clase; ver el comentario del login. */
                style={{ width: 64, height: 64, borderRadius: 14 }}
                accessibilityLabel="dnmusic"
              />
              <View className="items-center gap-2">
                <Text className="text-center text-foreground text-2xl font-bold">
                  Creá tu cuenta
                </Text>
                <Text className="max-w-xs text-center text-muted-foreground text-sm leading-5">
                  Elegí un usuario. Es con lo que te van a encontrar para escuchar juntos.
                </Text>
              </View>
            </View>

            <View className="gap-1">
              {!isSupabaseConfigured ? (
                <View className="mb-3 rounded-lg bg-muted p-3">
                  <Text className="text-muted-foreground text-xs leading-5">
                    Falta configurar Supabase. Copiá `.env.example` a `.env.local` y completá las
                    variables EXPO_PUBLIC_SUPABASE_*.
                  </Text>
                </View>
              ) : null}

              <Field
                label="Usuario"
                icon={<IconAt size={18} color={ICON_COLOR.muted} />}
                value={username}
                onChangeText={(text) => setUsername(normalizeUsername(text))}
                onBlur={() => setTouched((t) => ({ ...t, username: true }))}
                placeholder="tu_usuario"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                textContentType="username"
                returnKeyType="next"
                hint={hintFor(availability, username)}
                /* "ya está en uso" impide seguir, así que se muestra como error
                   y no como ayuda: en gris se lee como un dato más y el botón
                   apagado queda sin explicación. */
                error={
                  availability === 'taken'
                    ? `@${username} ya está en uso.`
                    : touched.username
                      ? userProblem
                      : null
                }
                accessory={<AvailabilityMark state={userProblem ? 'idle' : availability} />}
              />

              <PasswordField
                label="Contraseña"
                icon={<IconLock size={18} color={ICON_COLOR.muted} />}
                value={password}
                onChangeText={setPassword}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="next"
                visible={showPassword}
                onToggleVisible={() => setShowPassword((v) => !v)}
                hint={`Al menos ${PASSWORD_MIN} caracteres.`}
                error={touched.password ? passProblem : null}
              />

              <PasswordField
                label="Repetir contraseña"
                icon={<IconLock size={18} color={ICON_COLOR.muted} />}
                value={confirm}
                onChangeText={setConfirm}
                onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
                placeholder="La misma de arriba"
                autoComplete="new-password"
                textContentType="newPassword"
                onSubmitEditing={submit}
                returnKeyType="go"
                visible={showPassword}
                onToggleVisible={() => setShowPassword((v) => !v)}
                error={touched.confirm ? confirmProblem : null}
              />
            </View>

            <View className="gap-5">
              <FormError message={error} />

              <PrimaryButton label="Crear cuenta" onPress={submit} disabled={!canSubmit} busy={busy} />

              <View className="flex-row items-center justify-center gap-1.5">
                <Text className="text-muted-foreground text-[13px]">¿Ya tenés cuenta?</Text>
                <Pressable
                  accessibilityRole="link"
                  onPress={() => router.replace('/sign-in')}
                  className="active:opacity-70"
                >
                  <Text className="text-foreground text-[13px] font-semibold underline">
                    Iniciá sesión
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
