import { useEffect, useState, type ReactNode } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import { Field } from './Field'
import { FormError } from './Button'
import { ICON_COLOR, IconAt, IconCheck, IconClose, IconMessage, IconUser } from './icons'
import { IconoAjuste } from './Ajustes'
import { isUsernameAvailable } from '../services/auth'
import { saveMyProfile } from '../services/profile'
import { setMyProfile, useMyProfile } from '../state/session'
import { avisar } from '../state/aviso'
import { normalizeUsername, usernameProblem } from '../models/username'

const CHECK_DEBOUNCE_MS = 400

/** Qué campo del perfil se edita. */
export type CampoPerfil = 'nombre' | 'usuario' | 'linea'

export const TITULO_CAMPO: Record<CampoPerfil, string> = {
  nombre: 'Nombre visible',
  usuario: 'Usuario',
  linea: 'Tu línea',
}

type Availability = 'idle' | 'checking' | 'free' | 'taken' | 'unknown'

/**
 * Editar **un** campo del perfil: el campo, su validación y su guardado.
 *
 * Es un hook y no una pantalla porque el mismo campo vive en dos lugares: en
 * el teléfono es una pantalla apilada con su título y su marca de guardar
 * arriba (`app/profile/editar/[campo]`), y en la compu va **adentro** del
 * detalle de «Editar perfil», como un formulario de Ajustes del Sistema. Los
 * dos necesitan lo mismo —el campo dibujado, si se puede guardar, guardar— y
 * lo único que cambia es dónde ponen el botón.
 *
 * Los tres campos comparten el hook porque comparten casi todo —el guardado,
 * el manejo de errores— y lo único que cambia es qué se valida.
 *
 * **Guarda solo lo suyo.** `saveMyProfile` toma `undefined` como «no lo toques»,
 * así que entrar a cambiar el nombre no puede pisar el usuario por accidente.
 */
export function useEditorDeCampo(cual: CampoPerfil, onGuardado?: () => void) {
  const profile = useMyProfile()

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
      setTexto(null)
      avisar('Guardado')
      onGuardado?.()
    } catch (e) {
      setError(mensajeDe(e))
    } finally {
      setBusy(false)
    }
  }

  const campo: ReactNode =
    cual === 'usuario' ? (
      <Field
        label="Usuario"
        icon={<IconAt size={18} color={ICON_COLOR.muted} />}
        value={valor}
        onChangeText={(t) => setTexto(normalizeUsername(t))}
        autoCapitalize="none"
        autoCorrect={false}
        hint={availability === 'free' ? `@${valor} está libre.` : 'Con esto te encuentran los demás.'}
        error={
          availability === 'taken'
            ? `@${valor} ya está en uso.`
            : valor.length > 0
              ? problema
              : null
        }
        accessory={<Marca estado={problema ? 'idle' : availability} />}
        onSubmitEditing={() => void guardar()}
      />
    ) : cual === 'linea' ? (
      <Field
        label="Tu línea"
        icon={<IconMessage size={18} color={ICON_COLOR.muted} />}
        value={valor}
        onChangeText={setTexto}
        placeholder="Lo que estás escuchando últimamente"
        maxLength={180}
        hint="Una sola línea. Se ve en tu perfil, debajo del nombre."
        onSubmitEditing={() => void guardar()}
      />
    ) : (
      <Field
        label="Nombre visible"
        icon={<IconUser size={18} color={ICON_COLOR.muted} />}
        value={valor}
        onChangeText={setTexto}
        placeholder={profile?.username ?? ''}
        maxLength={40}
        hint="Cómo querés que te vean. Vacío muestra tu usuario."
        onSubmitEditing={() => void guardar()}
      />
    )

  /* Las piezas sueltas, para la fila de la compu (`FilaCampo`): el valor, cómo
     cambiarlo, el aviso y la marca de disponibilidad, sin el `Field` entero. */
  const cambiar = (t: string) => setTexto(esUsuario ? normalizeUsername(t) : t)
  const aviso: string | null =
    esUsuario && availability === 'taken'
      ? `@${valor} ya está en uso.`
      : esUsuario && valor.length > 0 && problema
        ? problema
        : null
  const marca = esUsuario ? <Marca estado={problema ? 'idle' : availability} /> : null
  const placeholder =
    cual === 'usuario' ? '@usuario' : cual === 'linea' ? 'Lo que estás escuchando' : (profile?.username ?? '')

  return { campo, error, busy, puedeGuardar, cambiado, guardar, valor, cambiar, aviso, marca, placeholder }
}

/**
 * El campo como **fila de Ajustes del Sistema**: el rótulo a la izquierda, el
 * texto editándose a la derecha, y «Guardar» solo cuando hay algo que
 * guardar. Es la fila «Nombre del equipo» de Compartir en macOS: nada de
 * etiquetas en mayúsculas ni cajas apiladas — una lista agrupada de tres
 * filas, con la explicación al pie del grupo.
 */
export function FilaCampo({
  cual,
  icono,
  ultima = false,
  onGuardado,
}: {
  cual: CampoPerfil
  icono?: ReactNode
  ultima?: boolean
  onGuardado?: () => void
}) {
  const editor = useEditorDeCampo(cual, onGuardado)
  const esUsuario = cual === 'usuario'
  return (
    <View className="flex-row items-center gap-3 pl-4">
      {icono ? <IconoAjuste>{icono}</IconoAjuste> : null}
      <View
        className={`min-h-[52px] min-w-0 flex-1 gap-1 py-2 pr-4 ${ultima ? '' : 'border-b border-muted'}`}
      >
        <View className="min-h-[36px] flex-row items-center gap-3">
          <Text className="shrink-0 text-foreground text-[17px]">{TITULO_CAMPO[cual]}</Text>
          <TextInput
            accessibilityLabel={TITULO_CAMPO[cual]}
            value={editor.valor}
            onChangeText={editor.cambiar}
            placeholder={editor.placeholder}
            placeholderTextColor="rgba(179,179,179,0.6)"
            autoCapitalize={esUsuario ? 'none' : 'sentences'}
            autoCorrect={!esUsuario}
            maxLength={cual === 'linea' ? 180 : cual === 'nombre' ? 40 : undefined}
            onSubmitEditing={() => void editor.guardar()}
            className="min-w-0 flex-1 text-right text-foreground text-[17px]"
            style={{ paddingVertical: 0 }}
          />
          {editor.marca}
          {editor.cambiado ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Guardar ${TITULO_CAMPO[cual].toLowerCase()}`}
              accessibilityState={{ disabled: !editor.puedeGuardar }}
              disabled={!editor.puedeGuardar}
              onPress={() => void editor.guardar()}
              className={`h-8 flex-row items-center justify-center rounded-full px-3.5 ${
                editor.puedeGuardar ? 'bg-primary active:opacity-80' : 'bg-muted'
              }`}
            >
              {editor.busy ? (
                <ActivityIndicator size="small" color={ICON_COLOR.onPrimary} />
              ) : (
                <Text
                  className={`text-[13px] font-semibold ${
                    editor.puedeGuardar ? 'text-primary-foreground' : 'text-muted-foreground'
                  }`}
                >
                  Guardar
                </Text>
              )}
            </Pressable>
          ) : null}
        </View>
        {editor.aviso || editor.error ? (
          <Text className="text-right text-muted-foreground text-[13px]">{editor.error ?? editor.aviso}</Text>
        ) : null}
      </View>
    </View>
  )
}

/**
 * El campo con su botón chico al lado, para el formulario de la compu.
 *
 * Es la fila de un formulario de Ajustes del Sistema: el campo, y a la
 * derecha «Guardar» solo cuando hay algo que guardar. Sin cambios no hay
 * botón — un formulario con tres «Guardar» permanentes se lee como tres
 * pendientes.
 */
export function CampoEnLinea({ cual, onGuardado }: { cual: CampoPerfil; onGuardado?: () => void }) {
  const editor = useEditorDeCampo(cual, onGuardado)
  return (
    <View className="gap-2">
      <View className="flex-row items-end gap-3">
        <View className="min-w-0 flex-1">{editor.campo}</View>
        {editor.cambiado ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Guardar ${TITULO_CAMPO[cual].toLowerCase()}`}
            accessibilityState={{ disabled: !editor.puedeGuardar }}
            disabled={!editor.puedeGuardar}
            onPress={() => void editor.guardar()}
            /* Alineado con el campo (56 de alto) y no con su pie. */
            className={`mb-6 h-10 flex-row items-center justify-center rounded-full px-4 ${
              editor.puedeGuardar ? 'bg-primary active:opacity-80' : 'bg-muted'
            }`}
          >
            {editor.busy ? (
              <ActivityIndicator size="small" color={ICON_COLOR.onPrimary} />
            ) : (
              <Text
                className={`text-[13px] font-semibold ${
                  editor.puedeGuardar ? 'text-primary-foreground' : 'text-muted-foreground'
                }`}
              >
                Guardar
              </Text>
            )}
          </Pressable>
        ) : null}
      </View>
      <FormError message={editor.error} />
    </View>
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
