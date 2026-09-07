import { useRef, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { pickImage } from '../../src/lib/pickImage'
import { mensajeError } from '../../src/lib/mensajeError'
import { type Profile } from '../../src/services/profile'
import { uploadIlustracionConProgreso } from '../../src/services/showcases'
import { PREFIJO_PROPIA } from '../../src/services/decoraciones'
import { useMyProfile, useUser } from '../../src/state/session'
import { BotonHoja, EncabezadoHoja } from '../../src/ui/EncabezadoHoja'
import { Hoja, useHojaModal, usePisoHoja } from '../../src/ui/Hoja'
import { EstudioPerfil, estiloDelPerfil, TIPOS_ESTILO, type EstiloPerfil } from '../../src/ui/EstudioPerfil'
import { BarraDeProgreso } from '../../src/ui/Progreso'
import { useSalidaConCambios } from '../../src/ui/useSalidaConCambios'
import { actualizarPerfilEdicion, useIniciarPerfilEdicion, usePerfilEdicion } from '../../src/state/perfilEdicion'

export default function PersonalizarPerfil() {
  const perfil = useIniciarPerfilEdicion()
  const router = useRouter()
  return <Hoja anchoMaximo={1120} onCerrar={() => router.dismissTo('/profile/editar')}>{perfil ? <Probador key={perfil.userId} perfil={perfil} /> : <View className="flex-1 items-center justify-center"><ActivityIndicator color="#fff" /></View>}</Hoja>
}
function Probador({ perfil }: { perfil: Profile }) {
  const router = useRouter()
  const user = useUser()
  const original = useMyProfile()
  const modal = useHojaModal()
  const piso = usePisoHoja(14)
  const { tipo } = useLocalSearchParams<{ tipo?: string }>()
  const borrador = estiloDelPerfil(perfil)
  const setBorrador = (valor: EstiloPerfil | ((anterior: EstiloPerfil) => EstiloPerfil)) => actualizarPerfilEdicion(typeof valor === 'function' ? valor(borrador) : valor)
  const { ocupado: guardando } = usePerfilEdicion()
  const [error, setError] = useState<string | null>(null)
  const [progreso, setProgreso] = useState<number | null>(null)
  const mutex = useRef(false)
  const ocupado = guardando || progreso !== null
  const salida = useSalidaConCambios(false, ocupado)
  async function subir(clase: 'marco' | 'efecto') {
    if (!user || mutex.current || ocupado) return
    mutex.current = true
    try {
      const archivo = await pickImage({ cuadrada: false })
      if (!archivo) return
      setError(null); setProgreso(0)
      const ruta = await uploadIlustracionConProgreso(user.id, archivo.blob, archivo.fileName, archivo.mime, setProgreso)
      setBorrador(anterior => ({ ...anterior, [clase]: `${PREFIJO_PROPIA}${ruta}` }))
    } catch (e) { setError(mensajeError(e)) }
    finally { setProgreso(null); mutex.current = false }
  }
  return <View className="flex-1 bg-background">
    <EncabezadoHoja titulo="Personalizar perfil" velo={false}
      izquierda={<BotonHoja tipo="volver" label="Volver a editar perfil" disabled={ocupado} onPress={() => router.dismissTo('/profile/editar')} />} />
    <View style={{ flex: 1, minHeight: 0, paddingBottom: (modal ? 0 : piso) }}>
      <EstudioPerfil perfil={perfil} perfilOriginal={original ?? perfil} estilo={borrador} onCambiar={setBorrador}
        tipoInicial={tipo === 'paquete' ? 'paquete' : TIPOS_ESTILO.find(t => t === tipo) ?? 'marco'}
        onSubir={clase => void subir(clase)} subiendo={progreso !== null} ocupado={ocupado} />
    </View>
    {progreso !== null ? <View style={{ padding: 16 }}><BarraDeProgreso valor={progreso} rotulo="Subiendo tu decoración…" /></View> : null}
    {salida}
    {error ? <Text accessibilityRole="alert" className="text-destructive px-5 py-3">{error}</Text> : null}
  </View>
}
