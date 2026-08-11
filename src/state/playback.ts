import AsyncStorage from '@react-native-async-storage/async-storage'
import type { PlaylistTrack } from '../services/playlists'
import { createStore, useStore } from './store'

/**
 * Lo que suena, para toda la app.
 *
 * Vive fuera de las pantallas a propósito. Antes la cola era un hook dentro de
 * `playlists/[id]`, así que salir de la lista desmontaba el reproductor y la
 * música se cortaba en seco — justo lo que uno no espera al ir a leer un
 * mensaje mientras escucha. Acá el estado sobrevive a la navegación y la barra
 * de abajo, montada una sola vez en el layout, es la única que toca el audio.
 *
 * La otra mitad del sonido de la app son los fragmentos del chat
 * (`useSnippetPlayer`), que siguen teniendo su propio reproductor porque hacen
 * algo distinto: una ventana de un tema, sin encadenar. Lo único que comparten
 * es que **no pueden sonar los dos a la vez**, y de eso se ocupan
 * `registerSnippetStopper` y `pauseForSnippet`.
 */

/** De dónde salió la cola. Sirve para marcar la lista que está sonando. */
export type PlaybackOrigin = { id: string; name: string }

type PlaybackState = {
  tracks: PlaylistTrack[]
  /**
   * Canciones puestas a mano para que suenen antes de seguir con la lista.
   *
   * Van aparte de `tracks` y no intercaladas: la cola manual no pertenece a la
   * lista, y mezclarlas haría que releer la lista —al agregar o quitar una
   * canción— se llevara puesto lo que alguien encoló.
   */
  upNext: PlaylistTrack[]
  /** Lo que salió de la cola manual y está sonando ahora. Gana sobre `tracks`. */
  manual: PlaylistTrack | null
  /** De dónde salió la cola; null cuando es una canción suelta de la búsqueda. */
  origin: PlaybackOrigin | null
  /** Índice dentro de `tracks`; -1 cuando no hay nada cargado. */
  index: number
  /** Intención de quien escucha. Lo que suena de verdad depende del audio. */
  wantPlay: boolean
  positionMs: number
  durationMs: number
  /** 0..1, elegido por quien escucha. Se multiplica por la atenuación técnica. */
  volume: number
  /** Qué muestra el panel de la derecha mientras suena algo. */
  view: NowPlayingView
  error: string | null
  /**
   * Si el audio de la canción actual ya está firmado y cargado.
   *
   * Lo escribe el motor y lo lee la barra para saber qué ícono dibujar. Antes la
   * barra lo sabía sola —tenía la URL a mano— pero el motor y el dibujo dejaron
   * de ser el mismo componente, y `wantPlay` a secas no alcanza: es la
   * **intención** de quien escucha, así que si la firma falla el botón se
   * quedaría mostrando «pausar» para siempre sobre algo que nunca sonó.
   */
  cargada: boolean
}

/**
 * Las tres caras del panel de la derecha.
 *
 * `info` es la de siempre —carátula, tema, artista—; `disc` es el vinilo
 * girando y `lyrics` la letra sincronizada. Vive acá y no en la pantalla
 * porque quien las alterna es la barra de abajo, que está en el layout.
 */
export type NowPlayingView = 'info' | 'disc' | 'lyrics'

const EMPTY: PlaybackState = {
  tracks: [],
  upNext: [],
  manual: null,
  origin: null,
  index: -1,
  wantPlay: false,
  positionMs: 0,
  durationMs: 0,
  volume: 1,
  cargada: false,
  view: 'info',
  error: null,
}

/** Pasado este punto, "anterior" reinicia el tema en vez de volver al previo. */
const RESTART_MS = 3000

const store = createStore<PlaybackState>({ ...EMPTY })

/* ── Memoria de la cola ────────────────────────────────────────────────────
 *
 * Un reproductor no arranca en blanco: volvés y está lo que estabas
 * escuchando, donde lo dejaste. Sin esto, cualquier cosa que corte el proceso
 * —iOS reclamando memoria, un cierre desde el multitarea— borraba la cola
 * entera y la app se abría como si nunca la hubieras usado.
 *
 * Se guarda la cola, dónde estaba y en qué segundo. **No** se guarda que
 * estaba sonando: volver a abrir la app no puede empezar a hacer ruido solo.
 */
const CLAVE = 'playback:v1'
/** La posición cambia sesenta veces por segundo; escribir tan seguido sería
 *  castigar el disco para nada. Cada cinco segundos alcanza de sobra. */
const GUARDAR_CADA_MS = 5000
let ultimoGuardado = 0

type Guardado = {
  tracks: PlaylistTrack[]
  index: number
  origin: PlaybackOrigin | null
  positionMs: number
}

function guardar(force = false) {
  const now = Date.now()
  if (!force && now - ultimoGuardado < GUARDAR_CADA_MS) return
  ultimoGuardado = now
  const { tracks, index, origin, positionMs } = store.get()
  const payload: Guardado = { tracks, index, origin, positionMs }
  void AsyncStorage.setItem(CLAVE, JSON.stringify(payload)).catch(() => {
    // Sin memoria de la cola, pero la app funciona igual.
  })
}

/**
 * Devuelve la cola de la sesión anterior, en pausa y en el segundo justo.
 *
 * Lo llama el layout al arrancar. Si ya hay algo cargado no toca nada: puede
 * haber ganado de mano quien abrió la app tocando una canción.
 */
export async function restorePlayback() {
  try {
    const crudo = await AsyncStorage.getItem(CLAVE)
    if (!crudo) return
    const { tracks, index, origin, positionMs } = JSON.parse(crudo) as Guardado
    const track = tracks?.[index]
    if (!track) return
    if (store.get().index >= 0 || store.get().manual) return
    store.set({
      tracks,
      index,
      origin,
      positionMs,
      durationMs: track.durationMs,
      wantPlay: false,
    })
  } catch {
    // Lo guardado no se entiende: se ignora y se arranca limpio.
  }
}

/*
 * El audio lo maneja la barra, que es quien tiene el reproductor. Un salto no
 * se puede expresar como estado —pedir dos veces el mismo segundo tiene que
 * saltar dos veces— así que se registra una manija imperativa mínima.
 */
type Engine = { seekTo: (ms: number) => void }
let engine: Engine | null = null

export function registerEngine(next: Engine | null) {
  engine = next
}

/** El motor avisa si el audio de la canción actual ya está listo para sonar. */
export function reportCargada(cargada: boolean) {
  if (store.get().cargada !== cargada) store.set({ cargada })
}

/*
 * Cómo frenar los fragmentos que haya sonando.
 *
 * Es un conjunto y no uno solo porque puede haber varias pantallas montadas a
 * la vez —el chat sigue vivo debajo del mensaje abierto en modal—, y con un
 * único lugar la última en montarse le borraba el registro a la anterior.
 */
const snippetStoppers = new Set<() => void>()

/** El reproductor de fragmentos deja acá cómo frenarlo. Devuelve cómo darse de baja. */
export function registerSnippetStopper(stop: () => void) {
  snippetStoppers.add(stop)
  return () => {
    snippetStoppers.delete(stop)
  }
}

function stopSnippets() {
  snippetStoppers.forEach((stop) => stop())
}

/*
 * Cómo abrir la lista que suena.
 *
 * La barra vive en el layout y la pantalla principal es la que sabe mostrar una
 * lista; sin este puente, «ver la lista» desde la barra tendría que navegar y
 * volver a montar todo. Lo registra la pantalla al montarse.
 */
let opener: ((playlistId: string) => void) | null = null

export function registerPlaylistOpener(open: ((playlistId: string) => void) | null) {
  opener = open
}

export function canOpenPlaylist() {
  return opener !== null && store.get().origin !== null
}

export function openSoundingPlaylist() {
  const { origin } = store.get()
  if (origin) opener?.(origin.id)
}

/**
 * Arranca una lista desde una canción. Frena el fragmento que hubiera sonando.
 *
 * `origin` en null es una canción suelta —de la búsqueda, sin lista detrás—; en
 * ese caso el menú de la barra no ofrece «ver la lista», porque no hay ninguna.
 */
export function playQueue(
  tracks: PlaylistTrack[],
  index: number,
  origin: PlaybackOrigin | null,
) {
  const track = tracks[index]
  if (!track) return
  stopSnippets()
  store.set({
    tracks,
    upNext: [],
    manual: null,
    origin,
    index,
    wantPlay: true,
    positionMs: 0,
    durationMs: track.durationMs,
    error: null,
  })
  guardar(true)
}

/** Suma al final de la cola manual: suena cuando termine lo de ahora. */
export function enqueue(track: PlaylistTrack) {
  const state = store.get()
  // Sin nada cargado, encolar es simplemente ponerla.
  if (state.index < 0 && !state.manual) {
    playQueue([track], 0, null)
    return
  }
  store.set({ upNext: [...state.upNext, track] })
}

/** Salta a una canción de la cola actual; si ya es la que suena, pausa o sigue. */
export function playAt(index: number) {
  const state = store.get()
  const track = state.tracks[index]
  if (!track) return
  if (index === state.index && !state.manual) {
    togglePlayback()
    return
  }
  stopSnippets()
  store.set({
    manual: null,
    index,
    wantPlay: true,
    positionMs: 0,
    durationMs: track.durationMs,
    error: null,
  })
  guardar(true)
}

export function resumePlayback() {
  if (store.get().index < 0) return
  stopSnippets()
  store.set({ wantPlay: true })
}

export function pausePlayback() {
  store.set({ wantPlay: false })
}

export function togglePlayback() {
  if (store.get().wantPlay) pausePlayback()
  else resumePlayback()
}

export function playNext() {
  const state = store.get()
  if (state.index + 1 < state.tracks.length) playAt(state.index + 1)
}

export function playPrevious() {
  const state = store.get()
  /*
   * Pasados unos segundos, "anterior" reinicia la canción en vez de volver a
   * la de antes. Es lo que hace cualquier reproductor y lo que uno espera
   * cuando quiere volver a escuchar algo que recién empezó.
   */
  if (state.positionMs > RESTART_MS || state.index <= 0) {
    engine?.seekTo(0)
    store.set({ positionMs: 0 })
    return
  }
  playAt(state.index - 1)
}

export function seekFraction(fraction: number) {
  const state = store.get()
  // Una fracción no finita llega más seguido de lo que parece: sale de dividir
  // por el ancho de la barra, y ese ancho es 0 en el primer cuadro.
  if (!Number.isFinite(fraction) || state.durationMs <= 0) return
  seekToMs(Math.max(0, Math.min(1, fraction)) * state.durationMs)
}

/** Salto a un punto concreto. Lo usa la barra del sistema, que manda segundos. */
export function seekToMs(positionMs: number) {
  const state = store.get()
  if (!Number.isFinite(positionMs) || state.durationMs <= 0) return
  const to = Math.max(0, Math.min(state.durationMs, positionMs))
  engine?.seekTo(to)
  store.set({ positionMs: to })
}

/**
 * Se terminó la canción: pasa a la siguiente, o para si era la última.
 *
 * Lo llama la barra, que es la única que puede saber cuándo llegó al final.
 */
export function advance() {
  const state = store.get()

  // Lo encolado a mano va primero: es lo que alguien pidió expresamente.
  const [encolada, ...resto] = state.upNext
  if (encolada) {
    store.set({ manual: encolada, upNext: resto, positionMs: 0, durationMs: encolada.durationMs })
    return
  }

  /*
   * Al terminar una encolada se sigue por la lista donde había quedado: `index`
   * no se movió mientras sonaba la manual, así que la que sigue es la de
   * siempre. Por eso el salto es el mismo en los dos casos.
   */
  const next = state.index + 1
  const track = state.tracks[next]
  if (track) {
    store.set({ manual: null, index: next, positionMs: 0, durationMs: track.durationMs })
  } else {
    store.set({ manual: null, wantPlay: false, positionMs: state.durationMs })
  }
}

export function reportProgress(positionMs: number, durationMs: number) {
  store.set({ positionMs, durationMs })
  guardar()
}

export function reportError(message: string) {
  store.set({ error: message, wantPlay: false })
}

export function stopPlayback() {
  // El volumen y la vista elegida sobreviven: son preferencias de quien
  // escucha, no estado de la canción que se cerró.
  const { volume, view } = store.get()
  store.set({ ...EMPTY, volume, view })
}

export function setVolume(volume: number) {
  if (!Number.isFinite(volume)) return
  store.set({ volume: Math.max(0, Math.min(1, volume)) })
}

/** Volver a tocar la vista que ya está puesta la devuelve a la ficha. */
export function toggleView(view: Exclude<NowPlayingView, 'info'>) {
  store.set({ view: store.get().view === view ? 'info' : view })
}

/** Frena la cola porque va a sonar un fragmento del chat. */
export function pauseForSnippet() {
  if (store.get().wantPlay) pausePlayback()
}

/** Nombre de la lista que está sonando; para la pantalla bloqueada. */
export const usePlaybackOriginName = () => useStore(store, (state) => state.origin?.name ?? '')

/**
 * Actualiza la cola cuando cambió la lista que está sonando.
 *
 * Agregar o quitar una canción desde la pantalla no tiene por qué cortar la
 * música; solo si lo que se borró es justamente lo que suena. El índice se
 * rebasea por id, no por posición, porque quitar una canción de más arriba
 * correría todas las de abajo.
 */
export function syncQueue(originId: string, tracks: PlaylistTrack[]) {
  const state = store.get()
  if (state.origin?.id !== originId) return

  const current = state.index >= 0 ? state.tracks[state.index] : null
  if (!current) {
    store.set({ tracks })
    return
  }

  const index = tracks.findIndex((track) => track.id === current.id)
  if (index === -1) {
    stopPlayback()
    return
  }
  store.set({ tracks, index })
}

/**
 * La lista de la que salió la cola dejó de existir.
 *
 * La música **no se corta**: los audios viven en Storage y siguen ahí, así que
 * borrar la lista no tiene por qué frenar lo que estabas escuchando —ni lo que
 * venía después—. Lo único que se pierde es de dónde salió, y con eso la barra
 * deja de ofrecer «ver la lista», que llevaría a una pantalla que ya no está.
 */
export function detachOrigin(originId: string) {
  if (store.get().origin?.id === originId) store.set({ origin: null })
}

/** Lo que suena: la encolada a mano si hay, o la de la lista. */
function currentOf(state: PlaybackState): PlaylistTrack | null {
  if (state.manual) return state.manual
  return state.index >= 0 ? (state.tracks[state.index] ?? null) : null
}

/** Estado completo. Solo para la barra, que necesita hasta la posición. */
export const usePlaybackState = () => useStore(store, (state) => state)

/*
 * Las pantallas se suscriben por pedacito y no al estado entero: la posición
 * cambia sesenta veces por segundo, y una lista que la mirara se redibujaría
 * entera en cada cuadro.
 */
export const usePlaybackTrack = () => useStore(store, currentOf)
export const useVolume = () => useStore(store, (state) => state.volume)
export const useNowPlayingView = () => useStore(store, (state) => state.view)
export const useManualPlaying = () => useStore(store, (state) => state.manual !== null)
export const useUpNextCount = () => useStore(store, (state) => state.upNext.length)
export const usePlaybackIndex = () => useStore(store, (state) => state.index)
export const usePlaybackOriginId = () => useStore(store, (state) => state.origin?.id ?? null)
export const useWantPlay = () => useStore(store, (state) => state.wantPlay)
