import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'expo-router'
import { getSupabase } from '../lib/supabase'
import { useUser, useAccessStatus } from '../state/session'
import { useNovedadesPendientes } from '../state/novedadesVistas'
import { useAjustesCargados, usePreferencia } from '../state/ajustes'

/** Una invitación por sesión, verificada con Auth. Nunca abre OAuth por sí sola. */
export function AvisoVincularGoogle() {
  const user = useUser(), acceso = useAccessStatus()
  const pathname = usePathname(), router = useRouter()
  const novedades = useNovedadesPendientes(), ajustesListos = useAjustesCargados()
  const mostrarNovedades = usePreferencia('novedadesAlAbrir')
  const ocupado = !ajustesListos || (mostrarNovedades && !!novedades?.length)
  const visto = useRef<string | null>(null)
  const cuenta = useRef<string | null>(null)
  useEffect(() => {
    const id = user?.id ?? null
    if (cuenta.current !== id) { cuenta.current = id; visto.current = null }
    if (!id || acceso?.status !== 'approved' || pathname !== '/' || ocupado || visto.current === id) return
    let activo = true
    void getSupabase().auth.getUser().then(({ data, error }) => {
      if (!activo || error || data.user?.id !== id || !Array.isArray(data.user.identities)) return
      if (data.user.identities.some(i => i.provider === 'google')) return
      visto.current = id
      router.push('/vincular-google')
    }).catch(() => { /* Sin confirmación de Auth, no interrumpir al usuario. */ })
    return () => { activo = false }
  }, [user?.id, acceso?.status, pathname, ocupado, router])
  return null
}
