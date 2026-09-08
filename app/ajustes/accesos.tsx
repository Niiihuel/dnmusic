import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { listAccessRequests, decideAccess, type AccessRequest } from '../../src/services/acceso'
import { useAuthUser, useIsAccessAdmin } from '../../src/state/session'
import { usePiso } from '../../src/state/shell'
import { volver } from '../../src/lib/volver'
import { BotonVolver } from '../../src/ui/BotonVolver'
import { ScrollArea } from '../../src/ui/ScrollArea'
import { AccionSocial } from '../../src/ui/Social'
import { FormError } from '../../src/ui/Button'
import { Menu } from '../../src/ui/Menu'
import { ICON_COLOR } from '../../src/ui/icons'

export default function Accesos() {
  const router = useRouter()
  const esAdmin = useIsAccessAdmin()
  const cuenta = useAuthUser()
  return <SafeAreaView className="min-h-0 flex-1 bg-background" edges={['top', 'bottom']}>
    <View className="flex-row items-center gap-2 px-3 py-1">
      <BotonVolver label="Volver a Ajustes" onPress={() => volver(router, '/ajustes')} />
      <Text accessibilityRole="header" className="min-w-0 flex-1 text-foreground text-[17px] font-semibold">Solicitudes de acceso</Text>
    </View>
    {esAdmin && cuenta ? <ListaSolicitudes key={cuenta.id} administradorId={cuenta.id} /> :
      <Text accessibilityRole="alert" className="p-6 text-muted-foreground text-[15px]">Esta sección está disponible solo para el administrador.</Text>}
  </SafeAreaView>
}

const ESTADOS = { pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado' } as const

/** Se desmonta al perder el permiso o cambiar de cuenta: no retiene datos administrativos. */
function ListaSolicitudes({ administradorId }: { administradorId: string }) {
  const piso = usePiso(24)
  const [solicitudes, setSolicitudes] = useState<AccessRequest[] | null>(null)
  const [busy, setBusy] = useState<string | null>('lectura')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const operando = useRef(false)
  const vivo = useRef(false)
  const version = useRef(0)

  const leer = useCallback(() => {
    if (!vivo.current || operando.current) return
    operando.current = true
    const lectura = ++version.current
    return listAccessRequests().then(lista => {
      if (vivo.current && lectura === version.current) setSolicitudes(lista)
    }).catch(() => {
      if (vivo.current && lectura === version.current) setError('No se pudieron cargar las solicitudes. Intentá de nuevo.')
    }).finally(() => {
      if (vivo.current && lectura === version.current) {
        operando.current = false
        setBusy(null)
      }
    })
  }, [])

  useEffect(() => {
    vivo.current = true
    void leer()
    return () => { vivo.current = false; operando.current = false }
  }, [leer])

  function cargar() {
    if (!vivo.current || operando.current) return
    setBusy('lectura')
    setError(null)
    setAviso(null)
    return leer()
  }

  async function decidir(cuenta: AccessRequest, aprobar: boolean) {
    if (!vivo.current || operando.current || cuenta.user_id === administradorId) return
    operando.current = true
    const decision = ++version.current
    setBusy(cuenta.user_id)
    setError(null)
    setAviso(null)
    try {
      const resultado = await decideAccess(cuenta.user_id, aprobar)
      if (vivo.current && decision === version.current) {
        setSolicitudes(lista => lista?.map(s => s.user_id === resultado.user_id ? { ...s, ...resultado } : s) ?? null)
        setAviso(aprobar ? 'Acceso aprobado.' : 'Acceso rechazado.')
      }
    } catch {
      if (vivo.current && decision === version.current) setError('No se pudo confirmar la decisión. Actualizá la lista antes de volver a intentar.')
    } finally {
      if (vivo.current && decision === version.current) { operando.current = false; setBusy(null) }
    }
  }

  return <ScrollArea contentContainerStyle={{ padding: 24, paddingBottom: piso, alignItems: 'center' }}>
    <View className="w-full gap-5" style={{ maxWidth: 720 }}>
      <View className="flex-row flex-wrap items-center justify-between gap-3">
        <Text className="text-muted-foreground text-[15px]">Las cuentas nuevas necesitan tu aprobación para entrar.</Text>
        <AccionSocial label={error && solicitudes === null ? 'Reintentar lectura' : 'Actualizar'} secundaria
          busy={busy === 'lectura'} disabled={busy !== null} onPress={cargar} />
      </View>
      <FormError message={error} />
      {aviso ? <Text accessibilityLiveRegion="polite" className="text-muted-foreground text-[13px]">{aviso}</Text> : null}
      {solicitudes?.length === 0 ? <Text className="text-muted-foreground text-[15px]">No hay solicitudes de acceso.</Text> : null}
      {(['pending', 'approved', 'rejected'] as const).map(estado => {
        const filas = solicitudes?.filter(s => s.status === estado) ?? []
        return filas.length ? <View key={estado} className="gap-2">
          <Text accessibilityRole="header" className="text-foreground text-[15px] font-semibold">{ESTADOS[estado]} · {filas.length}</Text>
          {filas.map(cuenta => <View key={cuenta.user_id} className="flex-row flex-wrap items-center gap-3 py-3">
            <View className="min-w-0 flex-1 gap-1" style={{ minWidth: 160 }}>
              <Text className="text-foreground text-[15px] font-medium">{cuenta.display_name || cuenta.username || cuenta.email || 'Cuenta de Google'}</Text>
              {cuenta.email ? <Text className="text-muted-foreground text-[13px]">{cuenta.email}</Text> : null}
              {cuenta.username ? <Text className="text-muted-foreground text-[13px]">@{cuenta.username}</Text> : null}
              <Text className="text-muted-foreground text-[13px]">Solicitud del {new Date(cuenta.requested_at).toLocaleDateString('es')}</Text>
            </View>
            {busy === cuenta.user_id ? <ActivityIndicator accessibilityLabel="Guardando decisión" color={ICON_COLOR.muted} /> : null}
            {cuenta.user_id !== administradorId ? <Menu label={`Decidir acceso de ${cuenta.email || cuenta.username || cuenta.display_name || 'esta cuenta'}`} items={[
              ...(estado !== 'approved' ? [{ label: 'Aprobar acceso', sfSymbol: 'checkmark' as const, disabled: busy !== null, onPress: () => void decidir(cuenta, true) }] : []),
              ...(estado !== 'rejected' ? [{ label: 'Rechazar acceso', sfSymbol: 'xmark' as const, destructive: true, disabled: busy !== null, onPress: () => void decidir(cuenta, false) }] : []),
            ]} /> : <Text className="text-muted-foreground text-[13px]">Administrador</Text>}
          </View>)}
        </View> : null
      })}
    </View>
  </ScrollArea>
}
