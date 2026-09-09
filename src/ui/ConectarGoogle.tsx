import { useEffect, useRef, useState } from 'react'
import { Text, View } from 'react-native'
import type { User } from '@supabase/supabase-js'
import { conectarGoogle, cancelarGoogle } from '../services/auth'
import { getSupabase } from '../lib/supabase'
import { AccionSocial } from './Social'
import { GoogleIcon } from './GoogleIcon'
import { GrupoAjustes } from './Ajustes'
import { GhostButton } from './Button'

const identidadGoogle = (user: User) => user.identities?.find(i => i.provider === 'google') ?? null

/** Misma sección de Cuenta en iOS y escritorio. No altera datos del perfil. */
export function ConectarGoogle({ user }: { user: User }) {
  const [identidad, setIdentidad] = useState(() => identidadGoogle(user))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const enCurso = useRef(false)
  const vigente = useRef(true)
  useEffect(() => {
    vigente.current = true
    let activa = true
    // getUser verifica el estado con Auth, incluso después de volver del navegador.
    void getSupabase().auth.getUser().then(({ data, error }) => {
      if (activa && !error && data.user?.id === user.id) setIdentidad(identidadGoogle(data.user))
    }).catch(() => {})
    return () => { activa = false; vigente.current = false }
  }, [user])

  async function conectar() {
    if (enCurso.current || identidad) return
    enCurso.current = true; setBusy(true); setError(null)
    try {
      const result = await conectarGoogle(user.id)
      if (vigente.current && result?.id === user.id) setIdentidad(identidadGoogle(result))
    } catch (e) {
      if (vigente.current) {
        const code = (e as { code?: string })?.code
        setError(code === 'manual_linking_disabled' ? 'La vinculación con Google todavía no está habilitada. Intentá más tarde.'
          : code === 'identity_already_exists' ? 'Ese Google ya está conectado a otra cuenta de DMusic. Elegí otro.'
          : e instanceof Error ? e.message : 'No se pudo conectar Google. Volvé a intentarlo.')
      }
    } finally {
      enCurso.current = false
      if (vigente.current) setBusy(false)
    }
  }
  const correo = typeof identidad?.identity_data?.email === 'string' ? identidad.identity_data.email : null
  return <GrupoAjustes titulo="Acceso con Google" pie="Conectá Google para entrar a esta misma cuenta. Conservás tu perfil, tus listas y tu acceso por usuario.">
    <View style={{ padding: 16, gap: 10 }}>
      {identidad ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <GoogleIcon size={18} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text className="text-foreground text-[15px] font-medium">Google conectado</Text>
          {correo ? <Text className="text-muted-foreground text-[13px]" numberOfLines={1}>{correo}</Text> : null}
        </View>
      </View> : <AccionSocial label="Conectar con Google" icono={<GoogleIcon />} onPress={() => void conectar()} busy={busy} disabled={busy} compacta expandida />}
      {busy ? <GhostButton label="Cancelar" onPress={() => void cancelarGoogle()} /> : null}
      {error ? <Text accessibilityRole="alert" className="text-destructive text-[13px]">{error}</Text> : null}
    </View>
  </GrupoAjustes>
}
