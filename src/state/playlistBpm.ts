import { useEffect, useMemo, useState } from 'react'
import { PlaylistBpmQueue, type TempoDeLista } from '../lib/playlistBpm'
import { pedirAnalisisMusical } from '../services/analisisMusical'

const queue = new PlaylistBpmQueue(pedirAnalisisMusical)

/** BPM real de las pistas de una lista; el render nunca espera al análisis. */
export function usePlaylistBpms(tracks: readonly { audioPath: string }[]): ReadonlyMap<string, TempoDeLista | null> {
  const key = tracks.map(track => track.audioPath).filter(Boolean).join('\u0000')
  const paths = useMemo(() => key ? [...new Set(key.split('\u0000'))] : [], [key])
  const [, setRevision] = useState(0)
  useEffect(() => {
    let live = true
    const stop = queue.subscribe(paths, () => { if (live) setRevision(current => current + 1) })
    return () => { live = false; stop() }
  }, [paths])
  return new Map(paths.map(path => [path, queue.read(path)]))
}
