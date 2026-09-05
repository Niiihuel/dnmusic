import { useCallback, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { listCollaborators, type Colaborador } from '../services/playlists'
import { Avatar } from './Avatar'
import { ICON_COLOR, IconUsers } from './icons'

/** Se relee al volver de administrar personas, también en la pantalla de PC. */
export function ColaboradoresDeLista({
  playlistId,
  total,
  onPress,
}: {
  playlistId: string
  total: number
  onPress: () => void
}) {
  const [cargado, setCargado] = useState<{
    id: string
    total: number
    gente: Colaborador[]
  } | null>(null)
  useFocusEffect(
    useCallback(() => {
      let vivo = true
      listCollaborators(playlistId)
        .then((gente) => {
          if (vivo) setCargado({ id: playlistId, total, gente })
        })
        .catch(() => {
          if (vivo) setCargado(null)
        })
      return () => {
        vivo = false
      }
    }, [playlistId, total]),
  )
  const gente = cargado?.id === playlistId && cargado.total === total ? cargado.gente : []
  const cantidad = gente.length || total
  const visibles = gente.slice(0, 3)

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Ver colaboradores de la lista, ${cantidad} ${cantidad === 1 ? 'persona' : 'personas'}`}
      className="min-h-11 flex-row items-center gap-2 rounded-full px-2 active:bg-muted"
    >
      <View className="flex-row items-center">
        {visibles.length ? (
          visibles.map((persona, i) => (
            <View
              key={`${persona.id}:${persona.avatarPath}`}
              style={{
                marginLeft: i ? -9 : 0,
                borderWidth: 2,
                borderColor: '#181818',
                borderRadius: 99,
              }}
            >
              <Avatar
                name={persona.displayName || persona.username}
                path={persona.avatarPath}
                size={28}
              />
            </View>
          ))
        ) : (
          <IconUsers size={20} color={ICON_COLOR.muted} />
        )}
      </View>
      <Text className="text-muted-foreground text-[12px] font-semibold">
        {cantidad > 3 ? `+${cantidad - 3}` : cantidad === 1 ? 'Invitar' : cantidad}
      </Text>
    </Pressable>
  )
}
