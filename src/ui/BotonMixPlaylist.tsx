import { useEffect, useState } from 'react'
import { Text } from 'react-native'
import { getSelectedPlaylistMix, type PlaylistMix } from '../services/mixes'
import { useMixPlaylistRevision } from '../state/mixPlayback'
import { BotonSuperficie } from './BotonSuperficie'
import { ICON_COLOR, IconWave } from './icons'

/** El acceso a Mix muestra la variante que esta cuenta escuchará. */
export function BotonMixPlaylist({ playlistId, name, onPress }: {
  playlistId: string
  name: string
  onPress: () => void
}) {
  const revision = useMixPlaylistRevision(playlistId)
  const [loaded, setLoaded] = useState<{ playlistId: string; revision: number; mix: PlaylistMix | null } | null>(null)
  useEffect(() => {
    let alive = true
    getSelectedPlaylistMix(playlistId)
      .then(mix => { if (alive) setLoaded({ playlistId, revision, mix }) })
      .catch(() => { if (alive) setLoaded({ playlistId, revision, mix: null }) })
    return () => { alive = false }
  }, [playlistId, revision])
  const mix = loaded?.playlistId === playlistId && loaded.revision === revision ? loaded.mix : null
  return <BotonSuperficie accessibilityRole="button" accessibilityLabel={`Mixear ${name}${mix ? `, seleccionado ${mix.name}` : ''}`}
    accessibilityHint="Abre el gráfico de dos canciones para escuchar y editar sus transiciones"
    onPress={onPress} className="h-11 flex-row items-center justify-center gap-2 rounded-full bg-muted px-4 active:opacity-80">
    <IconWave size={16} color={ICON_COLOR.foreground} />
    <Text className="text-foreground text-footnote font-semibold" numberOfLines={1}>
      Mixear
    </Text>
  </BotonSuperficie>
}
