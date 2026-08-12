import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { signIn } from '../src/services/auth'
import { isSupabaseConfigured } from '../src/lib/supabase'
import { ICON_COLOR, IconAt, IconMusic } from '../src/ui/icons'
import { Field, PasswordField } from '../src/ui/Field'
import { FormError, PrimaryButton } from '../src/ui/Button'

/**
 * Login privado, compacto y completamente acromático.
 *
 * **Sin tarjeta, a propósito.** El formulario estaba adentro de un `bg-card`
 * con su propio título —«Iniciar sesión», debajo de otro título que ya decía a
 * qué viniste— y eso es la forma genérica de toda app con dashboard: una caja
 * porque la pantalla tiene varias cosas y hay que separarlas. Acá la pantalla
 * tiene UNA cosa. Cuando el formulario es todo el contenido, la caja es marco
 * sin cuadro: **la pantalla es la tarjeta.**
 *
 * La separación por luminancia no se pierde, se reparte: los campos (`muted`)
 * se apoyan directo sobre el fondo, que es exactamente el contraste que antes
 * quedaba diluido en el escalón intermedio de la caja. Y la integración con el
 * fondo la hace una luz de arriba — un degradado apenas más claro que el
 * negro, que le da profundidad a la mitad superior sin dibujar un solo borde.
 * Es el mismo recurso del visor de mensajes: la jerarquía por luz, nunca por
 * línea (docs/DESIGN.md).
 */
export default function SignIn() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = username.trim().length > 0 && password.length > 0 && !busy

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await signIn(username, password)
    } catch (e) {
      setError(mapAuthError(e))
      setBusy(false)
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      {/* La luz de arriba. Del gris de `muted` al fondo, sin llegar nunca al
          blanco: el blanco es el acento y acá el acento es el botón. */}
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
        <View className="flex-1 items-center justify-center px-6 py-8">
          <View className="w-full max-w-[380px] gap-9">
            <View className="items-center gap-4">
              <View className="h-14 w-14 items-center justify-center rounded-full bg-muted">
                <IconMusic size={26} color={ICON_COLOR.foreground} />
              </View>
              <View className="items-center gap-2">
                <Text className="text-center text-foreground text-2xl font-bold">
                  Volvé a tus mensajes
                </Text>
                <Text className="max-w-xs text-center text-muted-foreground text-sm leading-5">
                  Un espacio privado para compartir palabras y canciones.
                </Text>
              </View>
            </View>

            <View className="gap-1">
              {!isSupabaseConfigured ? (
                <View className="mb-3 rounded-lg bg-muted p-3">
                  <Text className="text-muted-foreground text-xs leading-5">
                    Falta configurar Supabase. Copiá `.env.example` a `.env.local` y completá
                    las variables EXPO_PUBLIC_SUPABASE_*.
                  </Text>
                </View>
              ) : null}

              {/* Los campos compartidos de `src/ui/Field`, como en el registro
                  y el editor de perfil: un solo campo para toda la app. */}
              <Field
                label="Usuario"
                icon={<IconAt size={18} color={ICON_COLOR.muted} />}
                value={username}
                onChangeText={setUsername}
                placeholder="tu_usuario"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                textContentType="username"
                returnKeyType="next"
              />

              <PasswordField
                label="Contraseña"
                visible={showPassword}
                onToggleVisible={() => setShowPassword((v) => !v)}
                value={password}
                onChangeText={setPassword}
                placeholder="Tu contraseña"
                autoComplete="current-password"
                textContentType="password"
                onSubmitEditing={submit}
                returnKeyType="go"
              />
            </View>

            <View className="gap-5">
              <FormError message={error} />
              {/* La misma píldora del registro: con vidrio en iOS 26, blanca
                  sólida en el resto. Antes esta pantalla la dibujaba a mano. */}
              <PrimaryButton label="Entrar" onPress={submit} disabled={!canSubmit} busy={busy} />

              <View className="flex-row items-center justify-center gap-1.5">
                <Text className="text-muted-foreground text-[13px]">¿No tenés cuenta?</Text>
                <Pressable
                  accessibilityRole="link"
                  onPress={() => router.replace('/sign-up')}
                  className="active:opacity-70"
                >
                  <Text className="text-foreground text-[13px] font-semibold underline">
                    Creá una
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
