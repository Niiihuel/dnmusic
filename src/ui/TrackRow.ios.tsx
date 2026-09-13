import type { ComponentProps } from 'react'
import { View, useWindowDimensions } from 'react-native'
import { NativeMediaRow } from '../../modules/media-controls'
import { usePlaybackCargada } from '../state/playback'
import { MantenerApretado } from './Menu'
import { TrackRow as Respaldo } from './TrackRow.shared'
export { ANCHO_DURACION } from './TrackRow.shared'

export function TrackRow(props: ComponentProps<typeof Respaldo>) {
  const { fontScale } = useWindowDimensions()
  const cargada = usePlaybackCargada()
  if (!NativeMediaRow) return <Respaldo {...props} />
  const { title, artist, artwork, sounding, playing, busy, inset = true, onPlay, trailing, menu } = props
  const fila = <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: inset ? 12 : 0 }}>
    <NativeMediaRow title={title} subtitle={artist} artwork={artwork}
      sounding={sounding} playing={playing} busy={!!busy || (sounding && !cargada)}
      label={`${playing ? 'Pausar' : 'Reproducir'} ${title}, de ${artist}`}
      onActivate={onPlay} style={{ flex: 1, height: Math.max(68, 42 * fontScale + 16) }} />
    <View style={{ minWidth: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }}>{trailing}</View>
  </View>
  return menu?.length ? <MantenerApretado items={menu}>{fila}</MantenerApretado> : fila
}

// En iOS las filas son contenido, no columnas de escritorio.
export function TrackColumnHeader(_props: { trailing?: number }) { return null }
