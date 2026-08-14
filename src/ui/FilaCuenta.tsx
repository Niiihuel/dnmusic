import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { contactLabel, contactTitle, type ContactResult } from '../services/contacts'
import { Avatar } from './Avatar'
import { ICON_COLOR, IconCheck, IconPlus } from './icons'

/**
 * Una cuenta en los resultados de búsqueda del chat, con su acción a la vista.
 *
 * Es la misma fila que una conversación de la bandeja —avatar de 44, título en
 * negrita, subtítulo apagado— porque es la misma idea: una persona con la que
 * hablar. Lo que cambia es la cola de la fila, que dice **en qué están**:
 *
 * - Con conversación, nada: tocar la fila la abre, como en la bandeja.
 * - Sin nada entre los dos, el «+» manda la solicitud ahí mismo — antes había
 *   que pasar por la pantalla de redactar solo para eso.
 * - Con una solicitud recibida, el tilde la acepta: los mismos redondeles que
 *   la sección «Solicitudes» de la bandeja, para que el gesto sea uno solo.
 * - Con una enviada no hay botón: reenviarla no haría nada, y el subtítulo ya
 *   dice que está en camino.
 *
 * La fila es un View con Pressables adentro y no un Pressable que envuelve
 * todo: en web un botón dentro de otro botón no es HTML válido y los toques se
 * pierden — el mismo motivo documentado en `SearchDropdown`.
 */
export function FilaCuenta({
  cuenta,
  busy = false,
  onAbrir,
  onSolicitar,
  onAceptar,
}: {
  cuenta: ContactResult
  /** La solicitud de esta cuenta está saliendo: el redondel muestra la espera. */
  busy?: boolean
  /** Tocar la fila: abrir la conversación, o el flujo de redactar si no hay. */
  onAbrir: () => void
  /** Sin estos dos, la fila no dibuja botones: es una fila de **elegir** — la
   *  usa así el redactar, donde la acción es el botón grande de abajo. */
  onSolicitar?: () => void
  onAceptar?: () => void
}) {
  const nombre = contactLabel(cuenta)
  const subtitulo = cuenta.pairId
    ? 'Abrir conversación'
    : cuenta.solicitud === 'enviada'
      ? 'Solicitud enviada'
      : cuenta.solicitud === 'recibida'
        ? 'Quiere ser tu contacto'
        : 'Todavía no son contactos'

  return (
    <View className="flex-row items-center gap-3 rounded-lg p-2.5">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Abrir a ${nombre}`}
        onPress={onAbrir}
        className="min-w-0 flex-1 flex-row items-center gap-3 active:opacity-70"
      >
        <Avatar name={nombre} path={cuenta.avatarPath} size={44} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-foreground text-[14px] font-semibold" numberOfLines={1}>
            {contactTitle(cuenta)}
          </Text>
          <Text className="text-muted-foreground text-xs" numberOfLines={1}>
            {cuenta.displayName?.trim() ? `@${cuenta.username} · ` : ''}
            {subtitulo}
          </Text>
        </View>
      </Pressable>

      {busy ? (
        <View className="h-9 w-9 items-center justify-center">
          <ActivityIndicator color={ICON_COLOR.muted} />
        </View>
      ) : cuenta.solicitud === 'recibida' && onAceptar ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Aceptar la solicitud de ${nombre}`}
          onPress={onAceptar}
          className="h-9 w-9 items-center justify-center rounded-full bg-primary active:opacity-80"
        >
          <IconCheck size={15} color={ICON_COLOR.onPrimary} />
        </Pressable>
      ) : !cuenta.pairId && cuenta.solicitud === null && onSolicitar ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Enviarle una solicitud a ${nombre}`}
          onPress={onSolicitar}
          className="h-9 w-9 items-center justify-center rounded-full bg-muted active:opacity-80"
        >
          <IconPlus size={16} color={ICON_COLOR.foreground} />
        </Pressable>
      ) : null}
    </View>
  )
}
