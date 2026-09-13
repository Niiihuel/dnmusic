import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { conectarGoogle, cancelarGoogle } from '../services/auth'
import { getSupabase } from '../lib/supabase'
import { GoogleIcon } from './GoogleIcon'
import { mensajeErrorGoogle, textoEsperaGoogle } from './GoogleOAuthFeedback'
import { FilaAccion, FilaDato, GrupoAjustes } from './Ajustes'

const identidadGoogle = (user: User) => user.identities?.find(i => i.provider === 'google') ?? null

/**
 * Misma sección de Cuenta en iOS y escritorio. No altera datos del perfil.
 *
 * Son filas del bloque y no botones: la píldora ancha de `AccionSocial` es del
 * formulario de acceso —ahí es la única acción de la pantalla y ocupa el ancho
 * porque no compite con nada—, pero adentro de una lista agrupada mide el doble
 * que una fila y grita en versalitas. Acá conectar es una fila más, como
 * «Agregar cuenta» en Ajustes del Sistema, y el error va al pie de su bloque.
 */
export function ConectarGoogle({ user, onConectado }: { user: User; onConectado?: () => void }) {
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
      if (vigente.current && result?.id === user.id) {
        const conectada = identidadGoogle(result)
        setIdentidad(conectada)
        if (conectada) onConectado?.()
      }
    } catch (e) {
      if (vigente.current) {
        setError(mensajeErrorGoogle(e, 'No se pudo conectar Google. Volvé a intentarlo.'))
      }
    } finally {
      enCurso.current = false
      if (vigente.current) setBusy(false)
    }
  }
  const correo = typeof identidad?.identity_data?.email === 'string' ? identidad.identity_data.email : null
  return <GrupoAjustes
    titulo="Acceso con Google"
    pie={busy ? textoEsperaGoogle('vinculacion') : 'Conectá Google para volver a entrar a esta misma cuenta. Conservás tu perfil y tus listas.'}
    error={error}
  >
    {identidad
      ? <FilaDato rotulo="Google conectado" valor={correo ?? 'Sí'} icono={<GoogleIcon size={17} />} iconoPlano ultima />
      : <FilaAccion rotulo={busy ? 'Esperando a Google…' : 'Conectar con Google'} icono={<GoogleIcon size={17} />} iconoPlano
          busy={busy} onPress={() => void conectar()} ultima={!busy} />}
    {/* Mientras espera el navegador, salirse es una fila más — no un botón
        flotando debajo del bloque, que era lo único ahí abajo. */}
    {busy ? <FilaAccion rotulo="Cancelar" onPress={() => void cancelarGoogle()} ultima /> : null}
  </GrupoAjustes>
}
