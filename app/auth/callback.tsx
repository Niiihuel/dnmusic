import { useEffect, useState } from 'react'
import { ActivityIndicator, Text, View, Platform } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { completarGoogleCallback } from '../../src/services/auth'
import { PantallaAcceso } from '../../src/ui/Acceso'
import { AccionSocial } from '../../src/ui/Social'
import { ICON_COLOR } from '../../src/ui/icons'

export default function GoogleCallback() {
  const params = useLocalSearchParams()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach(v => query.append(key, v))
    else if (value !== undefined) query.append(key, value)
  }
  const [webURL] = useState(() => Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : undefined)
  const url = Platform.OS === 'web' ? webURL : `dnmusic://auth/callback?${query}`
  useEffect(() => {
    let vigente = true
    void completarGoogleCallback(url).then(user => {
      if (vigente) router.replace(user ? '/' : '/sign-in')
    }).catch(() => { if (vigente) setError('No se pudo completar el acceso. Volvé a iniciar con Google.') })
    return () => { vigente = false }
  }, [router, url])
  return <PantallaAcceso titulo="Continuar con Google" detalle={error ?? 'Estamos completando tu acceso.'}>
    <View accessibilityLiveRegion="polite" className="items-center gap-4">
      {error ? <AccionSocial label="Volver al acceso" onPress={() => router.replace('/sign-in')} /> : <>
        <ActivityIndicator color={ICON_COLOR.foreground} accessibilityLabel="Completando acceso" />
        <Text className="text-muted-foreground text-[15px]">Un momento…</Text>
      </>}
    </View>
  </PantallaAcceso>
}
