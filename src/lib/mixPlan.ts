import type { MixEdge, MixPreset, PlaylistMix, VolumeLaw, EnvelopePoint, TransitionEq, TransitionFilter } from '../services/mixes'

const CRESCENDO_OUT: EnvelopePoint[] = [
  { t: 0, value: 1 }, { t: 0.5, value: 0.6 }, { t: 1, value: 0 },
]
const CRESCENDO_IN: EnvelopePoint[] = [
  { t: 0, value: 0 }, { t: 0.5, value: 0.1 }, { t: 1, value: 1 },
]

export type MusicTransitionPlan = {
  durationSeconds: number
  fromStartSeconds?: number
  toStartSeconds?: number
  volumeLaw: VolumeLaw
  volumeOut?: EnvelopePoint[]
  volumeIn?: EnvelopePoint[]
  eqSettings?: TransitionEq
  filterSettings?: TransitionFilter
}

/** Solo una arista del par real sobrescribe el preset general del mix. */
export function planForMixPair(
  mix: PlaylistMix,
  edges: readonly MixEdge[],
  fromRowId: string,
  toRowId: string,
  fromDurationMs: number,
  toDurationMs?: number,
): MusicTransitionPlan | null {
  const edge = edges.find(item => item.fromPlaylistTrackId === fromRowId && item.toPlaylistTrackId === toRowId)
  const preset: MixPreset = edge?.preset ?? mix.defaultPreset
  if (preset === 'none') return null
  if (!Number.isFinite(fromDurationMs) || fromDurationMs <= 0) return null
  const targetDuration = toDurationMs != null && Number.isFinite(toDurationMs) && toDurationMs > 0
    ? toDurationMs : Infinity
  const durationMs = Math.min(edge?.durationMs ?? mix.defaultDurationMs, fromDurationMs, targetDuration, 30_000)
  if (durationMs < 250) return null
  const durationSeconds = durationMs / 1000
  const maxFromCueMs = Math.max(0, fromDurationMs - durationMs)
  const fromStartSeconds = edge?.fromCueMs == null
    ? maxFromCueMs / 1000
    : Math.max(0, Math.min(edge.fromCueMs, maxFromCueMs)) / 1000
  const maxToCueMs = Math.max(0, targetDuration - durationMs)
  return {
    durationSeconds,
    fromStartSeconds,
    toStartSeconds: Math.max(0, Math.min(edge?.toCueMs ?? 0, maxToCueMs)) / 1000,
    volumeLaw: edge?.volumeLaw ?? (preset === 'fade' ? 'linear' : 'equal_power'),
    volumeOut: edge?.volumeOut ?? (preset === 'crescendo' ? CRESCENDO_OUT : undefined),
    volumeIn: edge?.volumeIn ?? (preset === 'crescendo' ? CRESCENDO_IN : undefined),
    eqSettings: edge?.eqSettings ?? undefined,
    filterSettings: edge?.filterSettings ?? undefined,
  }
}
