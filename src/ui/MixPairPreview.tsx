import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAudioPlayer, useAudioPlayerStatus, type AudioPlayer } from 'expo-audio'
import { Platform, Text, useWindowDimensions, View } from 'react-native'
import { GhostButton, PrimaryButton } from './Button'
import { iniciarCrossfade, type CrossfadePlayer } from '../lib/crossfade'
import { buildMixPreviewWindow, previewDeckPositionMs } from '../lib/mixPreview'
import { useAudioLease } from '../lib/useAudioLease'
import { mensajeError } from '../lib/mensajeError'
import { headroomGain, perceptualGain, signedUrl } from '../services/music'
import type { MixEdgeInput, PlaylistSoundProfile } from '../services/mixes'
import type { PlaylistTrack } from '../services/playlists'
import { rutaLocal } from '../state/descargas'
import { useEcualizador } from '../state/ecualizador'
import { pauseForSnippet, registerSnippetStopper, useVolume } from '../state/playback'

const PLAYER_OPTIONS = {
  keepAudioSessionActive: true,
  preferredForwardBufferDuration: 20,
  updateInterval: 150,
  crossOrigin: 'anonymous' as const,
}

type SourcePair = { request: number; outgoing: string; incoming: string }
type PreviewError = { request: number; message: string }

type PreviewProfile = Pick<PlaylistSoundProfile, 'bandsDb' | 'preampDb'>

function previewTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

function baseVolume(track: PlaylistTrack, volume: number, profile: PreviewProfile | null): number {
  return Math.min(1, headroomGain(track.truePeak) * (profile ? Math.pow(10, profile.preampDb / 20) : 1))
    * perceptualGain(volume)
}

function setPlayerVolume(player: AudioPlayer, value: number) {
  player.volume = value
}

async function previewSource(track: PlaylistTrack, preferRemote: boolean): Promise<string> {
  if (!track.audioPath) throw new Error(`El audio de «${track.title}» todavía no está preparado.`)
  return (preferRemote ? null : rutaLocal(track.audioPath, track.videoId)) ?? signedUrl(track.audioPath)
}

/** Se monta por par y borrador. Precarga y busca los cues antes de habilitar el toque de escuchar. */
export function MixPairPreview({ from, to, draft, profile, onPosition }: {
  from: PlaylistTrack
  to: PlaylistTrack
  draft: MixEdgeInput
  profile: PreviewProfile | null
  /** Posición real de cada deck en ms; null oculta su cursor. No actualiza React. */
  onPosition?: (outgoingMs: number | null, incomingMs: number | null) => void
}) {
  const { width } = useWindowDimensions()
  const desktop = Platform.OS === 'web' && width >= 780
  const [request, setRequest] = useState(0)
  const [sources, setSources] = useState<SourcePair | null>(null)
  const [loadingError, setLoadingError] = useState<PreviewError | null>(null)
  const [playError, setPlayError] = useState<string | null>(null)
  const [replay, setReplay] = useState(0)
  const [preparedKey, setPreparedKey] = useState('')
  const [playing, setPlaying] = useState(false)
  const source = sources?.request === request ? sources : null
  const outgoing = useAudioPlayer(source ? { uri: source.outgoing } : null, PLAYER_OPTIONS)
  const incoming = useAudioPlayer(source ? { uri: source.incoming } : null, PLAYER_OPTIONS)
  const outgoingStatus = useAudioPlayerStatus(outgoing)
  const incomingStatus = useAudioPlayerStatus(incoming)
  // La duración declarada en la playlist puede diferir de la del archivo decodificado.
  // Los cues, el final natural y el timeout deben usar el tiempo real de ambos decks.
  const window = useMemo(() => source && outgoingStatus.isLoaded && incomingStatus.isLoaded
    ? buildMixPreviewWindow(draft, outgoingStatus.duration * 1000, incomingStatus.duration * 1000)
    : null, [draft, source, outgoingStatus.isLoaded, incomingStatus.isLoaded,
      outgoingStatus.duration, incomingStatus.duration])
  const outgoingLease = useAudioLease(outgoing)
  const incomingLease = useAudioLease(incoming)
  const equalizer = useEcualizador()
  const volume = useVolume()
  const running = useRef(false)
  const runId = useRef(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const positionFrame = useRef<number | null>(null)
  const seekQueue = useRef<Promise<void>>(Promise.resolve())
  const cancelFade = useRef<(() => void) | null>(null)
  const readyKey = `${request}:${replay}:${outgoingStatus.duration}:${incomingStatus.duration}:${window?.outgoingSeekSeconds}:${window?.incomingSeekSeconds}`
  const ready = !!window && !!source && equalizer.cargado && outgoingStatus.isLoaded && incomingStatus.isLoaded
    && preparedKey === readyKey && !playing
  const sourceError = loadingError?.request === request ? loadingError.message : null
  const mediaError = source && (outgoingStatus.error || incomingStatus.error)
  const error = playError ?? sourceError ?? mediaError
    ?? (source && outgoingStatus.isLoaded && incomingStatus.isLoaded && !window
      ? 'Este par no tiene una ventana de audio válida para preescuchar.' : null)
  // El dueño puede escuchar también una curva aún sin publicar o sin guardar.
  const actualProfile = profile

  useEffect(() => {
    let alive = true
    // Un gesto continuo sobre las ondas cambia el borrador muchas veces; firmar al estabilizarse
    // evita una solicitud de Storage por cada desplazamiento del dedo.
    const delay = setTimeout(() => {
      void Promise.all([previewSource(from, request > 0), previewSource(to, request > 0)])
        .then(([outgoingUrl, incomingUrl]) => {
          if (alive) setSources({ request, outgoing: outgoingUrl, incoming: incomingUrl })
        })
        .catch(cause => {
          if (alive) setLoadingError({ request, message: mensajeError(cause) })
        })
    }, 180)
    return () => { alive = false; clearTimeout(delay) }
  }, [from, to, request])

  useEffect(() => {
    if (!window || !source || !outgoingStatus.isLoaded || !incomingStatus.isLoaded
      || outgoingStatus.duration <= 0 || incomingStatus.duration <= 0 || running.current) return
    let alive = true
    // El cue puede cambiar en cada pixel de un arrastre. Buscar sólo cuando
    // se estabiliza evita saltos de audio y operaciones nativas en cadena.
    const delay = setTimeout(() => {
      // Un seek anterior puede seguir pendiente en el motor nativo. El último
      // se ejecuta después de aquél para que nunca gane un cue obsoleto.
      seekQueue.current = seekQueue.current.then(async () => {
        if (!alive || running.current) return
        await Promise.all([
          outgoing.seekTo(Math.min(window.outgoingSeekSeconds, Math.max(0, outgoingStatus.duration - 0.1))),
          incoming.seekTo(Math.min(window.incomingSeekSeconds, Math.max(0, incomingStatus.duration - 0.1))),
        ])
        if (alive && outgoingLease.active && incomingLease.active) {
          setPreparedKey(readyKey)
          setPlayError(null)
        }
      }).catch(cause => {
        if (alive && outgoingLease.active && incomingLease.active) setPlayError(`No se pudieron ubicar los puntos de escucha: ${mensajeError(cause)}`)
      })
    }, 250)
    return () => { alive = false; clearTimeout(delay) }
  }, [window, source, outgoing, incoming, outgoingStatus.isLoaded, incomingStatus.isLoaded,
    outgoingStatus.duration, incomingStatus.duration, outgoingLease, incomingLease, readyKey])

  useEffect(() => {
    if (!source || !outgoingStatus.isLoaded || !incomingStatus.isLoaded || running.current) return
    const outBase = baseVolume(from, volume, actualProfile)
    const inBase = baseVolume(to, volume, actualProfile)
    setPlayerVolume(outgoing, outBase)
    setPlayerVolume(incoming, inBase)
  }, [source, outgoing, incoming, outgoingStatus.isLoaded, incomingStatus.isLoaded,
    from, to, volume, actualProfile])

  useEffect(() => {
    if (!source || !equalizer.cargado || !outgoingStatus.isLoaded || !incomingStatus.isLoaded) return
    try {
      const gains = equalizer.ganancias.map((gain, index) => Math.max(-12, Math.min(12,
        (equalizer.activo ? gain : 0) + (actualProfile ? actualProfile.bandsDb[index] ?? 0 : 0),
      )))
      const enabled = equalizer.activo || !!actualProfile
      for (const player of [outgoing, incoming]) {
        const apply = (player as typeof player & { setEqualizer?: (enabled: boolean, gains: number[]) => void }).setEqualizer
        if (typeof apply === 'function') apply.call(player, enabled, gains)
      }
    } catch { /* La preescucha sigue disponible sin EQ en motores que no lo admiten. */ }
  }, [source, outgoing, incoming, outgoingStatus.isLoaded, incomingStatus.isLoaded,
    equalizer.cargado, equalizer.activo, equalizer.ganancias, actualProfile])

  const halt = useCallback((prepareAgain: boolean) => {
    runId.current++
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    if (positionFrame.current !== null) cancelAnimationFrame(positionFrame.current)
    positionFrame.current = null
    onPosition?.(null, null)
    cancelFade.current?.()
    cancelFade.current = null
    try { (outgoing as CrossfadePlayer).cancelCrossfade?.() } catch { /* El motor puede haberse liberado. */ }
    try { outgoing.pause() } catch { /* El motor puede haberse liberado. */ }
    try { incoming.pause() } catch { /* El motor puede haberse liberado. */ }
    running.current = false
    if (prepareAgain) {
      setPlaying(false)
      setReplay(previous => previous + 1)
    }
  }, [outgoing, incoming, onPosition])

  useEffect(() => {
    // Al modificar un cruce que está sonando, detenerlo antes de preparar los
    // nuevos puntos. Las dos fuentes siguen cargadas en el mismo par.
    if (running.current) halt(true)
  }, [draft, halt])

  useEffect(() => registerSnippetStopper(() => {
    if (running.current) halt(true)
  }), [halt])

  useEffect(() => () => { halt(false) }, [halt])

  const start = () => {
    if (running.current) { halt(true); return }
    if (!ready || !window) return
    const run = ++runId.current
    const startedAt = performance.now()
    let lastOutgoingPosition = outgoing.currentTime
    let sawIncoming = false
    let incomingStartedAt: number | null = null
    running.current = true
    setPlayError(null)
    setPlaying(true)
    onPosition?.(window.outgoingSeekSeconds * 1000, null)

    const fail = (message: string) => {
      if (run !== runId.current || !outgoingLease.active || !incomingLease.active) return
      halt(true)
      setPlayError(message)
    }
    try {
      // pauseForSnippet sólo actúa sobre el reproductor principal; los decks de esta preescucha
      // se detienen por separado al cambiar el par, salir o iniciar otro fragmento.
      pauseForSnippet()
      setPlayerVolume(outgoing, baseVolume(from, volume, actualProfile))
      setPlayerVolume(incoming, baseVolume(to, volume, actualProfile))
      outgoing.play()
      const followAudio = () => {
        if (run !== runId.current || !running.current) return
        onPosition?.(
          previewDeckPositionMs(outgoing.currentTime, outgoing.playing),
          previewDeckPositionMs(incoming.currentTime, incoming.playing),
        )
        positionFrame.current = requestAnimationFrame(followAudio)
      }
      positionFrame.current = requestAnimationFrame(followAudio)
      if (window.transition) {
        cancelFade.current = iniciarCrossfade(outgoing as CrossfadePlayer, incoming as CrossfadePlayer,
          window.transition, () => { sawIncoming = true },
          () => fail('No se pudo iniciar el cruce. Tocá Reintentar para cargar los audios de nuevo.'))
      }
      timer.current = setInterval(() => {
        if (run !== runId.current || !outgoingLease.active || !incomingLease.active) return
        const elapsed = (performance.now() - startedAt) / 1000
        const fromPosition = outgoing.currentTime
        const toPosition = incoming.currentTime
        const statusError = outgoing.currentStatus.error || incoming.currentStatus.error
        if (statusError) { fail(`Error de audio: ${statusError}`); return }
        if (window.transition === null && !sawIncoming
          && (fromPosition >= window.outgoingEndSeconds - 0.1
            || (elapsed > 0.5 && !outgoing.playing && lastOutgoingPosition > window.outgoingSeekSeconds + 0.1))) {
          outgoing.pause()
          try { incoming.play(); sawIncoming = true }
          catch (cause) { fail(`No se pudo iniciar la segunda canción: ${mensajeError(cause)}`); return }
        }
        if (incoming.playing && toPosition > window.incomingSeekSeconds + 0.05) sawIncoming = true
        if (sawIncoming && incomingStartedAt === null) incomingStartedAt = performance.now()
        if (sawIncoming && (toPosition >= window.incomingStopSeconds - 0.05
          || incoming.currentStatus.didJustFinish)) { halt(true); return }
        if (incomingStartedAt !== null && performance.now() - incomingStartedAt > 3000
          && toPosition <= window.incomingSeekSeconds + 0.05 && !incoming.isBuffering) {
          fail('La segunda canción no comenzó. Puede haber un bloqueo de reproducción o un problema de red. Tocá Reintentar.')
          return
        }
        if (elapsed > 3 && !sawIncoming && fromPosition <= window.outgoingSeekSeconds + 0.05
          && !outgoing.isBuffering) {
          fail('El audio no comenzó. Puede estar bloqueado por el navegador o la red. Tocá Reintentar y volvé a escuchar.')
          return
        }
        if (elapsed > window.timeoutSeconds) {
          fail('La preescucha tardó demasiado o se interrumpió. Tocá Reintentar para cargar los audios de nuevo.')
          return
        }
        lastOutgoingPosition = fromPosition
      }, 100)
    } catch (cause) {
      fail(`No se pudo reproducir el par: ${mensajeError(cause)}`)
    }
  }

  const retry = () => {
    halt(true)
    setPlayError(null)
    setRequest(previous => previous + 1)
  }

  const preparing = !error && !ready && !playing
  const temporalEffects = draft.eqSettings?.enabled || draft.filterSettings?.enabled
  const leadSeconds = window ? Math.max(0,
    (window.transition?.fromStartSeconds ?? window.outgoingEndSeconds) - window.outgoingSeekSeconds) : 0
  const overlapSeconds = window?.transition?.durationSeconds ?? 0
  const tailSeconds = window ? Math.max(0, window.incomingStopSeconds - window.incomingSeekSeconds - overlapSeconds) : 0
  const previewSeconds = leadSeconds + overlapSeconds + tailSeconds
  const incomingBegan = !!window && incomingStatus.currentTime > window.incomingSeekSeconds + 0.05
  const elapsedSeconds = !playing || !window ? 0 : Math.max(0, Math.min(previewSeconds,
    incomingBegan
      ? leadSeconds + incomingStatus.currentTime - window.incomingSeekSeconds
      : outgoingStatus.currentTime - window.outgoingSeekSeconds))
  const progress = previewSeconds > 0 ? elapsedSeconds / previewSeconds : 0
  const explanation = `Escuchá unos 5 s antes y después del cruce. El EQ personal y el sonido publicado se aplican cuando el dispositivo los admite.${temporalEffects ? ' El EQ y el filtro de transición pueden variar según el dispositivo.' : ''}`
  return <View style={{ paddingHorizontal: 16, paddingVertical: desktop ? 8 : 12, gap: 8 }}>
    <View style={{ flexDirection: desktop ? 'row' : 'column', alignItems: desktop ? 'center' : 'stretch', gap: desktop ? 16 : 8 }}>
    <View style={{ width: desktop ? 260 : '100%' }}>
      {playing ? <GhostButton label="Detener preescucha" onPress={start} />
        : <PrimaryButton label={preparing ? 'Preparando audio…' : 'Escuchar transición'}
            onPress={start} disabled={!!error} busy={preparing} />}
    </View>
    {window && previewSeconds > 0 ? <View style={{ gap: 5, width: desktop ? 180 : '100%' }}>
      <View accessibilityRole="progressbar"
        accessibilityLabel="Progreso de la preescucha"
        accessibilityValue={{ min: 0, max: Math.ceil(previewSeconds), now: Math.floor(elapsedSeconds) }}
        style={{ height: 4, borderRadius: 2, backgroundColor: '#4D4D4D', overflow: 'hidden', flexDirection: 'row' }}>
        <View style={{ flex: progress, backgroundColor: '#FFFFFF' }} />
        <View style={{ flex: 1 - progress }} />
      </View>
      <Text style={{ color: '#B3B3B3', fontSize: 12, fontVariant: ['tabular-nums'] }}>
        {previewTime(elapsedSeconds)} / {previewTime(previewSeconds)}
      </Text>
    </View> : null}
    {desktop ? <Text style={{ color: '#B3B3B3', fontSize: 12, flex: 1, lineHeight: 17 }}>{explanation}</Text> : null}
    </View>
    {error ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text accessibilityRole="alert" style={{ color: '#FF8989', fontSize: 13, flex: 1 }}>{error}</Text>
      <View style={{ width: 150 }}><GhostButton label="Reintentar" onPress={retry} /></View>
    </View> : null}
    {!desktop ? <Text style={{ color: '#B3B3B3', fontSize: 12 }}>{explanation}</Text> : null}
  </View>
}
