import { Redirect, useRouter } from 'expo-router'
import { Platform, Text, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthUser, useIsAccessAdmin } from '../../src/state/session'
import { volver } from '../../src/lib/volver'
import { BotonVolver } from '../../src/ui/BotonVolver'
import { ListaSolicitudes } from '../../src/ui/SolicitudesAcceso'

const ESCRITORIO_PX = 780

export default function Accesos() {
  const router = useRouter()
  const esAdmin = useIsAccessAdmin()
  const cuenta = useAuthUser()
  const escritorio = useWindowDimensions().width >= ESCRITORIO_PX

  /* En escritorio forma parte de la navegación lateral de Configuración. */
  if (Platform.OS !== 'ios' && escritorio) return <Redirect href="/ajustes?seccion=accesos" />

  return (
    <SafeAreaView className="min-h-0 flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-row items-center gap-2 px-3 py-1">
        <BotonVolver label="Volver a Ajustes" onPress={() => volver(router, '/ajustes')} />
        <Text
          accessibilityRole="header"
          className="min-w-0 flex-1 text-foreground text-body font-semibold"
        >
          Solicitudes de acceso
        </Text>
      </View>
      {esAdmin && cuenta ? (
        <ListaSolicitudes key={cuenta.id} administradorId={cuenta.id} />
      ) : (
        <Text accessibilityRole="alert" className="p-6 text-muted-foreground text-subheadline">
          Esta sección está disponible solo para el administrador.
        </Text>
      )}
    </SafeAreaView>
  )
}
