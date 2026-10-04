import { useEffect } from 'react'
import { Text, View } from 'react-native'
import type { ArtistResult, TrackResult } from '../services/music'
import { cargarRecientes, limpiarRecientes, olvidarBusqueda, useRecientes } from '../state/recientes'
import { usePlaybackCargada, usePlaybackTrack, useWantPlay } from '../state/playback'
import { useKeyboardH, usePiso, useTecho } from '../state/shell'
import { BotonSuperficie } from './BotonSuperficie'
import { IconButton } from './IconButton'
import { type MenuItem } from './Menu'
import { ArtistHit, ResultadoFila } from './SearchDropdown'
import { ScrollArea } from './ScrollArea'
import { SkeletonList } from './Skeleton'
import { ICON_COLOR, IconClose, IconSearch } from './icons'

/** Entidades elegidas, en orden real; las consultas antiguas se conservan. */
export function SearchRecents({ onPick, onPlay, onOpenArtist, menuFor }: {
  onPick: (termino: string) => void; onPlay: (track: TrackResult) => void
  onOpenArtist: (artist: ArtistResult) => void; menuFor: (track: TrackResult) => MenuItem[]
}) {
  const items = useRecientes()
  const current = usePlaybackTrack()
  const playing = useWantPlay()
  const cargada = usePlaybackCargada()
  const piso = usePiso(16)
  const teclado = useKeyboardH()
  const techo = useTecho(12)
  useEffect(() => { void cargarRecientes() }, [])
  return <ScrollArea className="flex-1" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
    contentContainerStyle={{ paddingTop: techo, paddingBottom: piso + teclado, paddingHorizontal: 16 }}>
    <View className="flex-row items-center justify-between pb-3">
      <Text accessibilityRole="header" className="text-foreground text-body font-semibold">Búsquedas recientes</Text>
      {items?.length ? <BotonSuperficie accessibilityRole="button" accessibilityLabel="Borrar búsquedas recientes"
        onPress={limpiarRecientes} style={{ minHeight: 44, justifyContent: 'center', paddingLeft: 16 }}>
        <Text className="text-muted-foreground text-subheadline">Borrar</Text>
      </BotonSuperficie> : null}
    </View>
    {items === null ? <SkeletonList rows={4} /> : items.length === 0 ? (
      <Text className="text-muted-foreground text-subheadline py-6">Buscá una canción o un artista. Lo que elijas aparece acá.</Text>
    ) : items.map(item => {
      const quitar: MenuItem = { label: 'Quitar de recientes', sfSymbol: 'clock.badge.xmark', onPress: () => olvidarBusqueda(item.id) }
      return <View key={item.id}>
        {item.tipo === 'cancion' ? <ResultadoFila track={item.track} sounding={current?.videoId === item.track.videoId}
          playing={playing} busy={current?.videoId === item.track.videoId && playing && !cargada}
          alwaysSelect={false} onSelect={onPlay} menuFor={track => [...menuFor(track), quitar]} amplia /> : item.tipo === 'artista' ? (
          <ArtistHit artist={item.artist} onPress={() => onOpenArtist(item.artist)} extraItems={[quitar]} amplia />
        ) : <View className="flex-row items-center">
          <BotonSuperficie accessibilityRole="button" accessibilityLabel={`Buscar ${item.termino}`}
            onPress={() => onPick(item.termino)} className="min-w-0 flex-1 flex-row items-center gap-3 py-4">
            <IconSearch size={22} color={ICON_COLOR.muted} />
            <Text className="text-foreground text-body flex-1" numberOfLines={1}>{item.termino}</Text>
          </BotonSuperficie>
          <IconButton label={`Olvidar ${item.termino}`} symbol="xmark" onPress={() => olvidarBusqueda(item.id)} lado={44} icon={<IconClose size={16} color={ICON_COLOR.muted} />} />
        </View>}
      </View>
    })}
  </ScrollArea>
}
