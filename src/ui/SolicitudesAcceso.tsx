import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Image, Text, View } from 'react-native'
import {
  deleteAccessAccount,
  decideAccess,
  listAccessRequests,
  type AccessRequest,
} from '../services/acceso'
import { usePiso } from '../state/shell'
import { AccionSocial } from './Social'
import { FormError } from './Button'
import { Menu } from './Menu'
import { ICON_COLOR } from './icons'
import { Avatar } from './Avatar'
import { Confirmar } from './Confirmar'
import { ScrollArea } from './ScrollArea'

const ESTADOS = {
  pending: 'Pendientes',
  approved: 'Aprobadas',
  rejected: 'Rechazadas',
} as const

function nombreCuenta(cuenta: AccessRequest) {
  return cuenta.display_name || cuenta.username || cuenta.email || 'Cuenta de Google'
}

function detalleCuenta(cuenta: AccessRequest) {
  if (cuenta.username && cuenta.email) return `@${cuenta.username} · ${cuenta.email}`
  if (cuenta.username) return `@${cuenta.username}`
  return cuenta.email || 'Cuenta vinculada con Google'
}

function AvatarCuenta({ cuenta }: { cuenta: AccessRequest }) {
  const [fallo, setFallo] = useState(false)
  const nombre = nombreCuenta(cuenta)
  if (!cuenta.avatar_url || fallo) return <Avatar name={nombre} size={40} />
  return (
    <Image
      source={{ uri: cuenta.avatar_url }}
      onError={() => setFallo(true)}
      accessibilityLabel={`Foto de ${nombre}`}
      className="h-10 w-10 rounded-full bg-muted"
    />
  )
}

export function ListaSolicitudes({
  administradorId,
  integrada = false,
}: {
  administradorId: string
  /** Dentro del panel de Configuración, el desplazamiento ya lo pone el padre. */
  integrada?: boolean
}) {
  const piso = usePiso(24)
  const [solicitudes, setSolicitudes] = useState<AccessRequest[] | null>(null)
  const [busy, setBusy] = useState<string | null>('lectura')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [porEliminar, setPorEliminar] = useState<AccessRequest | null>(null)
  const operando = useRef(false)
  const vivo = useRef(false)
  const version = useRef(0)

  const leer = useCallback(() => {
    if (!vivo.current || operando.current) return
    operando.current = true
    const lectura = ++version.current
    return listAccessRequests()
      .then((lista) => {
        if (vivo.current && lectura === version.current) setSolicitudes(lista)
      })
      .catch(() => {
        if (vivo.current && lectura === version.current) {
          setError('No se pudieron cargar las cuentas. Intentá de nuevo.')
        }
      })
      .finally(() => {
        if (vivo.current && lectura === version.current) {
          operando.current = false
          setBusy(null)
        }
      })
  }, [])

  useEffect(() => {
    vivo.current = true
    void leer()
    return () => {
      vivo.current = false
      operando.current = false
    }
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
        setSolicitudes((lista) =>
          lista?.map((s) =>
            s.user_id === resultado.user_id ? { ...s, ...resultado } : s,
          ) ?? null,
        )
        setAviso(aprobar ? 'Acceso aprobado.' : 'Acceso rechazado.')
      }
    } catch {
      if (vivo.current && decision === version.current) {
        setError('No se pudo confirmar la decisión. Actualizá la lista antes de volver a intentar.')
      }
    } finally {
      if (vivo.current && decision === version.current) {
        operando.current = false
        setBusy(null)
      }
    }
  }

  async function eliminar(cuenta: AccessRequest) {
    setPorEliminar(null)
    if (!vivo.current || operando.current || cuenta.user_id === administradorId) return
    operando.current = true
    const operacion = ++version.current
    setBusy(cuenta.user_id)
    setError(null)
    setAviso(null)
    try {
      await deleteAccessAccount(cuenta.user_id)
      if (vivo.current && operacion === version.current) {
        setSolicitudes((lista) => lista?.filter((s) => s.user_id !== cuenta.user_id) ?? null)
        setAviso(`${nombreCuenta(cuenta)} ya no tiene una cuenta en DMusic.`)
      }
    } catch {
      if (vivo.current && operacion === version.current) {
        setError('No se pudo eliminar la cuenta. Actualizá la lista y volvé a intentar.')
      }
    } finally {
      if (vivo.current && operacion === version.current) {
        operando.current = false
        setBusy(null)
      }
    }
  }

  const cuerpo = (
    <View className="w-full gap-5">
      <View className="flex-row flex-wrap items-center justify-between gap-3">
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-foreground text-[15px] font-semibold">Cuentas de DMusic</Text>
          <Text className="text-muted-foreground text-[12px]">
            Las cuentas nuevas necesitan tu aprobación antes de entrar.
          </Text>
        </View>
        <AccionSocial
          label={error && solicitudes === null ? 'Reintentar' : 'Actualizar'}
          secundaria
          busy={busy === 'lectura'}
          disabled={busy !== null}
          onPress={cargar}
        />
      </View>

      <FormError message={error} />
      {aviso ? (
        <Text accessibilityLiveRegion="polite" className="text-muted-foreground text-[12px]">
          {aviso}
        </Text>
      ) : null}
      {solicitudes === null && busy === 'lectura' ? (
        <View accessibilityRole="progressbar" accessibilityLabel="Cargando cuentas" className="items-center py-10">
          <ActivityIndicator color={ICON_COLOR.muted} />
        </View>
      ) : null}
      {solicitudes?.length === 0 ? (
        <Text className="text-muted-foreground py-8 text-center text-[13px]">
          No hay cuentas para revisar.
        </Text>
      ) : null}

      {(['pending', 'approved', 'rejected'] as const).map((estado) => {
        const filas = solicitudes?.filter((s) => s.status === estado) ?? []
        if (!filas.length) return null
        return (
          <View key={estado} className="gap-1.5">
            <Text
              accessibilityRole="header"
              className="px-3 text-muted-foreground text-[11px] font-semibold uppercase tracking-[1.1px]"
            >
              {ESTADOS[estado]} · {filas.length}
            </Text>
            <View className="overflow-hidden rounded-[16px] bg-card">
              {filas.map((cuenta, i) => {
                const esOwner = cuenta.user_id === administradorId
                const etiqueta = cuenta.email || cuenta.username || cuenta.display_name || 'esta cuenta'
                return (
                  <View key={cuenta.user_id} className="flex-row items-center gap-3 pl-3">
                    <AvatarCuenta cuenta={cuenta} />
                    <View
                      className={`min-h-[64px] min-w-0 flex-1 flex-row items-center gap-3 py-2.5 pr-2 ${
                        i === filas.length - 1 ? '' : 'border-b border-muted'
                      }`}
                    >
                      <View className="min-w-0 flex-1 gap-0.5">
                        <Text className="text-foreground text-[14px] font-semibold" numberOfLines={1}>
                          {nombreCuenta(cuenta)}
                        </Text>
                        <Text className="text-muted-foreground text-[12px]" numberOfLines={1}>
                          {detalleCuenta(cuenta)}
                        </Text>
                        <Text className="text-muted-foreground/70 text-[11px]" numberOfLines={1}>
                          Solicitud del {new Date(cuenta.requested_at).toLocaleDateString('es')}
                        </Text>
                      </View>
                      {busy === cuenta.user_id ? (
                        <ActivityIndicator accessibilityLabel="Guardando cambios" color={ICON_COLOR.muted} />
                      ) : esOwner ? (
                        <Text className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground text-[11px]">
                          Administrador
                        </Text>
                      ) : (
                        <Menu
                          label={`Decidir acceso de ${etiqueta}`}
                          items={[
                            ...(estado !== 'approved'
                              ? [{
                                  label: 'Aprobar acceso',
                                  sfSymbol: 'checkmark' as const,
                                  disabled: busy !== null,
                                  onPress: () => void decidir(cuenta, true),
                                }]
                              : []),
                            ...(estado !== 'rejected'
                              ? [{
                                  label: 'Rechazar acceso',
                                  sfSymbol: 'xmark' as const,
                                  disabled: busy !== null,
                                  onPress: () => void decidir(cuenta, false),
                                }]
                              : []),
                            {
                              label: 'Eliminar cuenta',
                              sfSymbol: 'trash' as const,
                              destructive: true,
                              separadorAntes: true,
                              disabled: busy !== null,
                              onPress: () => setPorEliminar(cuenta),
                            },
                          ]}
                        />
                      )}
                    </View>
                  </View>
                )
              })}
            </View>
          </View>
        )
      })}

      <Confirmar
        visible={porEliminar !== null}
        titulo="¿Eliminar esta cuenta?"
        mensaje={
          porEliminar
            ? `${nombreCuenta(porEliminar)} perderá el acceso y sus datos asociados. Esta acción no se puede deshacer.`
            : ''
        }
        rotulo="Eliminar cuenta"
        onCancelar={() => setPorEliminar(null)}
        onConfirmar={() => {
          if (porEliminar) void eliminar(porEliminar)
        }}
      />
    </View>
  )

  if (integrada) return cuerpo
  return (
    <ScrollArea
      contentContainerStyle={{
        padding: 16,
        paddingBottom: piso,
        alignItems: 'center',
      }}
    >
      <View className="w-full" style={{ maxWidth: 720 }}>
        {cuerpo}
      </View>
    </ScrollArea>
  )
}
