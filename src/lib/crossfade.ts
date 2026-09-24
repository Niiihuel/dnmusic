import type { AudioPlayer } from 'expo-audio'
import { Platform } from 'react-native'
import type { MusicTransitionPlan } from './mixPlan'
import type { TransitionEq, TransitionFilter } from '../services/mixes'

export type CrossfadePlayer = AudioPlayer & {
  scheduleCrossfade?: (toPlayer: AudioPlayer, options: {
    durationSeconds: number
    fromStartSeconds?: number
    toStartSeconds?: number
    volumeLaw?: 'linear' | 'equal_power'
    volumeOut?: { t: number; value: number }[]
    volumeIn?: { t: number; value: number }[]
    eqSettings?: TransitionEq
    filterSettings?: TransitionFilter
  }) => Promise<boolean>
  cancelCrossfade?: () => void
}

function curveAt(points: { t: number; value: number }[] | undefined, t: number, defaultValue: number): number {
  if (!points?.length) return defaultValue
  if (t <= points[0].t) return points[0].value
  for (let i = 1; i < points.length; i++) {
    const next = points[i]
    if (t <= next.t) {
      const previous = points[i - 1]
      const position = (t - previous.t) / (next.t - previous.t)
      return previous.value + position * (next.value - previous.value)
    }
  }
  return points[points.length - 1].value
}

/** Usa el scheduler de audio cuando está disponible; el respaldo JS sólo controla volumen. */
export function iniciarCrossfade(
  from: CrossfadePlayer,
  to: CrossfadePlayer,
  plan: MusicTransitionPlan,
  onComplete: () => void,
  onUnavailable?: () => void,
  onArmed?: (accepted: boolean) => void,
): () => void {
  const seconds = Math.max(0.25, Math.min(30, plan.durationSeconds))
  const fromBase = from.volume
  const toBase = to.volume
  let done = false
  let active = false
  let usingNative = false
  let entering = false
  let timer: ReturnType<typeof setInterval> | null = null
  let listener: { remove: () => void } | null = null
  const advancedEffects = plan.eqSettings?.enabled === true || plan.filterSettings?.enabled === true

  const clear = () => {
    if (timer) clearInterval(timer)
    listener?.remove()
    timer = null; listener = null
  }
  const finish = (nativeDone = false) => {
    if (done) return
    done = true
    clear()
    if (!nativeDone) {
      from.volume = fromBase
      to.volume = toBase
      from.pause()
    }
    onComplete()
  }
  const unavailable = () => {
    if (done) return
    done = true
    clear()
    from.cancelCrossfade?.()
    if (!usingNative) {
      from.volume = fromBase
      to.volume = toBase
      to.pause()
    }
    onUnavailable?.()
  }

  const startFallback = () => {
    if (done) return
    usingNative = false
    listener?.remove(); listener = null
    let elapsed = 0
    let lastAt = performance.now()
    const tick = () => {
      if (done) return
      const now = performance.now()
      const start = plan.fromStartSeconds ?? Math.max(0, from.duration - seconds)
      if (!active) {
        if (!from.playing || from.currentTime + 0.03 < start) { lastAt = now; return }
        if (from.currentTime > start + seconds || !to.isLoaded) { unavailable(); return }
        active = true
        entering = true
        to.volume = 0
        try {
          const begin = plan.toStartSeconds && plan.toStartSeconds > 0
            ? to.seekTo(plan.toStartSeconds).then(() => to.play())
            : Promise.resolve(to.play())
          void begin.then(() => { entering = false }).catch(unavailable)
        } catch { unavailable(); return }
        lastAt = now
      }
      if (entering) { lastAt = now; return }
      if (!from.playing) {
        if (to.playing) to.pause()
        lastAt = now
        return
      }
      if (!to.playing) {
        try { to.play() } catch { unavailable(); return }
        lastAt = now
        return
      }
      elapsed += now - lastAt
      lastAt = now
      const t = Math.min(1, elapsed / (seconds * 1000))
      const equalPower = plan.volumeLaw === 'equal_power'
      from.volume = fromBase * curveAt(plan.volumeOut, t, equalPower ? Math.cos(t * Math.PI / 2) : 1 - t)
      to.volume = toBase * curveAt(plan.volumeIn, t, equalPower ? Math.sin(t * Math.PI / 2) : t)
      if (t >= 1) finish()
    }
    timer = setInterval(tick, 25)
    tick()
  }
  const fallbackOrUnavailable = () => {
    // Safari en iOS ignora cambios programáticos de HTMLMediaElement.volume.
    // Si Web Audio no pudo crear el grafo, solapar dos <audio> sonaría a volumen
    // completo; el fin normal conserva la música sin esa sorpresa.
    if (advancedEffects || Platform.OS === 'web') unavailable()
    else startFallback()
    onArmed?.(false)
  }

  if (typeof from.scheduleCrossfade === 'function') {
    usingNative = true
    listener = from.addListener('playbackStatusUpdate', status => {
      if ((status as typeof status & { didJustCrossfade?: boolean }).didJustCrossfade) finish(true)
      else if (status.didJustFinish) unavailable()
    })
    try {
      const nativeOptions = { ...plan, durationSeconds: seconds }
      void from.scheduleCrossfade(to, nativeOptions)
        .then(ok => {
          if (done) return
          if (ok) onArmed?.(true)
          else fallbackOrUnavailable()
        })
        .catch(() => { if (!done) fallbackOrUnavailable() })
    } catch {
      fallbackOrUnavailable()
    }
  } else fallbackOrUnavailable()

  return () => {
    if (done) return
    done = true
    clear()
    from.cancelCrossfade?.()
    if (!usingNative) {
      from.volume = fromBase
      to.volume = toBase
      if (active) to.pause()
    }
  }
}
