import type { AnalisisMusical } from '../services/analisisMusical'

export type RhythmOrderItem = {
  trackId: string
  audioPath: string
  durationMs: number
  analysis: AnalisisMusical | null
}

export type RhythmOrderSuggestion = {
  /** IDs de playlist_tracks, en el orden usado para el CAS de la RPC. */
  expectedOrder: string[]
  suggestedOrder: string[]
  usableCount: number
  changed: boolean
  /** Solo para comparar propuestas; no representa tonalidad ni calidad musical. */
  originalCost: number | null
  suggestedCost: number | null
}

type UsableTrack = { trackId: string; bpm: number; energyDb: number; originalIndex: number }

function usableTrack(item: RhythmOrderItem, originalIndex: number): UsableTrack | null {
  const a = item.analysis
  const rhythm = a?.rhythm
  if (!a || a.version !== 1 || a.audioPath !== item.audioPath || !rhythm ||
    !Number.isFinite(item.durationMs) || item.durationMs <= 0 ||
    !Number.isFinite(a.durationMs) ||
    Math.abs(a.durationMs - item.durationMs) > Math.max(1_500, item.durationMs * 0.02) ||
    !Number.isFinite(rhythm.bpm) || rhythm.bpm < 60 || rhythm.bpm > 200 ||
    !Number.isFinite(rhythm.confidence) || rhythm.confidence < 0.75 ||
    !Number.isFinite(a.energy?.meanRms) || a.energy.meanRms <= 0 || a.energy.meanRms > 1 ||
    !Array.isArray(rhythm.beatMs) || rhythm.beatMs.length < 16) return null

  let previous = -1
  for (const beat of rhythm.beatMs) {
    if (!Number.isFinite(beat) || beat <= previous || beat < 0 || beat > a.durationMs) return null
    previous = beat
  }
  return {
    trackId: item.trackId,
    bpm: rhythm.bpm,
    energyDb: Math.max(-60, 20 * Math.log10(a.energy.meanRms)),
    originalIndex,
  }
}

/** Media distancia rítmica: 80→160 BPM es compatible a medio tiempo, con un
 * pequeño costo frente a dos pulsos realmente cercanos. El RMS suma suavidad
 * de energía, sin atribuir tonalidad a un análisis que no la mide. */
function transitionCost(a: UsableTrack, b: UsableTrack): number {
  const octaveDistance = Math.abs(Math.log2(a.bpm / b.bpm))
  const rhythm = Math.min(octaveDistance, Math.abs(octaveDistance - 1) + 0.08)
  const energy = Math.min(1, Math.abs(a.energyDb - b.energyDb) / 24)
  return rhythm + energy * 0.18
}

function pathCost(path: readonly UsableTrack[]): number {
  let cost = 0
  for (let i = 1; i < path.length; i++) cost += transitionCost(path[i - 1], path[i])
  return cost
}

/**
 * Conserva la primera canción analizable y las posiciones de canciones sin
 * mediciones fiables. Entre las demás elige vecinos cercanos en BPM y energía,
 * luego mejora el camino con inversiones 2-opt. Solo sugiere una mutación si
 * reduce el costo medido; la playlist se guarda por separado con CAS.
 */
export function suggestRhythmOrder(items: readonly RhythmOrderItem[]): RhythmOrderSuggestion {
  const expectedOrder = items.map(item => item.trackId)
  if (expectedOrder.some(id => typeof id !== 'string' || !id) ||
    new Set(expectedOrder).size !== expectedOrder.length) {
    throw new Error('La lista tiene IDs de canciones inválidos o repetidos.')
  }
  const known = items.flatMap((item, index) => {
    const usable = usableTrack(item, index)
    return usable ? [usable] : []
  })
  const originalCost = known.length >= 2 ? pathCost(known) : null
  const unchanged = (): RhythmOrderSuggestion => ({
    expectedOrder, suggestedOrder: [...expectedOrder], usableCount: known.length,
    changed: false, originalCost, suggestedCost: originalCost,
  })
  if (known.length < 3) return unchanged()

  const path = [known[0]]
  const remaining = known.slice(1)
  while (remaining.length) {
    let best = 0
    let bestCost = transitionCost(path[path.length - 1], remaining[0])
    for (let i = 1; i < remaining.length; i++) {
      const cost = transitionCost(path[path.length - 1], remaining[i])
      if (cost < bestCost - 1e-9 ||
        (Math.abs(cost - bestCost) <= 1e-9 && remaining[i].originalIndex < remaining[best].originalIndex)) {
        best = i
        bestCost = cost
      }
    }
    path.push(remaining.splice(best, 1)[0])
  }

  // Los costos son simétricos: al invertir un tramo solo cambian sus dos bordes.
  // En listas muy grandes, el camino voraz evita bloquear la interfaz.
  if (path.length <= 200) for (let pass = 0; pass < 4; pass++) {
    let improved = false
    for (let left = 1; left < path.length - 1; left++) for (let right = left + 1; right < path.length; right++) {
      const before = transitionCost(path[left - 1], path[left]) +
        (right + 1 < path.length ? transitionCost(path[right], path[right + 1]) : 0)
      const after = transitionCost(path[left - 1], path[right]) +
        (right + 1 < path.length ? transitionCost(path[left], path[right + 1]) : 0)
      if (after < before - 1e-9) {
        const reversed = path.slice(left, right + 1).reverse()
        path.splice(left, reversed.length, ...reversed)
        improved = true
      }
    }
    if (!improved) break
  }

  const candidateCost = pathCost(path)
  if (originalCost === null || candidateCost + 0.02 >= originalCost) return unchanged()
  const knownIds = new Set(known.map(track => track.trackId))
  let nextKnown = 0
  const suggestedOrder = expectedOrder.map(id => knownIds.has(id) ? path[nextKnown++].trackId : id)
  const changed = suggestedOrder.some((id, index) => id !== expectedOrder[index])
  if (!changed) return unchanged()
  return { expectedOrder, suggestedOrder, usableCount: known.length, changed,
    originalCost, suggestedCost: candidateCost }
}
