import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthUser, useIsAccessAdmin } from '../../src/state/session'
import { usePiso } from '../../src/state/shell'
import { volver } from '../../src/lib/volver'
import { AdministrarActualizaciones } from '../../src/ui/AdministrarActualizaciones'
import { BotonVolver } from '../../src/ui/BotonVolver'
import { EncabezadoHoja } from '../../src/ui/EncabezadoHoja'
import { FilaDato, GrupoAjustes, ListaAjustes } from '../../src/ui/Ajustes'

/** Herramienta administrativa; no forma parte del actualizador personal. */
export default function CompatibilidadVersiones() {
  const router = useRouter()
  const admin = useIsAccessAdmin()
  const user = useAuthUser()
  const piso = usePiso(24)
  return <SafeAreaView className="flex-1 bg-background" edges={['top']}>
    <EncabezadoHoja titulo="Compatibilidad de versiones" izquierda={<BotonVolver label="Volver a Ajustes" onPress={() => volver(router, '/ajustes')} />} />
    <ListaAjustes piso={piso}>
      {admin && user ? <AdministrarActualizaciones key={user.id} /> : <GrupoAjustes pie="Esta herramienta está disponible sólo para administradores."><FilaDato rotulo="Acceso restringido" valor="" ultima /></GrupoAjustes>}
    </ListaAjustes>
  </SafeAreaView>
}
