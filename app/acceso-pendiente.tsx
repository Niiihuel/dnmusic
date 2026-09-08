import { useRef, useState } from 'react'
import { Text, View } from 'react-native'
import { endSession, refrescarAcceso, useAccessError, useAccessStatus, useAuthUser } from '../src/state/session'
import { PantallaAcceso } from '../src/ui/Acceso'
import { AccionSocial } from '../src/ui/Social'
import { FormError } from '../src/ui/Button'

export default function AccesoPendiente() {
  const acceso = useAccessStatus()
  const cuenta = useAuthUser()
  const errorAcceso = useAccessError()
  const operando = useRef(false)
  const [busy, setBusy] = useState<'recheck' | 'logout' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const rechazado = acceso?.status === 'rejected'
  const aprobado = acceso?.status === 'approved'

  async function ejecutar(accion: 'recheck' | 'logout') {
    if (operando.current) return
    operando.current = true
    setBusy(accion)
    setError(null)
    try {
      if (accion === 'logout') await endSession()
      else await refrescarAcceso()
    } catch {
      setError(accion === 'logout' ? 'No se pudo cerrar la sesión. Intentá de nuevo.' : 'No se pudo consultar tu acceso. Intentá de nuevo.')
    } finally {
      operando.current = false
      setBusy(null)
    }
  }

  return <PantallaAcceso
    titulo={rechazado ? 'Acceso no aprobado' : aprobado ? 'Acceso aprobado' : acceso ? 'Solicitud pendiente' : 'Verificar acceso'}
    detalle={rechazado ? '@nihuel no aprobó tu solicitud. Podés consultar de nuevo si cambia la decisión.' : aprobado ? 'Tu cuenta ya tiene acceso. Estamos preparando tu entrada.' : acceso ? 'Tu solicitud está esperando la aprobación de @nihuel. Podés volver a consultar su estado cuando quieras.' : 'Necesitamos confirmar el permiso de tu cuenta para entrar.'}>
    {cuenta?.email ? <Text className="text-muted-foreground text-[13px]">{cuenta.email}</Text> : null}
    <FormError message={error ?? errorAcceso} />
    <View className="gap-3">
      <AccionSocial label="Volver a consultar" busy={busy === 'recheck'} disabled={busy !== null} onPress={() => ejecutar('recheck')} expandida compacta />
      <AccionSocial label="Cerrar sesión" secundaria busy={busy === 'logout'} disabled={busy !== null} onPress={() => ejecutar('logout')} expandida compacta />
    </View>
  </PantallaAcceso>
}
