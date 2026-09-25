import type { ComponentProps } from 'react'
import { View, useWindowDimensions } from 'react-native'
import { NativeMediaRow, NativeRowHighlight } from '../../modules/media-controls'
import { usePlaybackCargada } from '../state/playback'
import { filaCargando } from './estadoFilaReproduccion'
import { RowSurface } from './RowSurface'
import { MantenerApretado } from './Menu'
import { TrackRow as Respaldo } from './TrackRow.shared'
export { ANCHO_DURACION } from './TrackRow.shared'

export function TrackRow(props: ComponentProps<typeof Respaldo>) {
  const { fontScale } = useWindowDimensions()
  const cargada = usePlaybackCargada()
  if (!NativeMediaRow) return <Respaldo {...props} />
  const { title, artist, downloaded, bpm, artwork, sounding, playing, busy, inset = true, onPlay, trailing, menu } = props
  const subtitle = `${downloaded ? '↓  ' : ''}${artist}${bpm === undefined ? '' : ` · ${bpm === null ? '—' : `${bpm.approximate ? '≈' : ''}${bpm.bpm}`} BPM`}`
  const fila = <RowSurface style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: inset ? 12 : 0 }}>
    <NativeMediaRow title={title} subtitle={subtitle} artwork={artwork}
      sounding={sounding} playing={playing} busy={filaCargando(sounding, playing, cargada, busy)}
      {...(NativeRowHighlight ? { drawsHighlight: false } : {})}
      label={`${playing ? 'Pausar' : 'Reproducir'} ${title}, de ${artist}${downloaded ? ', disponible sin conexión' : ''}`}
      onActivate={onPlay} style={{ flex: 1, height: Math.max(68, 42 * fontScale + 16) }} />
    <View style={{ minWidth: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }}>{trailing}</View>
  </RowSurface>
  return menu?.length ? <MantenerApretado items={menu} preview={{ title, subtitle: artist, artwork }} >{fila}</MantenerApretado> : fila
}

// En iOS las filas son contenido, no columnas de escritorio.
export function TrackColumnHeader(_props: { trailing?: number; bpm?: boolean }) { return null }
