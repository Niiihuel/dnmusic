import { crearVigilanteAudio, abrirFuenteConReintento, esperarAperturaAudio, type PresupuestoRecuperacion } from '../lib/recuperacionAudio'
import { crearMedidorEscucha } from '../lib/escuchaEfectiva'
import { useAudioLease } from '../lib/useAudioLease'
import { registrarIncidenciaAudio } from '../state/diagnosticoAudio'
import { proximasCola, siguienteCola } from '../lib/proximasCola'
import { usePrecargaCola } from './usePrecargaCola'
import { useEspectroAudio } from './useEspectroAudio'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, Platform } from 'react-native'
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio'
import { artworkSource } from '../lib/artwork'
import { headroomGain, perceptualGain, resolveSong, signedUrl, type TrackResult } from '../services/music'
import { useLockScreen } from '../state/lockScreen'
import { anotarEscucha } from '../services/plays'
import type { PlaylistTrack } from '../services/playlists'
import {
  advance,
  getPlaybackState,
  reportRecuperada,
  completarCancion,
  pausaExterna,
  playbackOrigin,
  reanudacionExterna,
  reanudarTrasInterrupcion,
  registerEngine,
  registerRelleno,
  rellenarSiFalta,
  reportCargada,
  reportError,
  reportProgress,
  reportarPosicionFina,
  usePlaybackState,
  videoIdsRecorridos,
  type PlaybackOrigin,
} from '../state/playback'
import { proximasRecomendadas, type ArtistaEscuchado } from '../services/recomendaciones'
import { HAY_DESCARGAS, marcarAudioUsado, rutaLocal, useDescargasCargadas, useDescargasError } from '../state/descargas'
import {
  jamEsperaArranqueMs,
  jamPosicionObjetivoMs,
  jamSuena,
  rellenarJamSiFalta,
  useJamActivo,
  useJamRevision,
  useJamSilencioso,
  useJamSincronizo,
} from '../state/jam'
import { esEscuchaEspejo, reportarActividadEscucha, useEscuchaEspejo } from '../state/escucha'
import { saltar } from '../lib/seek'
import { useAppActiva } from '../lib/appActiva'
import { avisar } from '../state/aviso'
import { mensajeError } from '../lib/mensajeError'
import { guardarEcualizadorAhora, informarSoporteEcualizador, useEcualizador } from '../state/ecualizador'
import { useTransicionesGlobales } from '../state/transiciones'
import { iniciarCrossfade, type CrossfadePlayer } from '../lib/crossfade'
import { planForMixPair, type MusicTransitionPlan } from '../lib/mixPlan'
import { loadActivePlaylistMix, useMixPlaylistRevision, type ActivePlaylistMix } from '../state/mixPlayback'
import { usePlaylistSoundPreference } from '../state/playlistSoundPreference'

/** Margen para dar por terminada una canción. */
const END_EPSILON_S = 0.35
/** Límite para preparar un cue al inicio sin demorar indefinidamente el play. */
const CUE_ZERO_PREPARE_TIMEOUT_MS = 1500
/** Tope de URLs cacheadas además de las fuentes actual y próximas, que se conservan. */
const CACHE_URLS = 3
/** Cadencia del store; la barra fina usa cuadros visibles y el final llega del player. */
const AVISO_CADA_MS = 100
/**
 * Jam ignora deriva <80ms, corrige hasta 400ms con velocidad y salta por encima.
 * Revisa cada siete segundos y ante eventos; evita leer por cuadro en segundo plano.
 */
const JAM_DERIVA_MIN_MS = 80
const JAM_SALTO_MS = 400
const JAM_REVISA_CADA_MS = 7000

/**
 * Motor sin interfaz, montado una vez en el layout para conservar los players
 * al navegar. Se comunica con los controles mediante state/playback.
 */
export function MotorAudio() {
  const indiceLocalListo = useDescargasCargadas()
  const errorIndiceLocal = useDescargasError()
  const {
    tracks,
    index,
    manual,
    upNext,
    shuffle,
    repetir,
    origin,
    wantPlay,
    seleccionRevision,
    positionMs,
    volume,
  } = usePlaybackState()

  // Lo encolado a mano manda sobre la lista mientras dure.
  const current = manual ?? (index >= 0 ? (tracks[index] ?? null) : null)
  /** Precarga en el mismo orden que advance: cola manual, luego playlist. */
  const proximas = useMemo(() => proximasCola({ tracks, index, manual, upNext, shuffle, repetir }, HAY_DESCARGAS ? 5 : 2),
    [tracks, index, manual, upNext, shuffle, repetir])
  /**
   * El sistema descarga una portada grande para la pantalla bloqueada,
   * independiente de la miniatura que dibuja la app.
   */
  const artworkBloqueo = current
    ? artworkSource(current.artworkPath, current.artworkUrl, 1000)
    : null
  /** Sesión exclusiva con reproducción en segundo plano; en web la llamada no actúa. */
  useEffect(() => {
    void setAudioModeAsync({
      shouldPlayInBackground: true,
      playsInSilentMode: true,
      interruptionMode: 'doNotMix',
    }).catch((causa: unknown) => {
      avisar(`La música no va a seguir con la pantalla apagada: ${mensajeError(causa)}`, true)
    })
  }, [])

  /** Cada firma conserva su trackId para ignorar respuestas tardías de otra pista. */
  const [fuenteEnUso, setFuenteEnUso] = useState<string | null>(null)
  const [urls, setUrls] = useState<{ trackId: string; url: string; hasta: number }[]>([])
  const urlOf = useCallback(
    (track: PlaylistTrack | null) => {
      const entrada = track ? urls.find(u => u.trackId === track.id) : undefined
      // Nunca expirar una fuente en uso. Al volver a seleccionarla, se refirma.
      const uri = entrada && (fuenteEnUso === entrada.url || entrada.hasta > Date.now()) ? entrada.url : null
      if (!uri || !track) return null
      // Una caché temporal puede haberse eliminado desde la última escucha.
      if ((uri.startsWith('file:') || uri.startsWith('app://dnmusic/_audio/')) && rutaLocal(track.audioPath, track.videoId) !== uri) return null
      return uri
    },
    [urls, fuenteEnUso],
  )

  /**
   * Fuentes protegidas de la poda. La ref permite consultarlas tras await
   * sin recrear remember al cambiar de canción.
   */
  const vivas = useRef<(string | undefined)[]>([])
  /* Se anota después de dibujar y no durante: `remember` siempre corre detrás
     de un `await signedUrl(...)`, así que para cuando lee esto ya está al día. */
  useEffect(() => {
    vivas.current = [current?.id, ...proximas.map(t => t.id)]
  }, [current?.id, proximas])

  /**
   * Conserva las fuentes en uso para no recrear sus players.
   * El tope sólo se aplica a firmas que ya no pertenecen a la cola protegida.
   */
  const remember = useCallback((trackId: string, url: string) => {
    setUrls((prev) => {
      const hasta = /^https?:/.test(url) ? Date.now() + 50 * 60_000 : Infinity
      const todas = [{ trackId, url, hasta }, ...prev.filter((u) => u.trackId !== trackId)]
      const enLaCola = new Set(vivas.current)
      let otras = 0
      return todas.filter((u) => {
        if (enLaCola.has(u.trackId)) return true
        otras += 1
        return otras <= CACHE_URLS
      })
    })
  }, [])
  const olvidar = useCallback((trackId: string, uri: string) => {
    setUrls(prev => prev.filter(entry => entry.trackId !== trackId || entry.url !== uri))
  }, [])

  /**
   * silencioso controla al host sin audio local; sincronizo persigue su reloj.
   * El host es la referencia y no corrige contra su propia deriva.
   */
  const enJam = useJamActivo()
  const silencioso = useJamSilencioso()
  const sincronizo = useJamSincronizo()
  const jamRev = useJamRevision()
  /** En espejo suena otro dispositivo de la cuenta: no crear ni firmar fuentes locales. */
  const espejo = useEscuchaEspejo()
  const mudo = silencioso || espejo
  // Si una recuperación encuentra otra fuente, volver a consultar el índice:
  // el archivo elegido pudo desaparecer desde que empezó la canción.
  const [reaperturaRevision, setReaperturaRevision] = useState(0)
  // Elegir disco al entrar a un tema; una descarga que termine durante ese
  // tema no cambia su fuente ni reinicia la reproducción.
  const idActual = current?.id
  const pathActual = current?.audioPath
  const videoActual = current?.videoId
  const fuenteLocal = useMemo(() => pathActual || videoActual ? rutaLocal(pathActual ?? '', videoActual) : null,
    // La revisión distingue volver a elegir la misma pista desde otra cola.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idActual, pathActual, videoActual, indiceLocalListo, seleccionRevision, reaperturaRevision])

  // Conservar la fuente del deck que ya empezó nativamente. Una descarga que
  // termine justo en el relevo no debe recrearlo al promoverlo a activo.
  const [fuenteRelevo, setFuenteRelevo] = useState<{ trackId: string; url: string; revision: number } | null>(null)
  const relevoActual = fuenteRelevo?.trackId === current?.id && fuenteRelevo?.revision === seleccionRevision
    ? fuenteRelevo.url : null
  const url = mudo ? null : relevoActual ?? fuenteLocal ?? urlOf(current)
  if (fuenteRelevo && (fuenteRelevo.trackId !== current?.id || fuenteRelevo.revision !== seleccionRevision)) {
    setFuenteRelevo(null)
  }
  const transiciones = useTransicionesGlobales()
  const mixRevision = useMixPlaylistRevision(origin?.id ?? null)
  const [mixPlaylist, setMixPlaylist] = useState<{ playlistId: string; revision: number; data: ActivePlaylistMix | null } | null>(null)
  useEffect(() => {
    if (!origin?.id) return
    let alive = true
    const playlistId = origin.id
    loadActivePlaylistMix(playlistId)
      .then(next => { if (alive) setMixPlaylist({ playlistId, revision: mixRevision, data: next }) })
      .catch(() => { if (alive) setMixPlaylist({ playlistId, revision: mixRevision, data: null }) })
    return () => { alive = false }
  }, [origin?.id, mixRevision])
  const mixResolved = !origin?.id || (mixPlaylist?.playlistId === origin.id && mixPlaylist?.revision === mixRevision)
  const activeMix = mixResolved && mixPlaylist?.data?.playlistId === origin?.id ? mixPlaylist?.data ?? null : null
  const candidata = useMemo(() => siguienteCola({ tracks, index, manual, upNext, shuffle, repetir }),
    [tracks, index, manual, upNext, shuffle, repetir])
  const puedeMezclar = mixResolved && (transiciones.modo !== 'normal' || !!activeMix?.mix)
  const puedeRelevar = Platform.OS === 'ios'
  const urlCandidata = !mudo && (puedeMezclar || puedeRelevar) && repetir !== 'una' && !enJam && candidata && candidata.id !== current?.id
    ? rutaLocal(candidata.audioPath, candidata.videoId) ?? urlOf(candidata)
    : null
  useEffect(() => {
    if (!mudo && current && fuenteLocal) marcarAudioUsado(pathActual ?? '', current.videoId)
  }, [mudo, current, pathActual, fuenteLocal])
  const raf = useRef<number | null>(null)
  /** El último aviso al store, para no inundarlo. Ver `AVISO_CADA_MS`. */
  const ultimoAviso = useRef(0)

  /**
   * Conservar la sesión al pausar, terminar o liberar un deck mantiene
   * la ficha del sistema visible durante la pausa.
   */
  /* Los dos hooks conservan el deck entrante al convertirlo en el activo. En
   * un avance normal solo cambia la fuente del deck activo, como antes. */
  const [deckActivo, setDeckActivo] = useState<0 | 1>(0)
  const opcionesPlayer = {
    keepAudioSessionActive: true,
    preferredForwardBufferDuration: 30,
    updateInterval: 1000,
    crossOrigin: 'anonymous' as const,
  }
  const deckA = useAudioPlayer((deckActivo === 0 ? url : urlCandidata) ? { uri: (deckActivo === 0 ? url : urlCandidata)! } : null, opcionesPlayer)
  const deckB = useAudioPlayer((deckActivo === 1 ? url : urlCandidata) ? { uri: (deckActivo === 1 ? url : urlCandidata)! } : null, opcionesPlayer)
  const player = deckActivo === 0 ? deckA : deckB
  const siguientePlayer = deckActivo === 0 ? deckB : deckA
  const ecualizador = useEcualizador()
  const soundPreference = usePlaylistSoundPreference(origin?.id ?? null)
  const profile = soundPreference.loaded && soundPreference.enabled ? activeMix?.soundProfile : null
  const currentUsesProfile = !manual && !!current && tracks.some(track => track.id === current.id)
  const nextUsesProfile = !upNext.length && !!candidata && tracks.some(track => track.id === candidata.id)
  useEffect(() => {
    if (!ecualizador.cargado) return
    try {
      for (const [deck, inPlaylist] of [[player, currentUsesProfile], [siguientePlayer, nextUsesProfile]] as const) {
        const aplicar = (deck as typeof deck & { setEqualizer?: (activo: boolean, ganancias: number[]) => void }).setEqualizer
        if (typeof aplicar !== 'function') {
          informarSoporteEcualizador('no-disponible')
          return
        }
        const applyProfile = inPlaylist && !!profile
        const gains = ecualizador.ganancias.map((gain, index) => Math.max(-12, Math.min(12,
          (ecualizador.activo ? gain : 0) + (applyProfile ? profile.bandsDb[index] ?? 0 : 0),
        )))
        aplicar.call(deck, ecualizador.activo || applyProfile, gains)
      }
      informarSoporteEcualizador('disponible')
    } catch {
      informarSoporteEcualizador('error')
    }
  }, [player, siguientePlayer, ecualizador.cargado, ecualizador.activo, ecualizador.ganancias, profile, currentUsesProfile, nextUsesProfile])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') void guardarEcualizadorAhora()
    })
    return () => { subscription.remove(); void guardarEcualizadorAhora() }
  }, [])
  const lease = useAudioLease(player)
  const playing = wantPlay && url !== null
  const bucle = !enJam && (repetir === 'una' || (repetir === 'lista' && tracks.length === 1 && upNext.length === 0 && !manual))
  useEffect(() => {
    // Repetir lo resuelve el reproductor, incluso con JS suspendido.
    // eslint-disable-next-line react-hooks/immutability
    player.loop = bucle
  }, [player, bucle])
  useEffect(() => {
    if (!playing || mudo) reportarActividadEscucha(false)
    return () => reportarActividadEscucha(false)
  }, [player, current?.id, playing, mudo])
  const appActiva = useAppActiva()
  useEspectroAudio(player, current?.videoId, playing && appActiva)

  /** Publicar la ficha sólo cuando hay fuente para el reproductor activo. */
  useLockScreen(
    player,
    current && url
      ? {
          title: current.title,
          artist: current.artist,
          collection: manual ? 'En la cola' : (origin?.name ?? ''),
          artworkUrl: artworkBloqueo,
        }
      : null,
    appActiva,
  )

  /**
   * MotorAudio conecta recomendaciones y playback sin un ciclo de imports.
   * Excluye canciones de la cola y del historial al pedir la próxima tanda.
   */
  useEffect(() => {
    /** Excluir lista, cola manual y tema actual; las pistas recorridas se leen al pedir. */
    const enCola = [...tracks, ...upNext, ...(manual ? [manual] : [])].map((t) => t.videoId)
    /** La duración por artista es el respaldo cuando el historial aún no ofrece anclas. */
    const porArtista = new Map<string, ArtistaEscuchado>()
    for (const t of [...tracks, ...upNext]) {
      if (!t.artistId) continue
      const previo = porArtista.get(t.artistId)
      if (previo) previo.ms += t.durationMs
      else porArtista.set(t.artistId, { artist_id: t.artistId, artist: t.artist, ms: t.durationMs })
    }
    registerRelleno(() =>
      proximasRecomendadas([...enCola, ...videoIdsRecorridos()], [...porArtista.values()]),
    )
    return () => registerRelleno(null)
  }, [tracks, upNext, manual])

  /**
   * Pedir descubrimiento antes de vaciar la cola evita silencios que permitan
   * a iOS suspender JS. rellenarSiFalta comprueba modo, repetición y umbral.
   */
  useEffect(() => {
    if (!current || !playing) return
    rellenarSiFalta()
  }, [current, proximas, upNext.length, playing])

  /**
   * Cada revisión dispara el relleno compartido; la función comprueba host,
   * modo descubrimiento, última canción y solicitudes en vuelo.
   */
  useEffect(() => {
    if (enJam) void rellenarJamSiFalta()
  }, [enJam, jamRev])

  /**
   * Objetivo pendiente: evita reportar ticks viejos durante seekTo, que podrían
   * pisar un reinicio o disparar un fin. Se libera al llegar o vencer el timeout.
   */
  const saltoEnVuelo = useRef<{ objetivoS: number; pedidoEn: number } | null>(null)
  const crossfadeEnCurso = useRef<{ token: symbol; fromId: string; toId: string; startSeconds: number; cancel: () => void } | null>(null)
  const crossfadeFallido = useRef<{ fromId: string; toId: string } | null>(null)
  const cueZeroStartTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cueZeroExpired = useRef<string | null>(null)
  const cueZeroWait = useRef<{ key: string; startedAt: number } | null>(null)
  useEffect(() => { crossfadeFallido.current = null }, [current?.id])
  useEffect(() => {
    cueZeroExpired.current = null
    cueZeroWait.current = null
  }, [current?.id, index, seleccionRevision])

  // Un salto no se puede expresar como estado: pedir dos veces el mismo segundo
  // tiene que saltar dos veces. La cola deja el pedido acá.
  useEffect(() => {
    registerEngine({
      seekTo: (ms) => {
        if (!lease.active) return
        crossfadeEnCurso.current?.cancel()
        crossfadeEnCurso.current = null
        saltoEnVuelo.current = { objetivoS: ms / 1000, pedidoEn: performance.now() }
        saltar(player, ms / 1000)
      },
    })
    return () => registerEngine(null)
  }, [player, lease])

  /** headroomGain deja margen cuando no hay pico medido. */
  useEffect(() => {
    /** El volumen de usuario se multiplica por el margen técnico y el preamp. */
    // expo-audio expone el volumen como una propiedad mutable del reproductor.
    // La perilla pasa por `perceptualGain`: el slider es lineal en pantalla pero
    // el oído no lo es, así que la posición se curva antes de volverse gain.
    // eslint-disable-next-line react-hooks/immutability
    player.volume = Math.min(1, headroomGain(current?.truePeak) * (currentUsesProfile && profile ? Math.pow(10, profile.preampDb / 20) : 1)) * perceptualGain(volume)
  }, [player, current, volume, currentUsesProfile, profile])
  useEffect(() => {
    // expo-audio expone volume como propiedad mutable también para el deck precargado.
    // eslint-disable-next-line react-hooks/immutability
    siguientePlayer.volume = Math.min(1, headroomGain(candidata?.truePeak) * (nextUsesProfile && profile ? Math.pow(10, profile.preampDb / 20) : 1)) * perceptualGain(volume)
  }, [siguientePlayer, candidata, volume, nextUsesProfile, profile])

  /**
   * La radio encola metadata sin esperar audio. Se resuelven la actual y la próxima
   * sin bloquear toda la tanda; el servicio comparte solicitudes coincidentes.
   */
  const resolver = useCallback(
    (track: PlaylistTrack) => {
      const pedido: TrackResult = { ...track, album: '', albumId: null }
      return resolveSong(pedido).then((song) => {
        completarCancion(track.videoId, {
          audioPath: song.path, artworkPath: song.artworkPath, durationMs: song.durationMs,
        })
        remember(track.id, rutaLocal(song.path, track.videoId) ?? song.url)
        return song
      })
    }, [remember],
  )

  // Firmar la URL de la canción actual. Se firma al reproducir y no antes: una
  // URL firmada vence, y una lista puede quedar abierta mucho rato.
  useEffect(() => {
    // De control remoto o de espejo no se firma nada: no hay reproductor que
    // alimentar.
    if (mudo || !wantPlay || (HAY_DESCARGAS && !indiceLocalListo && !errorIndiceLocal)) return
    // La fuente se eligió al seleccionar la pista. Si terminó una descarga
    // mientras sonaba en remoto, no reemplazarla hasta la próxima selección
    // o un fallo del player: eso recrearía el reproductor en mitad del tema.
    if (!current || fuenteLocal || urlOf(current)) return
    /*
     * Una candidata sin audio primero se resuelve. El error sí se muestra: es
     * la canción que la persona está esperando escuchar, y el servicio ya
     * devuelve el motivo en una frase para la app.
     */
    if (!current.audioPath) {
      let alive = true
      void resolver(current).catch((causa: unknown) => { if (alive) reportError(mensajeError(causa)) })
      return () => { alive = false }
    }
    // Sin descarga ni URL preparada, hay que pedir una firma para este tema.
    let alive = true
    const id = current.id
    const abort = new AbortController()
    abrirFuenteConReintento(() => signedUrl(current.audioPath), abort.signal)
      .then((next) => alive && remember(id, next))
      .catch((causa: unknown) => {
        if (!alive) return
        void registrarIncidenciaAudio({ tipo: 'agotado', motivo: mensajeError(causa), enSegundoPlano: AppState.currentState !== 'active' })
        reportError('No se pudo abrir la canción. Revisá la conexión y tocá reproducir para reintentar.')
      })
    return () => {
      alive = false
      abort.abort()
    }
  }, [current, fuenteLocal, urlOf, remember, mudo, wantPlay, resolver, indiceLocalListo, errorIndiceLocal])

  usePrecargaCola({ current, proximas, url, player, wantPlay, mudo, remember, olvidar })

  /**
   * Pasar a la siguiente, una sola vez por canción.
   *
   * El reproductor puede entregar varios estados de fin para el mismo item.
   * Esta traba impide que una notificación duplicada saltee una canción.
   */
  const ended = useRef(false)
  const finish = useCallback(() => {
    if (ended.current) return
    // El scheduler puede cancelar internamente por stall o fallo de la entrada
    // sin un evento de rechazo posterior. Un didJustFinish del saliente sigue
    // siendo un fin natural: liberar el plan y avanzar una sola vez.
    crossfadeEnCurso.current?.cancel()
    crossfadeEnCurso.current = null
    ended.current = true
    advance()
  }, [])

  const arrancar = useCallback(() => {
    if (cueZeroStartTimer.current) clearTimeout(cueZeroStartTimer.current)
    cueZeroStartTimer.current = null
    cueZeroWait.current = null
    const estado = getPlaybackState()
    if (!lease.active || !estado.wantPlay || (estado.manual ?? estado.tracks[estado.index])?.id !== current?.id) return
    // Tras el handoff el deck entrante ya está sonando; aun así empieza una
    // canción nueva y su final natural debe volver a habilitarse.
    ended.current = false
    if (player.playing) return
    const total = Number.isFinite(player.duration) ? player.duration : 0
    if (total > 0 && player.currentTime >= total - END_EPSILON_S) saltar(player, 0)
    player.play()
  }, [player, lease, current?.id])

  const transitionPlan = useCallback((totalSeconds: number): MusicTransitionPlan | null => {
    const pairInPlaylist = !!activeMix?.mix && !!current && !!candidata && !manual && !upNext.length
      && tracks.some(track => track.id === current.id) && tracks.some(track => track.id === candidata.id)
    if (pairInPlaylist) return planForMixPair(activeMix!.mix!, activeMix!.edges, current!.id, candidata!.id, totalSeconds * 1000, candidata!.durationMs)
    if (transiciones.modo === 'normal' || !transiciones.cargado) return null
    const requestedSeconds = transiciones.modo === 'sin-pausa' ? 0.25 : transiciones.segundos
    const durationSeconds = Math.min(requestedSeconds, Math.max(0, totalSeconds - 0.25))
    if (durationSeconds < 0.25) return null
    return { durationSeconds, fromStartSeconds: totalSeconds - durationSeconds, toStartSeconds: 0, volumeLaw: 'equal_power' }
  }, [activeMix, current, candidata, manual, upNext, tracks, transiciones.modo, transiciones.cargado, transiciones.segundos])

  /* Solo mezclamos el par que la cola realmente va a reproducir. Si cambia
   * por aleatorio, cola manual o una selección nueva, la limpieza cancela el
   * plan y el avance normal sigue disponible. */
  useEffect(() => {
    if ((!puedeMezclar && !puedeRelevar) || !wantPlay || mudo || enJam || !url || !urlCandidata || !current || !candidata || repetir === 'una') return
    const attempt = (status: typeof player.currentStatus) => {
      const pendiente = crossfadeEnCurso.current
      if (pendiente) {
        if (pendiente.fromId === current.id && status.currentTime < pendiente.startSeconds - 0.8) {
          pendiente.cancel()
          crossfadeEnCurso.current = null
        }
        return
      }
      if (!status.isLoaded || status.isBuffering || !siguientePlayer.isLoaded) return
      const total = playerTotalS(player, current)
      const plan = transitionPlan(total) ?? (puedeRelevar ? {
        durationSeconds: 0, fromStartSeconds: total, toStartSeconds: 0, volumeLaw: 'linear' as const,
      } : null)
      if (!plan) return
      const relevo = plan.durationSeconds === 0
      const start = plan.fromStartSeconds ?? total - plan.durationSeconds
      const cueZero = start <= 0.001
      // Un cue al inicio debe quedar armado antes de reproducir el saliente.
      if (cueZero && (status.currentTime > 0.05 || getPlaybackState().positionMs > 0 ||
        cueZeroExpired.current === `${current.id}:${seleccionRevision}`)) return
      if (!status.playing && (!cueZero || saltoEnVuelo.current !== null)) return
      const restante = total - status.currentTime
      if (!Number.isFinite(restante) || restante < 0.3 || (!relevo &&
        (status.currentTime < start - 20 || status.currentTime > start + plan.durationSeconds / 2))) return
      const estado = getPlaybackState()
      const actual = estado.manual ?? estado.tracks[estado.index]
      const siguiente = siguienteCola(estado)
      if (actual?.id !== current.id || siguiente?.id !== candidata.id) return
      if (crossfadeFallido.current?.fromId === current.id && crossfadeFallido.current.toId === candidata.id) return
      try {
        const late = Math.max(0, status.currentTime - start)
        // Dejar un margen cuando el aviso de posición llegó después del cue.
        const shift = cueZero ? 0 : late > 0 && plan.durationSeconds - late > 0.6 ? late + 0.35 : late
        const scheduled = shift > 0 ? {
          ...plan,
          durationSeconds: Math.max(0.25, plan.durationSeconds - shift),
          fromStartSeconds: status.currentTime + (shift - late),
          toStartSeconds: (plan.toStartSeconds ?? 0) + shift,
        } : plan
        let unavailableNow = false
        const token = Symbol('transicion')
        const cancel = iniciarCrossfade(player as CrossfadePlayer, siguientePlayer as CrossfadePlayer, scheduled, () => {
          const vigente = crossfadeEnCurso.current
          if (vigente?.token !== token) return
          crossfadeEnCurso.current = null
          const alTerminar = getPlaybackState()
          const sigueSiendo = siguienteCola(alTerminar)
          if (!lease.active || !alTerminar.wantPlay || esEscuchaEspejo() ||
            alTerminar.seleccionRevision !== seleccionRevision ||
            (alTerminar.manual ?? alTerminar.tracks[alTerminar.index])?.id !== vigente.fromId || sigueSiendo?.id !== vigente.toId) {
            // El audio entrante ya arrancó del lado nativo. Si la selección se
            // canceló antes del render, detenerlo sin avanzar la cola nueva.
            try { siguientePlayer.pause() } catch { /* El deck ya pudo liberarse. */ }
            return
          }
          ended.current = true
          setFuenteRelevo({ trackId: vigente.toId, url: urlCandidata, revision: alTerminar.seleccionRevision })
          setDeckActivo(deckActivo === 0 ? 1 : 0)
          advance()
        }, () => {
          unavailableNow = true
          if (crossfadeEnCurso.current && crossfadeEnCurso.current.token !== token) return
          crossfadeFallido.current = { fromId: current.id, toId: candidata.id }
          crossfadeEnCurso.current = null
          if (scheduled.eqSettings?.enabled || scheduled.filterSettings?.enabled) {
            avisar('No se pudieron aplicar los efectos de esta transición. La música continúa sin el cruce.', true)
          }
          if (player.currentTime >= playerTotalS(player, current) - END_EPSILON_S) finish()
        }, () => {
          if (cueZero && !status.playing) arrancar()
        })
        if (!unavailableNow) crossfadeEnCurso.current = { token, fromId: current.id, toId: candidata.id, startSeconds: status.currentTime, cancel }
      } catch {
        // El fin natural conserva la reproducción si el segundo deck falla.
      }
    }
    const sub = player.addListener('playbackStatusUpdate', attempt)
    const nextSub = siguientePlayer.addListener('playbackStatusUpdate', () => attempt(player.currentStatus))
    attempt(player.currentStatus)
    return () => {
      sub.remove()
      nextSub.remove()
      const pendiente = crossfadeEnCurso.current
      if (pendiente?.fromId === current.id) {
        pendiente.cancel()
        crossfadeEnCurso.current = null
      }
    }
  }, [player, lease, siguientePlayer, current, candidata, url, urlCandidata, puedeMezclar, puedeRelevar, transitionPlan, wantPlay, mudo, enJam, repetir, deckActivo, seleccionRevision, mixRevision, finish, arrancar])

  /**
   * Acumular escucha en una ref con track y origen completos. Al cambiar de pista
   * se despacha una vez, incluso si se saltó, sin atribuirla al tema nuevo.
   */
  const medidorEscucha = useMemo(() => crearMedidorEscucha(), [])
  const escuchado = useRef<{ track: PlaylistTrack | null; ms: number; origen: PlaybackOrigin | null }>({
    track: null,
    ms: 0,
    origen: null,
  })
  useEffect(() => {
    const previo = escuchado.current
    /* Al cambiar de canción se despacha lo de la anterior. En el primer
       dibujado no hay nada anterior que anotar. */
    if (previo.track && previo.track.id !== current?.id) {
      void anotarEscucha({
        videoId: previo.track.videoId,
        title: previo.track.title,
        artist: previo.track.artist,
        artistId: previo.track.artistId,
        artworkUrl: previo.track.artworkUrl,
        artworkPath: previo.track.artworkPath,
        /* La colección que sonaba **al despachar**: es la de la canción que
           se va, no la nueva, porque el origen cambia junto con la cola y
           esto corre antes de que la nueva empiece a contar. */
        origen: previo.origen,
        ms: previo.ms,
      })
    }
    if (previo.track?.id !== current?.id) {
      medidorEscucha.reiniciar()
      escuchado.current = { track: current, ms: 0, origen: playbackOrigin() }
    }
  }, [current, medidorEscucha])

  /**
   * Aplica la posición restaurada una vez por pista cargada; refirmar su URL
   * no debe volver a un segundo anterior. Los avances normales empiezan en cero.
   */
  const retomada = useRef<string | null>(null)
  const retomarMs = useRef<number | null>(null)
  useEffect(() => {
    /** El espejo usa el reloj remoto. Limpiar permite tomar su posición al transferirlo aquí. */
    if (espejo) {
      retomada.current = null
      retomarMs.current = null
      return
    }
    if (!current) return
    if (retomada.current === current.id) return
    retomada.current = current.id
    retomarMs.current = positionMs > 0 ? positionMs : null
  }, [current, positionMs, espejo])

  // Con la URL cargada, arranca. Es el paso que encadena una canción con la
  // siguiente sin que nadie toque nada.
  useEffect(() => {
    if (!url || !wantPlay) return
    /*
     * En un Jam, los cambios de tema traen un instante de arranque un pelo en
     * el futuro (ver `jam_tocar`): todos reciben el evento, cargan, y arrancan
     * **en el instante** — no cada uno cuando se enteró. Fuera del Jam la
     * espera es cero y esto es el arranque de siempre. `jamRev` está en las
     * dependencias como pulso: cada mutación del Jam puede traer un instante
     * nuevo que reprogramar.
     */
    const espera = jamEsperaArranqueMs()
    if (espera <= 0) {
      const cueKey = `${current?.id}:${seleccionRevision}`
      const fromPlaylist = !!origin?.id && !manual && !upNext.length && !!current && !!candidata &&
        tracks.some(track => track.id === current.id) && tracks.some(track => track.id === candidata.id)
      const atBeginning = !enJam && !player.playing && player.currentTime <= 0.05 &&
        getPlaybackState().positionMs === 0 && cueZeroExpired.current !== cueKey
      const plan = puedeMezclar && candidata && current && atBeginning
        ? transitionPlan(playerTotalS(player, current)) : null
      if (atBeginning && ((fromPlaylist && !mixResolved) ||
        (plan && (plan.fromStartSeconds ?? Infinity) <= 0.001))) {
        if (cueZeroWait.current?.key !== cueKey) cueZeroWait.current = { key: cueKey, startedAt: performance.now() }
        const remaining = Math.max(0, CUE_ZERO_PREPARE_TIMEOUT_MS - (performance.now() - cueZeroWait.current.startedAt))
        const startNormally = () => {
          cueZeroExpired.current = cueKey
          const pendiente = crossfadeEnCurso.current
          if (pendiente && current && pendiente.fromId === current.id) {
            pendiente.cancel()
            crossfadeEnCurso.current = null
            crossfadeFallido.current = { fromId: pendiente.fromId, toId: pendiente.toId }
          }
          arrancar()
        }
        if (remaining <= 0) { startNormally(); return }
        cueZeroStartTimer.current = setTimeout(startNormally, remaining)
        return () => {
          if (cueZeroStartTimer.current) clearTimeout(cueZeroStartTimer.current)
          cueZeroStartTimer.current = null
        }
      }
      arrancar()
      return
    }
    const espero = setTimeout(arrancar, espera)
    return () => clearTimeout(espero)
  }, [url, wantPlay, player, current, jamRev, origin?.id, mixResolved, puedeMezclar,
    candidata, manual, upNext, tracks, transitionPlan, seleccionRevision, enJam, arrancar])

  /**
   * Los eventos nativos mantienen progreso y fin sin depender del reloj visual.
   * iOS distingue pausas externas de carga, buffering y relevo entre canciones.
   * Web recibe los controles externos mediante mediaSession en lockScreen.
   */
  const soundingBefore = useRef(false)
  const presupuesto = useRef<PresupuestoRecuperacion>({ intentos: 0 })
  useEffect(() => { presupuesto.current = { intentos: 0, posicionMs: getPlaybackState().positionMs } }, [current?.id, wantPlay, mudo])
  useEffect(() => {
    /**
     * Reiniciar al cambiar de player: una pausa inicial no hereda el estado
     * sonando del asset anterior ni cancela la intención de reproducción.
     */
    soundingBefore.current = false
    const mismaPista = () => {
      const actual = getPlaybackState()
      return lease.active && (actual.manual ?? actual.tracks[actual.index])?.id === current?.id
    }
    const sigue = () => mismaPista() && !mudo && !!url && getPlaybackState().wantPlay
    const vigilancia = crearVigilanteAudio({
      presupuesto: presupuesto.current,
      sigue,
      incidencia: evento => { void registrarIncidenciaAudio({ ...evento, enSegundoPlano: AppState.currentState !== 'active' }) },
      agotado: () => reportError('No se pudo continuar el audio. Revisá la conexión y tocá reproducir para reintentar. El detalle quedó en Configuración → Diagnóstico de audio.'),
      recargar: async (posicion, signal) => {
        const trackId = current?.id
        const audioPath = current?.audioPath
        if (!trackId) throw new Error('No se pudo recuperar la fuente de audio')
        const local = rutaLocal(audioPath ?? '', current?.videoId)
        let nueva: string
        if (local) nueva = local
        else {
          if (!audioPath) throw new Error('No se pudo recuperar la fuente de audio')
          nueva = await esperarAperturaAudio(() => signedUrl(audioPath), signal)
        }
        if (!sigue() || signal.aborted) return
        // Reabrir el mismo tema conservando su último segundo, sin avanzar la cola.
        const objetivoJam = enJam ? jamPosicionObjetivoMs() : null
        retomarMs.current = objetivoJam ?? posicion
        soundingBefore.current = false
        if (nueva === url) {
          crossfadeEnCurso.current?.cancel()
          crossfadeEnCurso.current = null
          player.replace({ uri: nueva })
          player.play()
        } else {
          setFuenteRelevo(null)
          remember(trackId, nueva)
          if (fuenteLocal && nueva !== fuenteLocal) setReaperturaRevision(revision => revision + 1)
        }
      },
    })
    const sub = player.addListener('playbackStatusUpdate', (status) => {
      if (!mismaPista() || mudo || esEscuchaEspejo()) return
      reportarActividadEscucha(!mudo && status.playing && status.isLoaded && !status.isBuffering && !status.error)
      // El parche distingue una pausa explícita de un fallo que también deja
      // AVPlayer en paused. Cancela la red pendiente antes de cualquier retry.
      if ((status as typeof status & { didJustPause?: boolean }).didJustPause) {
        vigilancia.cancelar()
        soundingBefore.current = false
        if (!mudo && getPlaybackState().wantPlay) pausaExterna()
        return
      }
      setFuenteEnUso(url)
      const salto = saltoEnVuelo.current
      if (salto && (Math.abs(status.currentTime - salto.objetivoS) <= 0.75 || performance.now() - salto.pedidoEn >= 1200)) saltoEnVuelo.current = null
      const buscando = saltoEnVuelo.current !== null || retomarMs.current !== null
      escuchado.current.ms += medidorEscucha.medir(status.currentTime * 1000, performance.now(), status.playing && !status.isBuffering, buscando)
      // El deck saliente se pausa al completar un Mix, incluso antes del final
      // del archivo. Su evento puede llegar a este listener antes que al del
      // adaptador que promueve el entrante: no cancelar la intención de play
      // ni recuperar una fuente que ya terminó su parte de la transición.
      if ((status as typeof status & { didJustCrossfade?: boolean }).didJustCrossfade) {
        vigilancia.cancelar()
        soundingBefore.current = false
        return
      }
      // En background el progreso proviene sólo de eventos nativos de baja frecuencia.
      if (AppState.currentState !== 'active' && !status.error && !buscando && Number.isFinite(status.currentTime) && status.isLoaded) {
        reportProgress(status.currentTime * 1000, status.duration * 1000)
      }
      if (vigilancia.recibir(retomarMs.current !== null ? { ...status, currentTime: retomarMs.current / 1000 } : status)) { soundingBefore.current = false; reportCargada(false); return }
      reportCargada(status.isLoaded && !status.error)
      if (status.playing && status.isLoaded && !status.error) reportRecuperada()
      if (status.didJustFinish) {
        soundingBefore.current = false
        finish()
        return
      }

      /**
       * Retomar sólo con isLoaded: AVPlayer ignora seeks sin asset.
       * Consumir el objetivo una vez evita fijar el reloj al segundo guardado.
       */
      if (status.isLoaded && retomarMs.current != null) {
        const ms = retomarMs.current
        retomarMs.current = null
        saltar(player, ms / 1000)
      }
      /*
       * Solo iOS, y no «todo lo que no sea web», porque esto depende de que
       * `timeControlStatus` distinga **en pausa** de **esperando el buffer**:
       * sin esa diferencia, un bache de red se leería como una pausa. iOS manda
       * los tres estados de `AVPlayer`; Android solo dice «playing» o «paused»,
       * así que ahí habría que resolverlo de otra manera antes de prenderlo.
       */
      if (Platform.OS !== 'ios') return

      /**
       * Las interrupciones de un Jam son locales: nunca envían pause al grupo.
       * Al reanudar, el dispositivo vuelve al reloj compartido.
       */
      const nowPlaying = status.timeControlStatus === 'playing'
      const paused = status.timeControlStatus === 'paused'
      // AVPlayer también pasa por paused al llegar al final, antes de emitir
      // didJustFinish/handoff. Ese orden no representa una pausa del usuario.
      const relevoPendiente = (status as typeof status & { isHandoffPending?: boolean }).isHandoffPending === true
      const finNatural = Number.isFinite(status.duration) && status.duration > 0 &&
        status.currentTime >= status.duration - END_EPSILON_S
      if (soundingBefore.current && paused && !relevoPendiente && !finNatural) pausaExterna()
      else if (!soundingBefore.current && nowPlaying) reanudacionExterna()
      soundingBefore.current = nowPlaying
    })
    return () => { vigilancia.cancelar(); sub.remove() }
  }, [player, lease, finish, current?.id, current?.audioPath, current?.videoId, url, fuenteLocal, mudo, remember, enJam, wantPlay, medidorEscucha])

  useEffect(() => {
    if (!wantPlay) player.pause()
  }, [wantPlay, player])

  /**
   * El invitado corrige deriva fina y saltos; el host sólo saltos grandes
   * porque es la referencia. El arranque espera el instante compartido
   * y un margen para medir audio que ya esté sonando.
   */
  useEffect(() => {
    if (!enJam || silencioso || !current || !url) return
    let rateHasta: ReturnType<typeof setTimeout> | null = null

    const aVelocidadNormal = () => {
      try {
        player.setPlaybackRate(1)
      } catch {
        // La implementación web puede no tenerlo; sin corrección fina, el
        // próximo control salta si la deriva crece.
      }
    }

    const corregir = (deEvento: boolean) => {
      if (!jamSuena()) {
        aVelocidadNormal()
        return
      }
      const objetivo = jamPosicionObjetivoMs()
      const t = player.currentTime
      if (objetivo === null || !Number.isFinite(t)) return
      /*
       * Si el Jam suena y el reproductor quedó pausado por afuera —el botón
       * de los auriculares, la pantalla bloqueada— un invitado vuelve al
       * ritmo: su pausa física no pausó el Jam, y quedarse callado mientras
       * la barra avanza es el peor de los estados. El host no: su pausa
       * física ya viajó como intent por el detector de pausas externas.
       */
      if (sincronizo && wantPlay && !player.playing) player.play()

      const delta = objetivo - t * 1000
      if (Math.abs(delta) > JAM_SALTO_MS) {
        /*
         * Al host solo lo mueve **un evento**: el seek que pidió otro.
         *
         * La escalera de arriba lo dice — «su reproductor ES la referencia» —
         * pero la revisión periódica lo saltaba igual: la derivada corre sobre
         * el reloj estimado del servidor, y apenas su deriva pasaba los 400ms
         * esto le pegaba un salto al host **cada 7 segundos**. Un salto hacia
         * atrás vuelve a tocar el último medio segundo: se oía como si la
         * canción estuviera doble, con eco — sin que nadie hubiera tocado nada.
         */
        if (!sincronizo && !deEvento) return
        aVelocidadNormal()
        // Tolerancia cero: el salto cae en el milisegundo pedido, no en el
        // keyframe más cercano. Y el rechazo se traga como en `lib/seek`.
        player.seekTo(objetivo / 1000, 0, 0).catch(() => undefined)
        return
      }
      if (!sincronizo) return
      if (Math.abs(delta) < JAM_DERIVA_MIN_MS) {
        aVelocidadNormal()
        return
      }
      try {
        player.setPlaybackRate(delta > 0 ? 1.04 : 0.96, 'high')
        if (rateHasta) clearTimeout(rateHasta)
        // Lo que tarda en absorber la deriva al 4%, con un tope prudente.
        rateHasta = setTimeout(aVelocidadNormal, Math.min(3000, Math.abs(delta) / 0.04))
      } catch {
        // Sin velocidad variable no hay corrección fina; el umbral de salto
        // sigue cuidando que la deriva no se vaya de las manos.
      }
    }

    /* La puntual responde a un evento del Jam —puede traer el seek de otro—;
       la periódica solo persigue deriva, y al host no lo toca. */
    const puntual = setTimeout(() => corregir(true), jamEsperaArranqueMs() + 150)
    const periodica = setInterval(() => corregir(false), JAM_REVISA_CADA_MS)
    return () => {
      clearTimeout(puntual)
      clearInterval(periodica)
      if (rateHasta) clearTimeout(rateHasta)
      aVelocidadNormal()
    }
  }, [enJam, silencioso, sincronizo, current, url, wantPlay, player, jamRev])

  // Al volver al frente, refrescar desde el player sin esperar el próximo
  // evento nativo de progreso; durante el bloqueo esos eventos son menos frecuentes.
  useEffect(() => {
    if (!lease.active || mudo || esEscuchaEspejo() || !appActiva || !current || !url || retomarMs.current !== null || saltoEnVuelo.current !== null) return
    const t = player.currentTime
    if (Number.isFinite(t)) reportProgress(t * 1000, playerTotalS(player, current) * 1000)
    /* Si mientras estuvo atrás una interrupción pausó este aparato dentro de
       un Jam, volver al frente es el momento de reengancharse: el Jam siguió
       sin nosotros y hay que sumarse donde va, no donde quedamos. */
    reanudarTrasInterrupcion()
  }, [appActiva, current, player, lease, mudo, url])

  useEffect(() => {
    if (mudo || !playing || !current || !appActiva) {
      if (raf.current) cancelAnimationFrame(raf.current)
      raf.current = null
      return
    }

    const tick = () => {
      const estado = getPlaybackState()
      if (!lease.active || mudo || esEscuchaEspejo() || (estado.manual ?? estado.tracks[estado.index])?.id !== current.id) return
      const t = player.currentTime
      const total = playerTotalS(player, current)

      // No publicar la posición anterior mientras el seek todavía está en vuelo.
      const salto = saltoEnVuelo.current
      if (salto) {
        const aterrizo = Number.isFinite(t) && Math.abs(t - salto.objetivoS) <= 0.75
        if (!aterrizo && performance.now() - salto.pedidoEn < 1200) {
          raf.current = requestAnimationFrame(tick)
          return
        }
        saltoEnVuelo.current = null
      }

      if (Number.isFinite(t)) {
        // La posición fina anima la barra en cada cuadro; React recibe como
        // máximo diez actualizaciones por segundo. Este bucle sólo corre visible.
        reportarPosicionFina(t * 1000)

        const ahoraMs = performance.now()
        if (ahoraMs - ultimoAviso.current >= AVISO_CADA_MS) {
          ultimoAviso.current = ahoraMs
          reportProgress(t * 1000, total * 1000)
        }

      }
      raf.current = requestAnimationFrame(tick)
    }

    raf.current = requestAnimationFrame(tick)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [playing, current, player, lease, appActiva, mudo])
  /* La barra dibuja el botón según esto: sin la URL firmada todavía no suena
     nada, por más que la intención de quien escucha sea reproducir. El control
     remoto de un Jam cuenta como cargado con solo tener canción: acá no se
     carga nada — el audio está sonando en el dispositivo del host. */
  useEffect(() => {
    if (!url || mudo) reportCargada(mudo && current !== null)
  }, [url, mudo, current])

  return null
}

/**
 * El largo de la canción en segundos, con lo mejor que se sepa.
 *
 * Prefiere lo que midió el reproductor sobre lo que vino guardado con la
 * canción: lo segundo sale de YouTube y a veces viene corto o en cero.
 */
function playerTotalS(
  player: { duration: number },
  track: { durationMs: number } | null,
): number {
  if (Number.isFinite(player.duration) && player.duration > 0) return player.duration
  return (track?.durationMs ?? 0) / 1000
}
