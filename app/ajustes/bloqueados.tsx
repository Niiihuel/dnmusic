import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Panel } from '../../src/ui/Panel'
import { Avatar } from '../../src/ui/Avatar'
import { Vacio } from '../../src/ui/Vacio'
import { ICON_COLOR, IconBack, IconBan } from '../../src/ui/icons'
import {
  contactLabel,
  contactTitle,
  listBlockedUsers,
  unblockUser,
  type Contact,
} from '../../src/services/contacts'
import { refreshConversations } from '../../src/state/session'
import { avisar } from '../../src/state/aviso'
import { mensajeError } from '../../src/lib/mensajeError'
import { usePiso } from '../../src/state/shell'
import { volver } from '../../src/lib/volver'

/** Debajo de esto la app es pestañas y el contenido va de borde a borde. */
const SHELL_PX = 780
/** Tope del contenido en escritorio, como en el resto de las pantallas. */
const CAP = 672

/**
 * Las cuentas que bloqueaste.
 *
 * Es la única puerta de salida del bloqueo: bloquear se hace desde el perfil
 * de la persona, pero esa pantalla deja de ser alcanzable justamente por estar
 * bloqueada — desde la búsqueda ya no aparece—. Así que deshacerlo vive acá,
 * donde uno viene a revisar sus decisiones.
 *
 * Desbloquear es un toque, sin sostener: no borra nada ni te expone solo —la
 * conversación vuelve como estaba y escribirte sigue pidiendo lo de siempre—.
 */
export default function Bloqueados() {
  const router = useRouter()
  const suelto = useWindowDimensions().width < SHELL_PX
  const piso = usePiso(24)

  /* undefined = cargando; la lista vacía es un estado distinto y se dice. */
  const [bloqueados, setBloqueados] = useState<Contact[] | undefined>(undefined)
  const [ocupado, setOcupado] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    listBlockedUsers()
      .then((lista) => vivo && setBloqueados(lista))
      .catch((e) => {
        if (!vivo) return
        setBloqueados([])
        avisar(mensajeError(e), true)
      })
    return () => {
      vivo = false
    }
  }, [])

  async function desbloquear(cuenta: Contact) {
    setOcupado(cuenta.id)
    try {
      await unblockUser(cuenta.id)
      setBloqueados((lista) => lista?.filter((c) => c.id !== cuenta.id))
      /* La conversación que el bloqueo escondía vuelve a la bandeja. */
      await refreshConversations().catch(() => {})
      avisar(`Desbloqueaste a @${cuenta.username}`)
    } catch (e) {
      avisar(mensajeError(e), true)
    } finally {
      setOcupado(null)
    }
  }

  return (
    <SafeAreaView
      className="flex-1 bg-background"
      edges={suelto ? ['top'] : ['top', 'bottom']}
    >
      <View className={`min-h-0 flex-1 ${suelto ? '' : 'gap-2 p-2'}`}>
        <View className="flex-row items-center gap-3 px-3 py-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver"
            onPress={() => volver(router, '/ajustes')}
            className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
          >
            <IconBack size={19} color={ICON_COLOR.foreground} />
          </Pressable>
          <Text className="text-foreground text-[15px] font-semibold">Bloqueados</Text>
        </View>

        <Panel className="flex-1">
          <ScrollView
            contentContainerClassName={`items-center ${suelto ? 'px-3 pt-3' : 'p-5'}`}
            contentContainerStyle={{ paddingBottom: piso }}
          >
            <View className="w-full" style={{ maxWidth: suelto ? undefined : CAP }}>
              {bloqueados === undefined ? (
                <View className="py-16">
                  <ActivityIndicator color="#FFFFFF" />
                </View>
              ) : bloqueados.length === 0 ? (
                <Vacio
                  icono={<IconBan size={22} color={ICON_COLOR.muted} />}
                  titulo="No bloqueaste a nadie"
                  detalle="Las cuentas que bloquees desde su perfil van a aparecer acá."
                />
              ) : (
                <View className="overflow-hidden rounded-2xl bg-card">
                  {bloqueados.map((cuenta, i) => (
                    <View key={cuenta.id} className="flex-row items-center gap-3 px-4">
                      <Avatar name={contactLabel(cuenta)} path={cuenta.avatarPath} size={40} />
                      <View
                        className={`min-w-0 flex-1 flex-row items-center gap-3 py-3.5 ${
                          i === bloqueados.length - 1 ? '' : 'border-b border-muted'
                        }`}
                      >
                        <View className="min-w-0 flex-1 gap-0.5">
                          <Text
                            className="text-foreground text-[15px] font-semibold"
                            numberOfLines={1}
                          >
                            {contactTitle(cuenta)}
                          </Text>
                          {cuenta.displayName?.trim() ? (
                            <Text className="text-muted-foreground text-[11px]" numberOfLines={1}>
                              @{cuenta.username}
                            </Text>
                          ) : null}
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Desbloquear a @${cuenta.username}`}
                          disabled={ocupado === cuenta.id}
                          onPress={() => void desbloquear(cuenta)}
                          className="rounded-full bg-muted px-4 py-2 active:opacity-70"
                        >
                          {ocupado === cuenta.id ? (
                            <ActivityIndicator size="small" color={ICON_COLOR.muted} />
                          ) : (
                            <Text className="text-foreground text-xs font-semibold">
                              Desbloquear
                            </Text>
                          )}
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>
        </Panel>
      </View>
    </SafeAreaView>
  )
}
