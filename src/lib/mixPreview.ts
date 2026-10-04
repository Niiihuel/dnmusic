import type { MixEdgeInput } from '../services/mixes'
import type { MusicTransitionPlan } from './mixPlan'

const LEAD_SECONDS = 5
const TAIL_SECONDS = 5

export type MixPreviewWindow = {
  transition: MusicTransitionPlan | null
  outgoingSeekSeconds: number
  incomingSeekSeconds: number
  incomingStopSeconds: number
  outgoingEndSeconds: number
  timeoutSeconds: number
}

/** Cursor absoluto del deck que realmente suena; un deck pausado no deja un cursor estacionado. */
export function previewDeckPositionMs(currentTimeSeconds: number, playing: boolean): number | null {
  return playing && Number.isFinite(currentTimeSeconds) && currentTimeSeconds >= 0
    ? Math.round(currentTimeSeconds * 1000) : null
}

/** Ventana corta para oír el borrador. Las duraciones vienen de los reproductores ya cargados. */
export function buildMixPreviewWindow(
  draft: MixEdgeInput,
  fromDecodedDurationMs: number,
  toDecodedDurationMs: number,
): MixPreviewWindow | null {
  if (!Number.isFinite(fromDecodedDurationMs) || !Number.isFinite(toDecodedDurationMs)
    || fromDecodedDurationMs <= 0 || toDecodedDurationMs <= 0) return null

  const outgoingEndSeconds = fromDecodedDurationMs / 1000
  if (draft.preset === 'none') {
    const outgoingSeekSeconds = Math.max(0, outgoingEndSeconds - LEAD_SECONDS)
    return {
      transition: null, outgoingSeekSeconds, incomingSeekSeconds: 0,
      incomingStopSeconds: Math.min(toDecodedDurationMs / 1000, TAIL_SECONDS),
      outgoingEndSeconds,
      timeoutSeconds: outgoingEndSeconds - outgoingSeekSeconds + TAIL_SECONDS + 15,
    }
  }

  const durationMs = Math.min(draft.durationMs, fromDecodedDurationMs, toDecodedDurationMs, 30_000)
  if (!Number.isFinite(durationMs) || durationMs < 250) return null
  const durationSeconds = durationMs / 1000
  const fromCueMs = draft.fromCueMs === null ? fromDecodedDurationMs - durationMs
    : Math.max(0, Math.min(draft.fromCueMs, fromDecodedDurationMs - durationMs))
  const toCueMs = draft.toCueMs === null ? 0
    : Math.max(0, Math.min(draft.toCueMs, toDecodedDurationMs - durationMs))
  const fromStartSeconds = fromCueMs / 1000
  const toStartSeconds = toCueMs / 1000
  const outgoingSeekSeconds = Math.max(0, fromStartSeconds - LEAD_SECONDS)
  const crescendoOut = [{ t: 0, value: 1 }, { t: 0.5, value: 0.6 }, { t: 1, value: 0 }]
  const crescendoIn = [{ t: 0, value: 0 }, { t: 0.5, value: 0.1 }, { t: 1, value: 1 }]
  return {
    transition: {
      durationSeconds, fromStartSeconds, toStartSeconds,
      volumeLaw: draft.volumeLaw,
      volumeOut: draft.volumeOut ?? (draft.preset === 'crescendo' ? crescendoOut : undefined),
      volumeIn: draft.volumeIn ?? (draft.preset === 'crescendo' ? crescendoIn : undefined),
      eqSettings: draft.eqSettings ?? undefined,
      filterSettings: draft.filterSettings ?? undefined,
    },
    outgoingSeekSeconds,
    incomingSeekSeconds: toStartSeconds,
    incomingStopSeconds: Math.min(toDecodedDurationMs / 1000, toStartSeconds + durationSeconds + TAIL_SECONDS),
    outgoingEndSeconds,
    timeoutSeconds: fromStartSeconds - outgoingSeekSeconds + durationSeconds + TAIL_SECONDS + 15,
  }
}
