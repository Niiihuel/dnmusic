import { useEffect, useRef } from 'react'
import { Alert } from 'react-native'
import { useRouter, useSegments } from 'expo-router'
import { marcarNovedadesVistas, useNovedadesPendientes } from '../state/novedadesVistas'
import { useAjustesCargados, usePreferencia } from '../state/ajustes'
import { useUser } from '../state/session'

export function NovedadesAlAbrir() {
  const pendientes = useNovedadesPendientes()
  const usuario = useUser()
  const segmentos = useSegments() as string[]
  const router = useRouter()
  const mostrar = usePreferencia('novedadesAlAbrir')
  const cargados = useAjustesCargados()
  const primera = pendientes?.[0]
  const visible = !!primera && !!usuario && segmentos[0] !== 'onboarding' && segmentos[0] !== 'vincular-google' && mostrar && cargados
  const presentado = useRef<string | null>(null)
  useEffect(() => {
    if (!visible || !primera || presentado.current === primera.version) return
    presentado.current = primera.version
    Alert.alert(primera.titulo, `dnmusic ${primera.version}\n\n${primera.cambios.slice(0, 3).join('\n\n')}`, [
      { text: 'Seguir escuchando', style: 'cancel', isPreferred: true, onPress: marcarNovedadesVistas },
      { text: 'Ver todos los cambios', onPress: () => { marcarNovedadesVistas(); router.push('/ajustes/novedades') } },
    ], { userInterfaceStyle: 'dark' })
  }, [visible, primera, router])
  return null
}
