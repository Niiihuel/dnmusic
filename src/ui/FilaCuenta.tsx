import type { FilaCuentaProps } from './FilaCuenta.types'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { contactLabel, contactTitle } from '../services/contacts'
import { TECLADO_FISICO } from '../lib/teclado'
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
  density = 'regular',
  onAbrir,
  onVerPerfil,
  rotuloAbrir = 'Elegir',
  onSolicitar,
  onAceptar,
}: FilaCuentaProps) {
  const compacto = density === 'compact' && TECLADO_FISICO
  const accion = compacto ? 32 : 44
  const nombre = contactLabel(cuenta)
  const subtitulo = cuenta.pairId
    ? 'Abrir conversación'
    : cuenta.solicitud === 'enviada'
      ? 'Solicitud enviada'
      : cuenta.solicitud === 'recibida'
        ? 'Quiere ser tu contacto'
        : 'Todavía no son contactos'

  return (
    <View className="flex-row items-center gap-2 rounded-lg px-2 py-2 hover:bg-white/5">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={onVerPerfil ? `Ver perfil de ${nombre}` : `Abrir a ${nombre}`}
        onPress={onVerPerfil ?? onAbrir}
        style={onVerPerfil ? { minHeight: 44 } : undefined}
        className="min-w-0 flex-1 flex-row items-center gap-2 rounded-md active:opacity-70"
      >
        <Avatar name={nombre} path={cuenta.avatarPath} size={compacto ? 36 : 44} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-foreground font-semibold" style={{ fontSize: compacto ? 13 : 14 }} numberOfLines={1}>
            {contactTitle(cuenta)}
          </Text>
          <Text className="text-muted-foreground text-caption1" numberOfLines={1}>
            {cuenta.displayName?.trim() ? `@${cuenta.username} · ` : ''}
            {subtitulo}
          </Text>
        </View>
      </Pressable>

      {busy ? (
        <View style={{ width: accion, height: accion, flexShrink: 0 }} className="items-center justify-center">
          <ActivityIndicator color={ICON_COLOR.muted} />
        </View>
      ) : cuenta.solicitud === 'recibida' && onAceptar ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Aceptar la solicitud de ${nombre}`}
          onPress={onAceptar}
          style={{ width: accion, height: accion, flexShrink: 0 }} className="items-center justify-center rounded-full bg-primary active:opacity-80"
        >
          <IconCheck size={15} color={ICON_COLOR.onPrimary} />
        </Pressable>
      ) : !cuenta.pairId && cuenta.solicitud === null && onSolicitar ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Enviarle una solicitud a ${nombre}`}
          onPress={onSolicitar}
          style={{ width: accion, height: accion, flexShrink: 0 }} className="items-center justify-center rounded-full bg-muted active:opacity-80"
        >
          <IconPlus size={16} color={ICON_COLOR.foreground} />
        </Pressable>
      ) : onVerPerfil ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${rotuloAbrir} a ${nombre}`}
          onPress={onAbrir}
          style={{ minHeight: 44, minWidth: 44, flexShrink: 0 }}
          className="items-center justify-center rounded-xl bg-muted px-3 active:opacity-80"
        >
          <Text className="text-foreground text-subheadline font-medium">{rotuloAbrir}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}
