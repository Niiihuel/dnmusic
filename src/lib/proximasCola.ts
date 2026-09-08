import type { PlaylistTrack } from '../services/playlists'

type Cola = {
  tracks: PlaylistTrack[]; index: number; manual: PlaylistTrack | null
  upNext: PlaylistTrack[]; shuffle: number[] | null; repetir: 'no' | 'lista' | 'una'
}

/** Simula avances sin mutar la cola ni consumir su orden aleatorio. */
export function proximasCola(cola: Cola, cantidad = 2): PlaylistTrack[] {
  if (cola.repetir === 'una' || cantidad <= 0) return []
  const actual = cola.manual ?? cola.tracks[cola.index]
  const vistas = new Set(actual ? [actual.videoId || actual.audioPath] : [])
  const salida: PlaylistTrack[] = []
  const agregar = (track: PlaylistTrack | undefined) => {
    if (!track) return
    const key = track.videoId || track.audioPath
    if (!key || vistas.has(key) || salida.length >= cantidad) return
    vistas.add(key); salida.push(track)
  }
  cola.upNext.forEach(agregar)
  const orden = cola.shuffle?.filter(i => i >= 0 && i < cola.tracks.length) ?? cola.tracks.map((_, i) => i)
  const posicion = orden.indexOf(cola.index)
  for (const i of orden.slice(posicion + 1)) agregar(cola.tracks[i])
  if (cola.repetir === 'lista') for (const i of orden.slice(0, posicion + 1)) agregar(cola.tracks[i])
  return salida
}
