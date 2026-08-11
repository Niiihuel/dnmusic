import { useEffect, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Field } from '../../../src/ui/Field'
import { FormError, PrimaryButton } from '../../../src/ui/Button'
import { Panel } from '../../../src/ui/Panel'
import { ICON_COLOR, IconAt, IconBack, IconCheck, IconClose, IconMessage, IconUser } from '../../../src/ui/icons'
import { isUsernameAvailable } from '../../../src/services/auth'
import { saveMyProfile } from '../../../src/services/profile'
import { setMyProfile, useMyProfile } from '../../../src/state/session'
import { usePiso } from '../../../src/state/shell'
import { avisar } from '../../../src/state/aviso'
import { normalizeUsername, usernameProblem } from '../../../src/models/username'
import { volver } from '../../../src/lib/volver'

const CHECK_DEBOUNCE_MS = 400
const MAX_W = 520

/** Qué campo se está editando. Llega por la ruta. */
type Campo = 'nombre' | 'usuario' | 'linea'

const TITULO: Record<Campo, string> = {
  nombre: 'Nombre visible',
  usuario: 'Usuario',
  linea: 'Tu línea',
}

type Availability = 'idle' | 'checking' | 'free' | 'taken' | 'unknown'

/**
 * Editar **un** campo del perfil, en su propia pantalla.
 *
 * Es la contraparte de las filas de `GrupoAjustes`: en Ajustes de iOS, tocar
 * una fila empuja una pantalla que hace una sola cosa, con su título y su
 * camino de vuelta. Acá igual.
 *
 * Los tres campos comparten pantalla en vez de tener un archivo cada uno porque
 * comparten casi todo —el marco, el guardado, el manejo de errores— y lo único
 * que cambia es qué se valida. Tres archivos serían tres copias del mismo
 * andamiaje esperando a desincronizarse, que es lo que ya nos pasó con las capas
 * de estado de las tapas.
 *
 * **Guarda solo lo suyo.** `saveMyProfile` toma `undefined` como «no lo toques»,
 * así que entrar a cambiar el nombre no puede pisar el usuario por accidente.
 */
export default function EditarCampo() {
  /* El campo llega por la ruta —`/profile/editar/usuario`— y no por query:
     así cada uno tiene su URL propia, que es lo que hace que el botón de
     atrás del navegador funcione como uno espera. */
  const { campo } = useLocalSearchParams<{ campo?: string }>()
  const cual: Campo = campo === 'usuario' ? 'usuario' : campo === 'linea' ? 'linea' : 'nombre'
  const router = useRouter()
  const profile = useMyProfile()
  const piso = usePiso(24)

  const original =
    cual === 'usuario'
      ? (profile?.username ?? '')
      : cual === 'linea'
        ? (profile?.bio ?? '')
        : (profile?.displayName ?? '')

  const [texto, setTexto] = useState<string | null>(null)
  const valor = texto ?? original
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checked, setChecked] = useState<{ username: string; free: boolean } | null>(null)
  const [checkFailed, setCheckFailed] = useState<string | null>(null)

  const esUsuario = cual === 'usuario'
  const cambiado = valor !== original
  const problema = esUsuario ? usernameProblem(valor) : null

  /* Igual que en el alta: el estado sale de la respuesta guardada junto al texto
     consultado, así una respuesta vieja nunca pisa a una nueva. */
  const availability: Availability =
    !esUsuario || !cambiado || problema
      ? 'idle'
      : checkFailed === valor
        ? 'unknown'
        : checked?.username === valor
          ? checked.free
            ? 'free'
            : 'taken'
          : 'checking'

  useEffect(() => {
    if (!esUsuario || !cambiado || problema) return
    if (checked?.username === valor || checkFailed === valor) return
    let vivo = true
    const t = setTimeout(() => {
      isUsernameAvailable(valor)
        .then((free) => vivo && setChecked({ username: valor, free }))
        .catch(() => vivo && setCheckFailed(valor))
    }, CHECK_DEBOUNCE_MS)
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [valor, esUsuario, cambiado, problema, checked, checkFailed])

  const puedeGuardar =
    cambiado && !problema && availability !== 'taken' && availability !== 'checking' && !busy

  async function guardar() {
    if (!puedeGuardar) return
    setBusy(true)
    setError(null)
    try {
      /* Cadena vacía significa «borralo»; lo que no se manda queda como está. */
      const next = await saveMyProfile(
        cual === 'usuario'
          ? { username: valor }
          : cual === 'linea'
            ? { bio: valor }
            : { displayName: valor },
      )
      setMyProfile(next)
      avisar('Guardado')
      volver(router, '/profile/editar')
    } catch (e) {
      setError(mensajeDe(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-1">
        <View className="flex-row items-center gap-3 px-3 py-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver"
            onPress={() => volver(router, '/profile/editar')}
            className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
          >
            <IconBack size={19} color={ICON_COLOR.foreground} />
          </Pressable>
          <Text className="text-foreground text-[15px] font-semibold">{TITULO[cual]}</Text>
        </View>

        <Panel className="flex-1">
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            className="flex-1"
          >
            <ScrollView
              contentContainerClassName="grow items-center px-6 pt-6"
              contentContainerStyle={{ paddingBottom: piso }}
            >
              <View className="w-full gap-5" style={{ maxWidth: MAX_W }}>
                {cual === 'usuario' ? (
                  <Field
                    label="Usuario"
                    icon={<IconAt size={18} color={ICON_COLOR.muted} />}
                    value={valor}
                    onChangeText={(t) => setTexto(normalizeUsername(t))}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                    hint={
                      availability === 'free'
                        ? `@${valor} está libre.`
                        : 'Con esto te encuentran los demás.'
                    }
                    error={
                      availability === 'taken'
                        ? `@${valor} ya está en uso.`
                        : valor.length > 0
                          ? problema
                          : null
                    }
                    accessory={<Marca estado={problema ? 'idle' : availability} />}
                  />
                ) : cual === 'linea' ? (
                  <Field
                    label="Tu línea"
                    icon={<IconMessage size={18} color={ICON_COLOR.muted} />}
                    value={valor}
                    onChangeText={setTexto}
                    placeholder="Lo que estás escuchando últimamente"
                    maxLength={180}
                    autoFocus
                    hint="Una sola línea. Se ve en tu perfil, debajo del nombre."
                  />
                ) : (
                  <Field
                    label="Nombre visible"
                    icon={<IconUser size={18} color={ICON_COLOR.muted} />}
                    value={valor}
                    onChangeText={setTexto}
                    placeholder={profile?.username ?? ''}
                    maxLength={40}
                    autoFocus
                    hint="Cómo querés que te vean. Vacío muestra tu usuario."
                  />
                )}

                <FormError message={error} />

                <PrimaryButton
                  label={busy ? 'Guardando…' : 'Guardar'}
                  onPress={() => void guardar()}
                  disabled={!puedeGuardar}
                  busy={busy}
                />
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Panel>
      </View>
    </SafeAreaView>
  )
}

/** El tilde, la cruz o el reloj del usuario, según cómo venga la consulta. */
function Marca({ estado }: { estado: Availability }) {
  if (estado === 'checking') return <ActivityIndicator size="small" color={ICON_COLOR.muted} />
  if (estado === 'free') return <IconCheck size={16} color={ICON_COLOR.foreground} />
  if (estado === 'taken') return <IconClose size={16} color={ICON_COLOR.muted} />
  return null
}

function mensajeDe(e: unknown): string {
  const texto = (e as Error)?.message ?? ''
  if (texto.includes('usuario_invalido')) return 'Ese usuario no es válido.'
  if (texto.includes('duplicate') || texto.includes('unique')) return 'Ese usuario ya está en uso.'
  return texto || 'No se pudo guardar.'
}
