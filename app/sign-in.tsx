import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { signIn } from '../src/services/auth'
import { isSupabaseConfigured } from '../src/lib/supabase'
import {
  ICON_COLOR,
  IconAt,
  IconEye,
  IconEyeOff,
  IconLock,
  IconMusic,
} from '../src/ui/icons'

/** Login privado, compacto y completamente acromático. */
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <View className="flex-1 items-center justify-center px-5 py-8">
          <View className="w-full max-w-[420px] gap-7">
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

            <View className="gap-5 rounded-2xl bg-card p-6">
              <View className="gap-1">
                <Text className="text-foreground text-lg font-semibold">Iniciar sesión</Text>
                <Text className="text-muted-foreground text-xs">Ingresá con tu cuenta.</Text>
              </View>

              {!isSupabaseConfigured ? (
                <View className="rounded-lg bg-muted p-3">
                  <Text className="text-muted-foreground text-xs leading-5">
                    Falta configurar Supabase. Copiá `.env.example` a `.env.local` y completá
                    las variables EXPO_PUBLIC_SUPABASE_*.
                  </Text>
                </View>
              ) : null}

              <View className="gap-4">
                <View className="gap-2">
                  <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-[0.8px]">
                    Usuario
                  </Text>
                  <View className="h-14 flex-row items-center gap-3 rounded-lg bg-muted px-4">
                    <IconAt size={18} color={ICON_COLOR.muted} />
                    <TextInput
                      value={username}
                      onChangeText={setUsername}
                      placeholder="tu_usuario"
                      placeholderTextColor="#777777"
                      accessibilityLabel="Usuario"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="username"
                      textContentType="username"
                      returnKeyType="next"
                      className="h-full flex-1 text-foreground text-[15px]"
                    />
                  </View>
                </View>

                <View className="gap-2">
                  <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-[0.8px]">
                    Contraseña
                  </Text>
                  <View className="h-14 flex-row items-center gap-3 rounded-lg bg-muted px-4">
                    <IconLock size={18} color={ICON_COLOR.muted} />
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      placeholder="Tu contraseña"
                      placeholderTextColor="#777777"
                      accessibilityLabel="Contraseña"
                      secureTextEntry={!showPassword}
                      autoComplete="current-password"
                      textContentType="password"
                      onSubmitEditing={submit}
                      returnKeyType="go"
                      className="h-full flex-1 text-foreground text-[15px]"
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      onPress={() => setShowPassword((visible) => !visible)}
                      className="h-10 w-10 items-center justify-center rounded-full active:bg-background"
                    >
                      {showPassword ? (
                        <IconEyeOff size={18} color={ICON_COLOR.muted} />
                      ) : (
                        <IconEye size={18} color={ICON_COLOR.muted} />
                      )}
                    </Pressable>
                  </View>
                </View>
              </View>

              {error ? (
                <View className="rounded-lg bg-muted px-4 py-3">
                  <Text className="text-destructive text-[13px] leading-5">{error}</Text>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                disabled={!canSubmit}
                onPress={submit}
                className={`h-[52px] items-center justify-center rounded-full ${
                  canSubmit ? 'bg-primary active:opacity-80' : 'bg-muted'
                }`}
              >
                {busy ? (
                  <ActivityIndicator color="#121212" />
                ) : (
                  <Text
                    className={`text-[13px] font-semibold uppercase tracking-[1.4px] ${
                      canSubmit ? 'text-primary-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    Entrar
                  </Text>
                )}
              </Pressable>
            </View>

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
