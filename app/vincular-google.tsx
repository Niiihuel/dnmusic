import { useEffect } from 'react'
import { ScrollView, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useUser } from '../src/state/session'
import { volver } from '../src/lib/volver'
import { cancelarGoogle } from '../src/services/auth'
import { Hoja, usePisoHoja } from '../src/ui/Hoja'
import { CabeceraSocial } from '../src/ui/Social'
import { NotaAcceso } from '../src/ui/CabeceraAcceso'
import { ConectarGoogle } from '../src/ui/ConectarGoogle'
import { GhostButton } from '../src/ui/Button'

export default function VincularGoogle() {
  const user = useUser(), router = useRouter(), piso = usePisoHoja(24)
  useEffect(() => () => { void cancelarGoogle().catch(() => {}) }, [])
  const cerrar = () => { void cancelarGoogle().catch(() => {}).finally(() => volver(router, '/')) }
  return <Hoja medida="contenido" titulo="Conectá tu cuenta con Google" onCerrar={cerrar}>
    <CabeceraSocial titulo="Conectá tu cuenta con Google" onCerrar={cerrar} />
    <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: piso, gap: 24 }}>
      <NotaAcceso>Ahora entrás a DMusic con Google. Conectalo a esta cuenta para conservar tu perfil, tus listas y tus contactos al volver a iniciar sesión.</NotaAcceso>
      {user ? <ConectarGoogle key={user.id} user={user} onConectado={() => volver(router, '/')} /> : null}
      <View><GhostButton label="Más tarde" onPress={cerrar} /></View>
    </ScrollView>
  </Hoja>
}
