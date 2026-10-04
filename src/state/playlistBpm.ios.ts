import type { TempoDeLista } from '../lib/playlistBpm'

const SIN_BPMS: ReadonlyMap<string, TempoDeLista | null> = new Map()

/** iOS no muestra BPM en las listas ni inicia análisis para sus filas. */
export function usePlaylistBpms(_tracks: readonly { audioPath: string }[]): ReadonlyMap<string, TempoDeLista | null> {
  return SIN_BPMS
}
