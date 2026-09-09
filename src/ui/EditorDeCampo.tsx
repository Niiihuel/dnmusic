import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, Text, TextInput, View } from 'react-native'
import { Field } from './Field'
import { BotonConfirmar, BotonHoja, EncabezadoHoja } from './EncabezadoHoja'
import { BarraCambiosPerfil } from './BarraCambiosPerfil'
import { useSalidaConCambios } from './useSalidaConCambios'
import { ICON_COLOR, IconAt, IconCheck, IconClose, IconMessage, IconUser } from './icons'
import { IconoAjuste, useAjustesCompactos } from './Ajustes'
import { isUsernameAvailable } from '../services/auth'
import { saveMyProfile } from '../services/profile'
import { setMyProfile, useMyProfile } from '../state/session'
import { avisar } from '../state/aviso'
import { actualizarPerfilEdicion, usePerfilEdicion } from '../state/perfilEdicion'
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
export function useEditorDeCampo(cual: CampoPerfil, onGuardado?: () => void, ocupado = false) {
  const profile = useMyProfile()

  const original =
    cual === 'usuario'
      ? (profile?.username ?? '')
      : cual === 'linea'
        ? (profile?.bio ?? '')
        : (profile?.displayName ?? '')

  const [textoLocal, setTextoLocal] = useState<string | null>(null)
  const edicion = usePerfilEdicion()
  const compartido = !!profile && edicion.ownerId === profile.userId
  const clave = cual === 'usuario' ? 'username' : cual === 'linea' ? 'bio' : 'displayName'
  const texto = compartido ? (edicion.cambios[clave] ?? null) : textoLocal
  const setTexto = (valor: string | null) => {
    if (compartido) actualizarPerfilEdicion({ [clave]: valor ?? original })
    else setTextoLocal(valor)
  }
  const valor = texto ?? original
  const [guardandoCampo, setBusy] = useState(false)
  const busy = guardandoCampo || ocupado || (compartido && edicion.ocupado)
  const guardando = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [checked, setChecked] = useState<{ username: string; free: boolean } | null>(null)
  const [checkFailed, setCheckFailed] = useState<string | null>(null)

  const esUsuario = cual === 'usuario'
  const cambiado = valor.trim() !== original.trim()
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
    if (!puedeGuardar || guardando.current) return
    if (compartido) { onGuardado?.(); return }
    guardando.current = true
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
      guardando.current = false
      setBusy(false)
    }
  }

  const campo: ReactNode =
    cual === 'usuario' ? (
      <Field
        label="Usuario"
        icon={<IconAt size={18} color={ICON_COLOR.muted} />}
        value={valor}
        editable={!busy}
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
      />
    ) : cual === 'linea' ? (
      <Field
        label="Tu línea"
        icon={<IconMessage size={18} color={ICON_COLOR.muted} />}
        value={valor}
        editable={!busy}
        onChangeText={setTexto}
        placeholder="Lo que estás escuchando últimamente"
        maxLength={180}
        hint="Una sola línea. Se ve en tu perfil, debajo del nombre."
      />
    ) : (
      <Field
        label="Nombre visible"
        icon={<IconUser size={18} color={ICON_COLOR.muted} />}
        value={valor}
        editable={!busy}
        onChangeText={setTexto}
        placeholder={profile?.username ?? ''}
        maxLength={40}
        hint="Cómo querés que te vean. Vacío muestra tu usuario."
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

  const perfilVistaPrevia = profile ? {
    ...profile,
    ...(cual === 'usuario' ? { username: valor.trim() }
      : cual === 'linea' ? { bio: valor.trim() || null }
        : { displayName: valor.trim() || null }),
  } : null

  function restablecer() {
    if (guardando.current || ocupado) return
    setTexto(null)
    setError(null)
    setChecked(null)
    setCheckFailed(null)
  }

  return { compartido, campo, error, busy, puedeGuardar, cambiado, guardar, restablecer, valor, cambiar, aviso, marca, placeholder, perfilVistaPrevia }

}

export type EditorCampoPerfil = ReturnType<typeof useEditorDeCampo>

/** Campo controlado por el borrador del editor principal; nunca persiste por fila. */
export function FilaCampo({ cual, editor, icono, iconoPlano = false, ultima = false, compacto = false }: {
  cual: CampoPerfil
  editor: EditorCampoPerfil
  icono?: ReactNode
  iconoPlano?: boolean
  ultima?: boolean
  /** En móvil, la etiqueta y el campo aprovechan cada uno el ancho completo. */
  compacto?: boolean
}) {
  const densidadCompacta = useAjustesCompactos()
  const esUsuario = cual === 'usuario'
  const esBio = cual === 'linea'
  const apilado = compacto || esBio
  const entrada = (
    <TextInput
      accessibilityLabel={TITULO_CAMPO[cual]}
      value={editor.valor}
      editable={!editor.busy}
      onChangeText={editor.cambiar}
      placeholder={editor.placeholder}
      placeholderTextColor="rgba(179,179,179,0.6)"
      autoCapitalize={esUsuario ? 'none' : 'sentences'}
      autoCorrect={!esUsuario}
      maxLength={esBio ? 180 : cual === 'nombre' ? 40 : undefined}
      multiline={esBio}
      scrollEnabled={!esBio}
      submitBehavior={esBio ? 'newline' : 'blurAndSubmit'}
      textAlignVertical={esBio ? 'top' : 'center'}
      className={`text-foreground ${densidadCompacta ? 'text-[15px]' : 'text-[17px]'} ${apilado ? 'text-left' : 'text-right'}`}
      style={esBio
        ? { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', paddingVertical: 6, paddingHorizontal: 0, lineHeight: 24 }
        : { minHeight: densidadCompacta ? 36 : 44, minWidth: apilado ? 0 : 120, flex: apilado ? undefined : 1, paddingVertical: densidadCompacta ? 4 : 6, paddingHorizontal: 0 }}
    />
  )
  return (
    <View className={densidadCompacta ? 'px-3' : 'px-4'}>
      <View className={`${densidadCompacta ? 'min-h-[44px] py-2' : 'min-h-[52px] py-3'} gap-1 ${ultima ? '' : 'border-b border-muted'}`}>
        <View className={apilado ? 'gap-1' : `${densidadCompacta ? 'min-h-[36px] gap-2.5' : 'min-h-[44px] gap-3'} flex-row items-center`}>
          <View className="flex-row items-center gap-2">
            {icono ? densidadCompacta || iconoPlano ? icono : <IconoAjuste>{icono}</IconoAjuste> : null}
            <Text className={apilado ? 'text-muted-foreground text-[14px]' : `text-foreground ${densidadCompacta ? 'text-[15px]' : 'text-[17px]'}`}>{TITULO_CAMPO[cual]}</Text>
          </View>
          {esBio ? (
            <View style={{ minHeight: 60 }}>
              {/* Este texto mide el contenido también al borrar o cambiar el ancho.
                  El input superpuesto conserva foco y crece sin scroll interno. */}
              <Text
                aria-hidden
                accessible={false}
                pointerEvents="none"
                style={{ opacity: 0, fontSize: 17, lineHeight: 24, paddingVertical: 6 }}
              >{`${editor.valor || editor.placeholder}\u200b`}</Text>
              {entrada}
            </View>
          ) : entrada}
          {editor.marca}
        </View>
        {editor.aviso || editor.error ? (
          <Text accessibilityLiveRegion="polite" className={`${apilado ? 'text-left' : 'text-right'} text-muted-foreground text-[13px]`}>{editor.error ?? editor.aviso}</Text>
        ) : null}
      </View>
    </View>
  )
}

/** Editor independiente con la misma confirmación que el resto del perfil. */
export function CampoEnLinea({ cual, onGuardado }: { cual: CampoPerfil; onGuardado?: () => void }) {
  const editor = useEditorDeCampo(cual, onGuardado)
  const dialogo = useSalidaConCambios(editor.cambiado, editor.busy)
  return (
    <View className="gap-4">
      {editor.campo}
      <BarraCambiosPerfil visible={editor.cambiado} ocupado={editor.busy} error={editor.error}
        puedeGuardar={editor.puedeGuardar} onRestablecer={editor.restablecer}
        onGuardar={() => void editor.guardar()} flotante={false} />
      {dialogo}
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

/** Acciones explícitas y siempre visibles, con áreas táctiles de al menos 44 pt. */
export function CabeceraEdicionPerfil({ titulo, ocupado, puedeGuardar, onCancelar, onGuardar, rotuloVolver = 'Cancelar' }: {
  titulo: string
  rotuloVolver?: string
  ocupado: boolean
  puedeGuardar?: boolean
  onCancelar: () => void
  onGuardar?: () => void
}) {
  return <EncabezadoHoja titulo={titulo} velo={false}
    izquierda={<BotonHoja tipo={rotuloVolver === 'Cancelar' ? 'cerrar' : 'volver'} label={rotuloVolver === 'Cancelar' ? 'Cancelar edición' : 'Volver a editar perfil'} disabled={ocupado} onPress={onCancelar} />}
    derecha={onGuardar ? <BotonConfirmar label="Guardar" activo={!!puedeGuardar} ocupado={ocupado} onPress={onGuardar} /> : undefined} />
}
