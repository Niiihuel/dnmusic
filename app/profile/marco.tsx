import { ActivityIndicator, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { type Profile } from '../../src/services/profile'
import { useMyProfile } from '../../src/state/session'
import { BotonHoja, EncabezadoHoja } from '../../src/ui/EncabezadoHoja'
import { Hoja, useHojaModal, usePisoHoja } from '../../src/ui/Hoja'
import { EstudioPerfil, estiloDelPerfil, TIPOS_ESTILO, type EstiloPerfil } from '../../src/ui/EstudioPerfil'
import { useSalidaConCambios } from '../../src/ui/useSalidaConCambios'
import { actualizarPerfilEdicion, useIniciarPerfilEdicion, usePerfilEdicion } from '../../src/state/perfilEdicion'

export default function PersonalizarPerfil() {
  const perfil = useIniciarPerfilEdicion()
  const router = useRouter()
  return <Hoja anchoMaximo={1120} onCerrar={() => router.dismissTo('/profile/editar')}>{perfil ? <Probador key={perfil.userId} perfil={perfil} /> : <View className="flex-1 items-center justify-center"><ActivityIndicator color="#fff" /></View>}</Hoja>
}
function Probador({ perfil }: { perfil: Profile }) {
  const router = useRouter()
  const original = useMyProfile()
  const modal = useHojaModal()
  const piso = usePisoHoja(14)
  const { tipo } = useLocalSearchParams<{ tipo?: string }>()
  const borrador = estiloDelPerfil(perfil)
  const setBorrador = (valor: EstiloPerfil | ((anterior: EstiloPerfil) => EstiloPerfil)) => actualizarPerfilEdicion(typeof valor === 'function' ? valor(borrador) : valor)
  const { ocupado: guardando } = usePerfilEdicion()
  const ocupado = guardando
  const salida = useSalidaConCambios(false, ocupado)
  return <View style={{ flex: 1, minHeight: 0, backgroundColor: '#121212', overflow: 'hidden' }}>
    <EncabezadoHoja titulo="Personalizar perfil" velo={false}
      izquierda={<BotonHoja tipo="cerrar" label="Cerrar personalización del perfil" disabled={ocupado} onPress={() => router.dismissTo('/profile/editar')} />} />
    <View style={{ flex: 1, minHeight: 0, paddingBottom: (modal ? 0 : piso) }}>
      <EstudioPerfil perfil={perfil} perfilOriginal={original ?? perfil} estilo={borrador} onCambiar={setBorrador}
        tipoInicial={tipo === 'paquete' ? 'paquete' : TIPOS_ESTILO.find(t => t === tipo) ?? 'marco'}
        ocupado={ocupado} />
    </View>
    {salida}
  </View>
}
