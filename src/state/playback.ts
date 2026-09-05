import AsyncStorage from '@react-native-async-storage/async-storage'
import { makeMutable } from 'react-native-reanimated'
import type { PlaylistTrack } from '../services/playlists'
import { createStore, useStore } from './store'
import { leerAjustes } from './ajustes'
import { avisar } from './aviso'

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
  /**
   * El orden aleatorio, **barajado una vez**.
   *
   * Guarda los índices de `tracks` en el orden en que van a sonar; `null` cuando
   * el aleatorio está apagado. No es «elegir una al azar en cada salto»: eso
   * repite temas y saltea otros, y a los diez minutos ya te hizo escuchar dos
   * veces la misma mientras nunca tocó la mitad de la lista. Es lo que hace
   * Spotify desde que arreglaron su propio aleatorio por la misma queja.
   *
   * Se baraja al prenderlo y se recorre entero. La que está sonando queda
   * primera para que prender el aleatorio no corte lo que estás escuchando.
   */
  shuffle: number[] | null
  /**
   * Qué pasa al llegar al final.
   *
   * `no` se detiene —o sigue con recomendaciones, si están prendidas—; `lista`
   * vuelve a empezar por el principio; `una` repite el tema actual para siempre.
   *
   * Las tres son excluyentes y se rotan en ese orden, que es el de todos los
   * reproductores desde el primer iPod: apagado → la lista → esta sola.
   */
  repetir: 'no' | 'lista' | 'una'
  /**
   * Cuándo se apaga sola la música, en milisegundos desde época. `null` sin
   * temporizador puesto. Ver `programarApagado`.
   */
  dormirA: number | null
  /**
   * Cuántos minutos se pidieron, para poder marcar cuál está puesto.
   *
   * Se guarda además de `dormirA` porque deducirlo del instante restante obliga
   * a leer el reloj mientras se dibuja —impuro, y encima drift: a los treinta
   * segundos ya no coincide con ningún preset—.
   */
  dormirMin: number | null
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
 * Las caras del panel de la derecha.
 *
 * `info` es la de siempre —carátula, tema, artista—; `disc` es el vinilo
 * girando, `lyrics` la letra sincronizada, `jam` la escucha compartida y
 * `cola` lo que viene después. En el teléfono el Jam y la cola siguen siendo
 * sus pantallas modales; estas vistas son la forma de escritorio, al lado de
 * la lista, como el panel de Spotify — un drawer es un gesto de teléfono, no
 * de una ventana grande. Vive acá y no en la pantalla porque quien las
 * alterna es la barra de abajo, que está en el layout.
 */
export type NowPlayingView = 'info' | 'disc' | 'lyrics' | 'jam' | 'cola'

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
  shuffle: null,
  repetir: 'no',
  dormirA: null,
  dormirMin: null,
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
  // La cola de un Jam no es tuya: persistirla dejaría la de otro apareciendo
  // en tu próxima sesión. Lo guardado antes de entrar queda intacto. El
  // espejo tampoco persiste: su verdad vive en el servidor y se repide al
  // abrir — guardar una foto vieja de eso es justo el bug que vinimos a matar.
  if (enJam() || enEspejo()) return
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
    // Un Jam reconectado gana: lo guardado es de la sesión pasada y él es ahora.
    // Y un espejo también: la escucha en el servidor es más nueva que el disco.
    if (enJam() || enEspejo()) return
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

/*
 * Cómo conseguir con qué seguir cuando se termina la lista.
 *
 * Es el mismo puente que `registerEngine`, y por la misma razón: el relleno sale
 * de `services/recomendaciones`, que importa el servicio de música, que importaría
 * este archivo — un ciclo. Lo registra `MotorAudio`, que ya conoce a los dos.
 *
 * También es asíncrono, y `advance` no puede serlo: la cola tiene que decidir en
 * el acto qué suena ahora. Así que pide y sigue; cuando llega, se encola.
 */
let relleno: (() => Promise<PlaylistTrack[]>) | null = null

export function registerRelleno(fn: (() => Promise<PlaylistTrack[]>) | null) {
  relleno = fn
}

/*
 * El Jam, cuando hay uno. Es el sexto puente de registro, y existe por lo
 * mismo que los otros cinco: `state/jam` importa este archivo para volcarle la
 * cola compartida, así que este no puede importarlo a él.
 *
 * Estando en un Jam, la cola deja de ser tuya: es de todos y la verdad vive en
 * el servidor. Cada acción de acá le pregunta primero al puente. `transporte`
 * devuelve **si el Jam se quedó con la acción**: true es «no toques nada
 * local» — o porque el permiso no alcanza, o porque la respuesta va a llegar
 * por el canal—; false es «seguí, y yo aviso al resto» (el camino optimista:
 * tu botón responde ya, el evento confirma después).
 */
export type JamBridge = {
  activo: () => boolean
  esHost: () => boolean
  /** Si el Jam está sonando según el servidor, más allá de este aparato. */
  suena: () => boolean
  /** Dónde va la canción AHORA según el reloj compartido; null sin Jam. */
  posicionObjetivoMs: () => number | null
  transporte: (
    accion: 'play' | 'pause' | 'seek' | 'siguiente' | 'anterior' | 'tocar',
    ms?: number,
    itemId?: string,
  ) => boolean
  encolar: (track: PlaylistTrack) => void
  /** Tocar esta canción YA, para todos: se intercala después de la actual. */
  tocarAhora: (track: PlaylistTrack) => void
  /** Poner una lista entera YA: se intercala desde `desde` y el Jam salta ahí. */
  tocarCola: (tracks: PlaylistTrack[], desde: number) => void
  /** Al host se le terminó la canción: que el servidor pase a la siguiente. */
  publicarAvance: () => void
}

let jam: JamBridge | null = null

export function registerJam(next: JamBridge | null) {
  jam = next
}

function enJam(): boolean {
  return jam?.activo() ?? false
}

/*
 * La escucha de la cuenta en otros dispositivos: el séptimo puente, por la
 * misma razón que el del Jam — `state/escucha` importa este archivo para
 * volcarle el espejo, así que este no puede importarlo a él.
 *
 * Cuando la música está sonando en **otro aparato de la misma cuenta**, este
 * se vuelve un espejo: dibuja lo que suena allá pero no reproduce nada, y
 * tocar el transporte acá es una decisión sobre esa escucha. `retener`
 * devuelve si la acción quedó en manos del traspaso: true es «no toques nada,
 * se está preguntando» — el modal ofrece traerla acá o dejarla donde está—;
 * false es «seguí», que puede significar que no hay conflicto o que la
 * escucha se tomó en silencio (nadie estaba sonando allá).
 */
export type EscuchaBridge = {
  /** true = la acción quedó retenida: suena en otro dispositivo y se preguntó. */
  retener: (continuar: () => void) => boolean
  /** Este aparato refleja la escucha de otro: no suena, dibuja. */
  espejo: () => boolean
  /** Cómo se llama el aparato donde suena, para los avisos. */
  nombre: () => string
}

let escucha: EscuchaBridge | null = null

export function registerEscucha(next: EscuchaBridge | null) {
  escucha = next
}

function enEspejo(): boolean {
  return escucha?.espejo() ?? false
}

/** Para quien no puede importar `state/escucha` sin ciclo (ver `state/jam`). */
export function enEscuchaEspejo(): boolean {
  return enEspejo()
}

/**
 * Lo que sonaba justo antes de cada canción manual, en orden, para poder volver.
 *
 * Una canción manual —encolada a mano o venida del relleno de recomendaciones—
 * no vive en `tracks`, así que `anteriorIndice` no la ve: al terminarse la
 * lista y arrancar las recomendadas, «anterior» no tenía a dónde ir y solo
 * reiniciaba la que sonaba. Acá se apila lo que estaba sonando cada vez que
 * entra una manual; retroceder desapila, y la que estaba sonando vuelve al
 * frente de `upNext` para que «siguiente» la retome — la ida y la vuelta
 * recorren el mismo camino.
 *
 * Se vacía al arrancar una cola nueva o al pararla: es historia de ESTA cola.
 */
let historial: PlaylistTrack[] = []
const HISTORIAL_MAX = 100

function recordarEnHistorial(track: PlaylistTrack | null) {
  if (!track) return
  historial.push(track)
  if (historial.length > HISTORIAL_MAX) historial.shift()
}

/**
 * Los videos que ya pasaron por esta cola, para vetarlos del relleno.
 *
 * `escuchadas_recientes` solo conoce lo que sonó más de 30 segundos, así que
 * una recomendada salteada a los cinco no quedaba anotada en ningún lado y la
 * tanda siguiente podía volver a traerla: saltear era pedirla de nuevo. El
 * historial de esta cola es la memoria que faltaba. Se lee en el momento del
 * pedido —no al registrar el relleno— para que llegue fresco.
 */
export function videoIdsRecorridos(): string[] {
  return historial.map((t) => t.videoId)
}

/**
 * La generación de la cola: sube cada vez que la cola deja de ser LA misma.
 *
 * Existe por una carrera concreta: una tanda de recomendaciones pedida para la
 * cola que estaba sonando puede llegar **después** de que alguien puso otra
 * cosa —un álbum, otra lista, el volcado de un Jam— y `pedirRelleno` la
 * apendeaba igual: aparecía una radio ajena en el medio del disco recién
 * puesto, y el primer «siguiente» saltaba ahí. La tanda viaja con el número de
 * la generación que la pidió; si al llegar la cola ya es otra, se descarta.
 */
let generacionCola = 0

/** Si ya hay una tanda en camino, para no pedir dos veces al mismo final. */
let pidiendo = false
/**
 * La cola llegó al final **mientras la tanda venía en camino**: al llegar, hay
 * que avanzar. Sin esta marca había una carrera boba: si el pedido ya estaba en
 * vuelo cuando terminó la última canción, `advance` no podía volver a pedir
 * —`pidiendo` lo trababa— y caía al final de la función, que pausa. La tanda
 * llegaba dos segundos después y se quedaba muda en `upNext`.
 */
let avanzarAlLlegar = false

/**
 * Pide una tanda y la encola cuando llega.
 *
 * Es un solo camino para los dos momentos en que se pide: **antes** de que la
 * última canción termine (ver `rellenarSiFalta`) y, si no llegó a pasar, al
 * terminarse la lista desde `advance`. Si para cuando llega la cola ya está
 * parada en el final, avanza; si la última todavía suena, la tanda queda
 * esperando en `upNext` y el cambio de tema es el de siempre, sin hueco.
 */
function pedirRelleno() {
  if (!relleno || pidiendo) return
  pidiendo = true
  const generacion = generacionCola
  const alFinal = () => {
    const s = store.get()
    /* Si la canción va por la mitad, el pedido vino de apretar «siguiente» y
       no del final: sin recomendaciones no hay a dónde saltar, pero lo que
       sonaba sigue sonando — pausarlo sería castigar el botón. */
    if (s.durationMs - s.positionMs > 1500) return
    store.set({ manual: null, wantPlay: false, positionMs: s.durationMs })
  }
  void relleno()
    .then((tanda) => {
      /* La cola ya es otra: esta tanda era para la anterior. Ver
         `generacionCola` — apendearse acá metía radio ajena en el disco que
         acaban de poner. */
      if (generacion !== generacionCola) return
      if (tanda.length) {
        const ahora = store.get()
        store.set({ upNext: [...ahora.upNext, ...tanda] })
        if (avanzarAlLlegar) advance()
      } else if (avanzarAlLlegar) {
        // Sin recomendaciones no hay con qué seguir: se para como siempre.
        alFinal()
      }
    })
    .catch(() => {
      if (avanzarAlLlegar && generacion === generacionCola) alFinal()
    })
    .finally(() => {
      pidiendo = false
      avanzarAlLlegar = false
    })
}

/**
 * Cuántas pueden quedar esperando antes de pedir la próxima tanda.
 *
 * Con «pedir recién cuando no queda nada» —que era la regla anterior— saltear
 * rápido agotaba la tanda en segundos y los saltos siguientes caían al vacío
 * hasta que llegara la próxima: el botón parecía roto. Con dos de colchón, la
 * tanda nueva viaja mientras todavía hay con qué seguir salteando.
 */
const RELLENO_UMBRAL = 2

/**
 * Pide la próxima tanda **antes** de que haga falta.
 *
 * La llama el motor cuando la cola se acorta. Pedir recién al terminarse —que
 * era lo único que había— dejaba un silencio de varios segundos entre el final
 * y la primera recomendada, y en el teléfono ese silencio es fatal: sin audio
 * sonando, iOS puede suspender la app con la pantalla bloqueada y la música no
 * vuelve más. Con la tanda ya en `upNext` para cuando el tema termina, el
 * cambio es el encadenado normal de la cola.
 *
 * **Solo cuando la lista ya no tiene con qué seguir.** Lo que espera en
 * `upNext` suena ANTES que la lista (es el orden de `advance`), así que pedir
 * relleno con la lista a medias metería recomendadas adelante de las canciones
 * que faltan — justo el «me mezcla música que no pedí» que vinimos a matar.
 */
export function rellenarSiFalta() {
  const state = store.get()
  /* En un Jam la cola es de todos; rellenarla por tu cuenta la rompería. */
  if (enJam()) return
  if (!leerAjustes().autoplay) return
  /* Con repetir prendido la lista no tiene final: no hay nada que rellenar. */
  if (state.repetir !== 'no') return
  if (!state.wantPlay) return
  if (siguienteIndice(state) !== null) return
  if (state.upNext.length > RELLENO_UMBRAL) return
  pedirRelleno()
}

/** El motor avisa si el audio de la canción actual ya está listo para sonar. */
export function reportCargada(cargada: boolean) {
  if (store.get().cargada !== cargada) store.set({ cargada })
}

/**
 * El audio de una candidata llegó: se completa donde sea que esté.
 *
 * Las tandas de la radio entran a la cola **sin audio** (ver
 * `proximasRecomendadas`) para que encolar sea instantáneo; el motor resuelve
 * la que va a sonar y precarga la que sigue, y con lo resuelto pasa por acá.
 * Se busca por `videoId` en la lista, la cola manual y la que suena: para
 * cuando el audio llega, la canción pudo haberse movido de `upNext` a
 * `manual`.
 */
export function completarCancion(
  videoId: string,
  datos: { audioPath: string; artworkPath: string | null; durationMs: number },
) {
  const state = store.get()
  const completar = (t: PlaylistTrack): PlaylistTrack =>
    t.videoId === videoId && !t.audioPath
      ? {
          ...t,
          audioPath: datos.audioPath,
          artworkPath: datos.artworkPath ?? t.artworkPath,
          durationMs: datos.durationMs || t.durationMs,
        }
      : t
  const manual = state.manual ? completar(state.manual) : null
  const actual = manual ?? state.tracks.map(completar)[state.index]
  store.set({
    tracks: state.tracks.map(completar),
    upNext: state.upNext.map(completar),
    manual,
    /* Si la completada es la que suena, el largo de la barra ya puede ser el
       de verdad — el que vino con la búsqueda a veces es cero. */
    ...(actual?.videoId === videoId && datos.durationMs
      ? { durationMs: datos.durationMs }
      : {}),
  })
}

/**
 * Una candidata cuyo audio no se pudo traer se va de la cola.
 *
 * Solo las que siguen sin audio: dejarla sería un hueco en el que «siguiente»
 * tropieza cada vez que le toca. Lo llama el motor cuando la precarga falla.
 */
export function descartarSinAudio(videoId: string) {
  const { upNext } = store.get()
  const limpio = upNext.filter((t) => !(t.videoId === videoId && !t.audioPath))
  if (limpio.length !== upNext.length) store.set({ upNext: limpio })
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
 * Abre una lista cualquiera por su id, sin que tenga que estar sonando.
 *
 * Es el mismo puente, usado desde el otro lado: quien importa una lista quiere
 * terminar **viéndola**, y la ruta `/lista/<id>` no sirve para eso — esa es la
 * pantalla de una lista compartida por un enlace, que se presenta como «una
 * lista de fulano» y se rotula pública porque llegar ahí significa que alguien
 * la compartió. Para una lista propia recién creada, el lugar es la biblioteca.
 *
 * Devuelve si había alguien escuchando: si la pantalla principal no está
 * montada —se entró directo por una URL— quien llama tiene que navegar él.
 */
export function abrirLista(playlistId: string): boolean {
  if (!opener) return false
  opener(playlistId)
  return true
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
  /*
   * En un Jam, tocar una canción la hace sonar **ya y para todos** — es lo
   * que hace Spotify, y lo que uno espera de un toque sobre una canción. La
   * cola de todos no se pisa: lo que venía después sigue viniendo después.
   * Encolar sin cambiar lo que suena queda como la opción explícita del menú
   * («Agregar a la cola» → `enqueue`).
   *
   * Si el toque vino de una **lista**, va la lista desde ahí, no una canción
   * suelta: poner una playlist en un Jam tiene que hacer sonar la playlist —
   * con una sola, la fila quedaba en «No viene nada después» y la música se
   * moría al terminar el tema.
   */
  if (enJam()) {
    if (tracks.length > 1) jam?.tocarCola(tracks, index)
    else jam?.tocarAhora(track)
    return
  }
  // Con la música sonando en otro dispositivo de la cuenta, elegir una cola
  // acá es una decisión de traspaso: se pregunta antes de pisar nada.
  if (escucha?.retener(() => playQueue(tracks, index, origin))) return
  stopSnippets()
  // Cola nueva, historia nueva: lo que sonó en la anterior ya no es «anterior».
  historial = []
  // Y tanda nueva: la que venga en camino era para la cola que se va.
  generacionCola++
  /*
   * El aleatorio sobrevive como **preferencia**, pero la baraja no: era un
   * orden de índices de LA OTRA lista. Dejarla puesta hacía que la lista nueva
   * sonara salteada —los índices viejos, filtrados contra canciones que ya no
   * son— y que se «terminara» a las pocas canciones, con la radio entrando en
   * el medio de una playlist entera. Se rebaraja para esta cola, con la
   * canción tocada primera: tocaste esa, y el azar es para lo que sigue.
   */
  const shuffle = store.get().shuffle
    ? [index, ...barajar(tracks.length).filter((i) => i !== index)]
    : null
  store.set({
    tracks,
    upNext: [],
    manual: null,
    origin,
    index,
    shuffle,
    wantPlay: true,
    positionMs: 0,
    durationMs: track.durationMs,
    error: null,
  })
  guardar(true)
}

/** Suma a la cola manual: suena cuando termine lo de ahora. */
export function enqueue(track: PlaylistTrack) {
  // En un Jam, encolar es agregarle al Jam: la cola compartida es LA cola.
  if (enJam()) {
    jam?.encolar(track)
    return
  }
  // De espejo, encolar también pasa por el traspaso: la cola es la de allá.
  if (escucha?.retener(() => enqueue(track))) return
  const state = store.get()
  // Sin nada cargado, encolar es simplemente ponerla.
  if (state.index < 0 && !state.manual) {
    playQueue([track], 0, null)
    return
  }
  /*
   * Lo tuyo va **antes** que las recomendadas.
   *
   * Las tandas del autoplay viven en la misma cola (con id `radio:`), y
   * sumarse al final significaba que lo que encolaste a propósito esperara
   * detrás de lo que sugirió la máquina. Es la regla de Spotify: la cola del
   * usuario primero, la radio después. De paso deja el orden estable —lo tuyo
   * adelante, las recomendadas atrás— que es lo que la pantalla de la cola
   * dibuja como dos secciones.
   */
  const primeraRadio = state.upNext.findIndex((t) => t.id.startsWith('radio:'))
  const upNext =
    primeraRadio === -1
      ? [...state.upNext, track]
      : [
          ...state.upNext.slice(0, primeraRadio),
          track,
          ...state.upNext.slice(primeraRadio),
        ]
  store.set({ upNext })
}

/**
 * Saca una canción de la cola manual, por posición.
 *
 * Solo lo encolado a mano: lo que viene de la lista se quita desde la lista, y
 * en un Jam la cola manual ni existe (el volcado la deja vacía). Por posición y
 * no por id porque la misma canción puede encolarse dos veces, y quitar «una»
 * no puede llevarse a las dos.
 */
export function quitarEncolada(posicion: number) {
  const { upNext } = store.get()
  if (posicion < 0 || posicion >= upNext.length) return
  store.set({ upNext: upNext.filter((_, i) => i !== posicion) })
  /*
   * Si con lo quitado quedan pocas para después, la próxima tanda se pide
   * **ya**. Antes se pedía recién cuando la canción llegaba a su final —el
   * camino de `rellenarSiFalta`—, y sacar las recomendadas de la cola dejaba
   * un hueco de varios segundos mientras se resolvía la tanda nueva: se sentía
   * como que «tardan en cargar». La regla es la misma de siempre, así que se
   * reusa el mismo camino.
   */
  rellenarSiFalta()
}

/**
 * Reordena la cola manual: la canción en `desde` pasa a la posición `hacia`.
 *
 * Solo lo encolado a mano, igual que quitar: lo que viene de la lista tiene el
 * orden de la lista, y en un Jam la cola compartida se reordena en el panel
 * del Jam con sus permisos.
 */
export function moverEncolada(desde: number, hacia: number) {
  const { upNext } = store.get()
  if (desde < 0 || desde >= upNext.length) return
  const a = Math.max(0, Math.min(upNext.length - 1, hacia))
  if (a === desde) return
  const cola = [...upNext]
  const [movida] = cola.splice(desde, 1)
  if (!movida) return
  cola.splice(a, 0, movida)
  store.set({ upNext: cola })
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
  /* En un Jam, tocar una fila salta ahí **para todos**. El id de la fila ES el
     del ítem del Jam — la cola volcada conserva los ids del servidor. Si el
     puente la bloquea (sin permiso), no se salta ni localmente: verse en otra
     canción que el resto sería mentirse. */
  if (jam?.transporte('tocar', undefined, track.id)) return
  if (escucha?.retener(() => playAt(index))) return
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
  /*
   * Play de un invitado con el Jam ya sonando: reengancharse, no publicar.
   *
   * `jam_play` reescribe el arranque con la posición **guardada** — la del
   * último cambio de tema o pausa, que puede ser el cero de `jam_tocar` — así
   * que un invitado cuyo aparato quedó en pausa (un fragmento del chat, una
   * interrupción) al darle play mandaba a TODO el Jam de vuelta a ese segundo
   * viejo: la música «se reseteaba sola» para los demás. Si el Jam suena, el
   * único que necesita moverse es este aparato: se suma en el segundo por el
   * que va la música. El host no pasa por acá: su play sí publica, con su
   * posición real — su reproductor es la verdad del Jam.
   */
  if (jam?.activo() && jam.suena() && !jam.esHost()) {
    stopSnippets()
    reengancharAlJam()
    return
  }
  if (jam?.transporte('play')) return
  /*
   * Play con la música sonando en otro dispositivo de la cuenta: es LA
   * pregunta del traspaso — «¿la traés acá o la dejás allá?». Si allá no
   * suena nada (pausado, o el aparato se cerró), `retener` toma la escucha en
   * silencio y esto sigue como un play de siempre, en el segundo por el que
   * iba — que es lo que uno espera al retomar en otro aparato.
   */
  if (escucha?.retener(() => resumePlayback())) return
  stopSnippets()
  store.set({ wantPlay: true })
}

export function pausePlayback() {
  if (jam?.transporte('pause')) return
  /*
   * Pausar un espejo no pausa nada: acá no suena ningún audio, y mandar una
   * pausa al otro aparato sería control remoto — que no existe todavía—. Se
   * dice dónde está sonando, que es la información que faltaba.
   */
  if (enEspejo()) {
    avisar(`La música está sonando en ${escucha?.nombre() ?? 'otro dispositivo'}.`)
    return
  }
  store.set({ wantPlay: false })
}

export function togglePlayback() {
  /*
   * De espejo, el botón es UNA pregunta —«¿la traés acá?»— sin importar el
   * ícono que muestre: pausar algo que no está sonando en este aparato no
   * significa nada, y darle play ES el gesto del traspaso. `resumePlayback`
   * ya sabe retener y preguntar.
   */
  if (enEspejo()) {
    resumePlayback()
    return
  }
  if (store.get().wantPlay) pausePlayback()
  else resumePlayback()
}

/* ── Pausas que no vinieron de un botón de la app ──────────────────────────
 *
 * Un reel en Instagram, una llamada, el pitido de un mapa: iOS le corta el
 * audio a la app y el motor lo detecta como una pausa externa. Fuera de un Jam
 * eso ES una pausa —lo que sonaba se calla y queda en pausa, como siempre—,
 * pero adentro de un Jam publicarla **pausaba la música de todos**: una
 * persona miraba un video y el Jam entero se callaba.
 *
 * En un Jam, la interrupción es un problema de UN aparato: se pausa solo acá,
 * el reloj compartido sigue corriendo, y al volver —la app al frente, o el
 * play físico de los auriculares— este aparato se reengancha en el segundo
 * por el que va el Jam. Es lo que hace Spotify con sus Jams.
 */

/** Si la última pausa fue una interrupción dentro de un Jam, para reengancharse al volver. */
let interrumpidoEnJam = false

export function pausaExterna() {
  if (enJam()) {
    interrumpidoEnJam = true
    store.set({ wantPlay: false })
    return
  }
  pausePlayback()
}

export function reanudacionExterna() {
  if (enJam()) {
    reengancharAlJam()
    return
  }
  resumePlayback()
}

/**
 * La app volvió al frente después de una interrupción en Jam: si el Jam sigue
 * sonando, este aparato se suma de nuevo donde va la música — no donde la
 * dejó. Si el Jam está en pausa de verdad, no hay nada que reanudar.
 */
export function reanudarTrasInterrupcion() {
  if (!interrumpidoEnJam) return
  reengancharAlJam()
}

function reengancharAlJam() {
  interrumpidoEnJam = false
  if (!jam?.activo()) return
  if (!jam.suena()) return
  const objetivo = jam.posicionObjetivoMs()
  if (objetivo !== null) {
    engine?.seekTo(objetivo)
    store.set({ positionMs: objetivo })
  }
  store.set({ wantPlay: true })
}

export function playNext() {
  /*
   * En un Jam, «la que sigue» la decide el servidor adentro de su lock: si dos
   * personas saltan a la vez, la segunda parte del resultado de la primera y
   * no del estado que alcanzó a ver. Por eso acá **no** hay salto optimista:
   * el cambio llega por el canal, para todos igual.
   */
  if (jam?.activo()) {
    jam.transporte('siguiente')
    return
  }
  if (escucha?.retener(() => playNext())) return
  const state = store.get()

  /*
   * Lo encolado a mano va primero, **igual que al terminar la canción sola**.
   *
   * Antes esto solo miraba la lista, y ahí vivía un bug con dos caras: saltar
   * con algo en la cola manual se la salteaba, y en la última canción el botón
   * directamente no hacía nada — aunque la tanda de recomendaciones ya
   * estuviera esperando en `upNext`, puesta ahí por el motor justamente para
   * este momento. La regla es una sola: «siguiente» significa lo mismo apretado
   * que llegado — el orden de `advance`.
   */
  const [encolada, ...resto] = state.upNext
  if (encolada) {
    stopSnippets()
    recordarEnHistorial(currentOf(state))
    store.set({
      manual: encolada,
      upNext: resto,
      wantPlay: true,
      positionMs: 0,
      durationMs: encolada.durationMs,
      error: null,
    })
    guardar(true)
    return
  }

  const next = siguienteIndice(state)
  if (next !== null) {
    playAt(next)
    return
  }

  /* Con «repetir la lista», después de la última viene la primera — apretado
     o llegado, la rueda es la misma. */
  if (state.repetir === 'lista' && state.tracks.length) {
    const primera = state.shuffle?.[0] ?? 0
    if (state.tracks[primera]) {
      playAt(primera)
      return
    }
  }

  /*
   * Fin de la lista con «seguir al terminar» prendido: saltar también sigue
   * con recomendaciones. Es el mismo mecanismo del final natural — se pide la
   * tanda y se avanza en cuanto llega; si ya había un pedido en vuelo, la
   * marca alcanza para que ese mismo avance.
   */
  if (state.repetir === 'no' && leerAjustes().autoplay && relleno) {
    avanzarAlLlegar = true
    pedirRelleno()
  }
}

export function playPrevious() {
  const state = store.get()
  /*
   * Pasados unos segundos, "anterior" reinicia la canción en vez de volver a
   * la de antes. Es lo que hace cualquier reproductor y lo que uno espera
   * cuando quiere volver a escuchar algo que recién empezó.
   *
   * En un Jam la regla es la misma pero viaja como intent: reiniciar es un
   * seek a cero compartido, y «la anterior» la resuelve el servidor.
   */
  if (jam?.activo()) {
    if (state.positionMs > RESTART_MS) seekToMs(0)
    else jam.transporte('anterior')
    return
  }
  if (escucha?.retener(() => playPrevious())) return
  const reiniciar = () => {
    engine?.seekTo(0)
    store.set({ positionMs: 0 })
  }
  if (state.positionMs > RESTART_MS) {
    reiniciar()
    return
  }
  /*
   * Con una manual sonando —encolada a mano o recomendada—, «anterior» es lo
   * que sonaba antes de ella, que vive en `historial`: la lista no la conoce.
   * La que sonaba no se descarta, vuelve al frente de la cola manual para que
   * «siguiente» la retome. Si lo desapilado es una fila de la lista, se vuelve
   * a la lista por índice; si no, era otra manual y suena como tal.
   */
  if (state.manual) {
    const previa = historial.pop()
    if (!previa) {
      // Sin historia, una manual no tiene anterior: se reinicia.
      reiniciar()
      return
    }
    stopSnippets()
    const upNext = [state.manual, ...state.upNext]
    const enLista = state.tracks.findIndex((t) => t.id === previa.id)
    store.set({
      manual: enLista >= 0 ? null : previa,
      ...(enLista >= 0 ? { index: enLista } : {}),
      upNext,
      wantPlay: true,
      positionMs: 0,
      durationMs: previa.durationMs,
      error: null,
    })
    guardar(true)
    return
  }
  /*
   * «La de antes» respeta el aleatorio: con la baraja puesta, la anterior es
   * la anterior **del orden barajado**, no la fila de arriba en la lista.
   */
  const previo = anteriorIndice(state)
  if (previo === null) {
    reiniciar()
    return
  }
  playAt(previo)
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
  // En un Jam el salto es de todos: se publica, y si el permiso no alcanza no
  // se salta ni acá — la barra en otro segundo que el resto sería mentira.
  if (jam?.transporte('seek', to)) return
  // De espejo, arrastrar la barra también es querer la música acá: traspaso.
  if (escucha?.retener(() => seekToMs(to))) return
  engine?.seekTo(to)
  store.set({ positionMs: to })
}

/**
 * Se terminó la canción: pasa a la siguiente, o para si era la última.
 *
 * Lo llama la barra, que es la única que puede saber cuándo llegó al final.
 */
/**
 * Baraja de Fisher-Yates: cada orden posible con la misma probabilidad.
 *
 * Va escrito y no `sort(() => Math.random() - 0.5)`, que es el atajo que circula
 * por todos lados y **no** reparte parejo: el resultado depende del algoritmo de
 * ordenamiento y deja las canciones cerca de donde estaban. En una lista corta
 * eso se nota como «siempre me empieza por las mismas».
 */
function barajar(n: number): number[] {
  const orden = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[orden[i], orden[j]] = [orden[j], orden[i]]
  }
  return orden
}

/**
 * Prende o apaga el aleatorio.
 *
 * Al prenderlo, **la que está sonando queda primera**: prender el aleatorio no
 * puede cortarte el tema que estás escuchando, solo cambia lo que viene después.
 * Al apagarlo se vuelve al orden de la lista desde donde estás, sin saltos.
 */
/*
 * El temporizador de apagado.
 *
 * Existe por una razón muy concreta y muy poco técnica: mucha gente se duerme
 * escuchando música, y sin esto la única forma de que pare es despertarse a
 * pararla. Spotify lo tiene y es de las cosas que más se usan de noche.
 *
 * Guarda **cuándo** hay que parar y no cuánto falta, porque un contador
 * regresivo obligaría a un tick propio corriendo todo el tiempo — justo lo que
 * acabamos de sacar de la app por comernos el 80% de CPU. Con un instante
 * absoluto alcanza con un `setTimeout`, que duerme sin gastar nada.
 */
let dormirTimer: ReturnType<typeof setTimeout> | null = null

export function programarApagado(minutos: number | null) {
  if (dormirTimer) clearTimeout(dormirTimer)
  dormirTimer = null
  if (minutos === null) {
    store.set({ dormirA: null, dormirMin: null })
    return
  }
  store.set({ dormirA: Date.now() + minutos * 60_000, dormirMin: minutos })
  dormirTimer = setTimeout(() => {
    pausePlayback()
    store.set({ dormirA: null, dormirMin: null })
    dormirTimer = null
  }, minutos * 60_000)
}

/** Rota apagado → lista → una sola, como cualquier reproductor. */
export function toggleRepetir() {
  // En un Jam el orden es compartido: un repetir local te separaría del resto.
  if (enJam()) {
    avisar('En un Jam el orden es de todos.')
    return
  }
  if (enEspejo()) {
    avisar(`La música está sonando en ${escucha?.nombre() ?? 'otro dispositivo'}.`)
    return
  }
  const actual = store.get().repetir
  store.set({ repetir: actual === 'no' ? 'lista' : actual === 'lista' ? 'una' : 'no' })
}

export function toggleShuffle() {
  if (enJam()) {
    avisar('En un Jam el orden es de todos.')
    return
  }
  if (enEspejo()) {
    avisar(`La música está sonando en ${escucha?.nombre() ?? 'otro dispositivo'}.`)
    return
  }
  const state = store.get()
  if (state.shuffle) {
    store.set({ shuffle: null })
    return
  }
  const orden = barajar(state.tracks.length).filter((i) => i !== state.index)
  store.set({ shuffle: state.index >= 0 ? [state.index, ...orden] : orden })
}

/**
 * Cuál sigue después de `index`, respetando el aleatorio si está puesto.
 *
 * Los índices barajados se validan contra `tracks` en el momento de usarlos y no
 * al barajar: la lista se relee cuando agregás o sacás una canción, y un orden
 * calculado antes puede apuntar a un lugar que ya no existe.
 */
function siguienteIndice(state: PlaybackState): number | null {
  if (!state.shuffle) {
    const next = state.index + 1
    return state.tracks[next] ? next : null
  }
  const validos = state.shuffle.filter((i) => i >= 0 && i < state.tracks.length)
  const donde = validos.indexOf(state.index)
  const next = validos[donde + 1]
  return next === undefined ? null : next
}

/** La de antes, con el mismo criterio que `siguienteIndice`. */
function anteriorIndice(state: PlaybackState): number | null {
  if (!state.shuffle) {
    const prev = state.index - 1
    return state.tracks[prev] ? prev : null
  }
  const validos = state.shuffle.filter((i) => i >= 0 && i < state.tracks.length)
  const donde = validos.indexOf(state.index)
  if (donde <= 0) return null
  const prev = validos[donde - 1]
  return prev === undefined ? null : prev
}

export function advance() {
  /*
   * En un Jam, el final de una canción no lo decide cada dispositivo.
   *
   * El **host** es el único que avanza — su motor es el que manda — y no lo
   * hace localmente: le pide al servidor la siguiente y el cambio le llega por
   * el canal, igual que a todos. Un invitado cuyo reproductor llegó al final
   * simplemente espera: si avanzara solo, cada teléfono iría por su lado y a
   * la tercera canción el Jam sería un canon.
   */
  if (enJam()) {
    if (jam?.esHost()) jam.publicarAvance()
    return
  }

  const state = store.get()

  /*
   * Repetir una sola gana sobre todo lo demás.
   *
   * Va antes que la cola manual a propósito: si dejaste un tema en repetición y
   * encolaste otro, lo que pediste último —la repetición— es lo que mandás. La
   * cola encolada te espera para cuando la apagues.
   *
   * Se pide el salto al motor en vez de tocar el índice: la canción no cambia,
   * así que no hay nada que recargar; solo vuelve al principio.
   */
  if (state.repetir === 'una') {
    store.set({ positionMs: 0 })
    engine?.seekTo(0)
    return
  }

  // Lo encolado a mano va primero: es lo que alguien pidió expresamente.
  const [encolada, ...resto] = state.upNext
  if (encolada) {
    recordarEnHistorial(currentOf(state))
    store.set({ manual: encolada, upNext: resto, positionMs: 0, durationMs: encolada.durationMs })
    return
  }

  /*
   * Al terminar una encolada se sigue por la lista donde había quedado: `index`
   * no se movió mientras sonaba la manual, así que la que sigue es la de
   * siempre. Por eso el salto es el mismo en los dos casos.
   */
  const next = siguienteIndice(state)
  const track = next === null ? null : state.tracks[next]
  if (track && next !== null) {
    store.set({ manual: null, index: next, positionMs: 0, durationMs: track.durationMs })
    return
  }

  /*
   * Con «repetir la lista», el final es el principio. Va antes que las
   * recomendaciones: pediste explícitamente que se repita, y eso gana sobre un
   * relleno automático.
   */
  if (state.repetir === 'lista' && state.tracks.length) {
    const primera = state.shuffle?.[0] ?? 0
    const track = state.tracks[primera]
    if (track) {
      store.set({ manual: null, index: primera, positionMs: 0, durationMs: track.durationMs })
      return
    }
  }

  /*
   * Se acabó la lista.
   *
   * Con «seguir al terminar» prendido, la música **no se corta**: lo normal es
   * que la tanda ya esté esperando en `upNext` —el motor la pide cuando arranca
   * la última canción, ver `rellenarSiFalta`— y entonces ni se llega acá. Si el
   * pedido sigue en vuelo, se marca que hay que avanzar al llegar; si ni
   * siquiera se pidió —la preferencia se prendió a mitad del último tema—, se
   * pide ahora y se espera en la última mientras tanto.
   *
   * Si el relleno no está registrado —la web sin sesión, o un error— o vuelve
   * vacío, se para como se paraba antes. La preferencia apagada es lo mismo: el
   * silencio al final de la lista es una opción legítima.
   */
  if (leerAjustes().autoplay && relleno) {
    avanzarAlLlegar = true
    pedirRelleno()
    return
  }

  store.set({ manual: null, wantPlay: false, positionMs: state.durationMs })
}

export function reportProgress(positionMs: number, durationMs: number) {
  store.set({ positionMs, durationMs })
  guardar()
}

/**
 * La posición, cuadro a cuadro, para lo que se dibuja.
 *
 * `positionMs` del store avisa **diez veces por segundo** a propósito: cada
 * aviso es un render de la app entera y un reloj que muestra segundos no
 * necesita más. Pero la barra sí: a diez avisos por segundo el relleno avanzaba
 * a escalones de 100 ms, y en una barra ancha eso se ve como un tic-tic en vez
 * de un deslizamiento.
 *
 * Este valor lo escribe el motor en cada cuadro y lo leen los estilos animados
 * desde el hilo de UI, sin pasar por React. Es lo mismo que ya hacía el editor
 * de fragmento con su propia barra.
 *
 * Se crea con `makeMutable` y no con `useSharedValue` porque vive en el store,
 * fuera de todo componente: no hay hook donde crearlo y tiene que sobrevivir a
 * que se desmonte quien lo mire.
 */
export const posicionSV = makeMutable(0)

/** La posición para dibujar, sin tocar React. Ver `posicionSV`. */
export function reportarPosicionFina(positionMs: number) {
  posicionSV.value = positionMs
}

/*
 * Todo salto se copia al valor fino.
 *
 * El motor lo alimenta cuadro a cuadro mientras suena, pero la posición también
 * cambia de golpe en una docena de lugares: al arrastrar la barra, al pasar de
 * canción, al volver al principio, al reengancharse a un Jam. Suscribirse una
 * vez cubre todos esos casos sin tener que acordarse en cada uno — y cuando el
 * valor es el mismo que el motor acaba de escribir, escribirlo otra vez no
 * cuesta nada.
 */
store.subscribe(() => {
  const { positionMs } = store.get()
  if (posicionSV.value !== positionMs) posicionSV.value = positionMs
})

export function reportError(message: string) {
  store.set({ error: message, wantPlay: false })
  /*
   * Además del subtítulo en la barra, el toast de abajo.
   *
   * El error viajaba solo como subtítulo de la NowPlayingBar —donde antes iba
   * el artista— y ahí es fácil no verlo: quien tocó play está mirando la fila
   * que tocó, no el pie. El `Aviso` aparece sobre lo que sea que esté en
   * pantalla y es el mismo componente en iOS y en la web, que es justo lo que
   * hace falta para un fallo que hay que notar. `true` lo marca como malo: se
   * queda más tiempo y con más peso.
   */
  avisar(message, true)
}

export function stopPlayback() {
  // El volumen y la vista elegida sobreviven: son preferencias de quien
  // escucha, no estado de la canción que se cerró.
  const { volume, view } = store.get()
  historial = []
  generacionCola++
  store.set({ ...EMPTY, volume, view })
}

/**
 * El volumen se guarda **aparte** de la cola.
 *
 * Es una preferencia de quien escucha, no estado de la sesión: sobrevive a
 * cerrar la app, y a diferencia de la cola se guarda también durante un Jam o un
 * espejo (ahí `guardar` no escribe, con razón, pero la perilla es tuya igual).
 * Antes no se persistía en ningún lado, así que cada arranque volvía al máximo
 * —fuerte y molesto— y había que bajarlo de nuevo. Clave propia, un solo número.
 */
const VOL_CLAVE = 'volume:v1'

export function setVolume(volume: number) {
  if (!Number.isFinite(volume)) return
  const v = Math.max(0, Math.min(1, volume))
  store.set({ volume: v })
  void AsyncStorage.setItem(VOL_CLAVE, String(v)).catch(() => {
    // Sin memoria del volumen, pero suena igual.
  })
}

/** Devuelve el volumen de la sesión anterior. Lo llama el layout al arrancar. */
export async function restaurarVolumen() {
  try {
    const crudo = await AsyncStorage.getItem(VOL_CLAVE)
    if (crudo === null) return
    const v = Number(crudo)
    if (Number.isFinite(v)) store.set({ volume: Math.max(0, Math.min(1, v)) })
  } catch {
    // Lo guardado no se entiende: se ignora y queda el default.
  }
}

/** Volver a tocar la vista que ya está puesta la devuelve a la ficha. */
export function toggleView(view: Exclude<NowPlayingView, 'info'>) {
  store.set({ view: store.get().view === view ? 'info' : view })
}

/**
 * Poner una cara, sin alternar.
 *
 * Es para quien llega de afuera y quiere dejarla abierta —entrar a un Jam por
 * el link, por ejemplo—: con `toggleView` esa misma llamada la cerraría si ya
 * estaba puesta, que es justo lo contrario de lo que pide un «abrila».
 */
export function abrirVista(view: NowPlayingView) {
  store.set({ view })
}

/** Frena la cola porque va a sonar un fragmento del chat. */
export function pauseForSnippet() {
  if (!store.get().wantPlay) return
  /* Un espejo no está sonando acá: el fragmento no tiene con quién pelear, y
     «pausar» la escucha remota por escuchar un audio del chat sería absurdo. */
  if (enEspejo()) return
  /* En un Jam la pausa es solo tuya: escuchar un fragmento del chat no puede
     pausarle la música a todos los demás. El Jam sigue; al volver, play. */
  if (enJam()) {
    store.set({ wantPlay: false })
    return
  }
  pausePlayback()
}

/* ── El volcado del Jam ─────────────────────────────────────────────────────
 *
 * `state/jam` escribe por acá, directo y sin pasar por las acciones de arriba:
 * las acciones son pedidos de una persona y esto es **la verdad llegando del
 * servidor** — no tiene que pedir permiso, ni persistirse, ni volver a
 * publicarse. Si pasara por `resumePlayback`, un evento del canal dispararía
 * otro intent y el Jam conversaría consigo mismo en un eco infinito.
 */

/** El estado crudo, para que el Jam arme sus pedidos con lo que está sonando. */
export function getPlaybackState() {
  return store.get()
}

export function jamAplicar(a: {
  tracks: PlaylistTrack[]
  index: number
  wantPlay: boolean
  /**
   * Solo al entrar o al cambiar de canción. Mientras la misma canción suena,
   * la posición local la lleva el reloj del motor — pisarla desde cada evento
   * pelearía con él y la barra temblaría.
   */
  positionMs?: number
}) {
  const track = a.tracks[a.index] ?? null
  if (a.wantPlay && track) stopSnippets()
  // La cola pasó a ser la del Jam: la historia local ya no describe nada.
  historial = []
  generacionCola++
  store.set({
    tracks: a.tracks,
    upNext: [],
    manual: null,
    // Sin origen: la cola no salió de una lista tuya, y «ver la lista»
    // llevaría a una pantalla que no existe.
    origin: null,
    index: track ? a.index : -1,
    wantPlay: a.wantPlay && track !== null,
    durationMs: track?.durationMs ?? 0,
    // El orden es compartido: nada de baraja ni repetición locales.
    shuffle: null,
    repetir: 'no',
    error: null,
    ...(a.positionMs !== undefined ? { positionMs: a.positionMs } : {}),
  })
}

/* ── El volcado de la escucha ───────────────────────────────────────────────
 *
 * `state/escucha` escribe por acá, con el mismo contrato que el volcado del
 * Jam: esto es **la verdad llegando del servidor** — la escucha que está
 * sonando en otro dispositivo de la cuenta, o la que se acaba de tomar—. No
 * pide permiso, no persiste (ver `guardar`) y no vuelve a publicarse.
 */

/**
 * Reemplaza el estado local por la escucha del servidor, tal cual era: la
 * cola, lo encolado a mano, la manual sonando y de qué lista salió. A
 * diferencia del volcado del Jam conserva `upNext` y `manual`, porque la
 * escucha ES el estado local de otro aparato — restaurarlo a medias dejaría
 * el traspaso perdiendo lo que la persona había encolado.
 */
export function escuchaAplicar(a: {
  tracks: PlaylistTrack[]
  index: number
  upNext: PlaylistTrack[]
  manual: PlaylistTrack | null
  origin: PlaybackOrigin | null
  wantPlay: boolean
  positionMs: number
}) {
  const track = a.manual ?? a.tracks[a.index] ?? null
  if (a.wantPlay && track) stopSnippets()
  // La historia local describía otra cola: se vacía, como en el Jam.
  historial = []
  generacionCola++
  store.set({
    tracks: a.tracks,
    upNext: a.upNext,
    manual: a.manual,
    origin: a.origin,
    // El índice solo si apunta a una fila real; la manual vive aparte de él.
    index: a.index >= 0 && a.tracks[a.index] ? a.index : -1,
    wantPlay: a.wantPlay && track !== null,
    positionMs: Math.max(0, a.positionMs),
    durationMs: track?.durationMs ?? 0,
    // Orden y repetición son del aparato que reproduce, no del espejo.
    shuffle: null,
    repetir: 'no',
    error: null,
  })
}

/**
 * El transporte del espejo, sin pasar por las acciones: las acciones publican
 * decisiones de una persona, y esto es el eco de lo que ya pasó en el otro
 * aparato — play, pausa, o la posición derivada del reloj compartido.
 */
export function escuchaTransporte(wantPlay: boolean, positionMs?: number) {
  store.set({ wantPlay, ...(positionMs !== undefined ? { positionMs: Math.max(0, positionMs) } : {}) })
}

/** La escucha se cerró en el aparato dueño: acá tampoco queda nada que mostrar. */
export function escuchaSoltar() {
  stopPlayback()
}

/**
 * Cambios del estado de reproducción, para el publicador de la escucha.
 *
 * `state/escucha` no puede suscribirse por hook —no es un componente— y
 * exponer el store entero regalaría escritura sin contrato. Con esto le
 * alcanza: en cada cambio relee `getPlaybackState` y decide si hay algo que
 * publicar.
 */
export function subscribePlayback(listener: () => void): () => void {
  return store.subscribe(listener)
}

/**
 * El Jam terminó o te fuiste. El host conserva la cola —era suya antes de
 * compartirla y su música no tiene por qué cortarse—; un invitado vuelve al
 * silencio: lo que sonaba no era de él. Su cola anterior sigue en el disco
 * (guardar() no escribió durante el Jam) y reaparece al reabrir la app.
 */
export function jamSoltar(conservarCola: boolean) {
  if (conservarCola) {
    guardar(true)
    return
  }
  stopPlayback()
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
    /*
     * No hay canción en el índice guardado: la cola quedó más corta que él.
     *
     * Se reemplaza la cola **y se suelta el índice**. Dejarlo puesto era el
     * agujero: la cola nueva entraba y el índice viejo pasaba a señalar otra
     * canción, así que la lista marcaba una fila que no tenía nada que ver con
     * lo que sonaba. Sin índice no se marca nada, que es lo cierto.
     */
    store.set({ tracks, index: -1 })
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
/* El aleatorio y la repetición los dibujan los controles del reproductor, que
   están al lado de la barra de posición: suscribirse al estado entero los haría
   redibujarse cinco veces por segundo para mostrar un ícono que no cambió. */
export const useShuffle = () => useStore(store, (state) => state.shuffle !== null)
export const useRepetir = () => useStore(store, (state) => state.repetir)
export const useDormirMin = () => useStore(store, (state) => state.dormirMin)
export const useNowPlayingView = () => useStore(store, (state) => state.view)
export const useManualPlaying = () => useStore(store, (state) => state.manual !== null)
export const useUpNextCount = () => useStore(store, (state) => state.upNext.length)
export const usePlaybackIndex = () => useStore(store, (state) => state.index)
/* Lo justo para que un indicador siga el sonido sin suscribirse al estado
   entero: la posición, la duración y si el motor ya tiene el audio. */
export const usePlaybackPositionMs = () => useStore(store, (state) => state.positionMs)
export const usePlaybackDurationMs = () => useStore(store, (state) => state.durationMs)
export const usePlaybackCargada = () => useStore(store, (state) => state.cargada)
export const usePlaybackOriginId = () => useStore(store, (state) => state.origin?.id ?? null)
/** El origen de lo que suena, leído una vez: lo anota el historial al cambiar de tema. */
export function playbackOrigin(): PlaybackOrigin | null {
  return store.get().origin
}
export const useWantPlay = () => useStore(store, (state) => state.wantPlay)

/**
 * Si «siguiente» tiene a dónde ir. Es lo que decide si el botón se apaga.
 *
 * Mira lo mismo que `playNext`, en el mismo orden: la cola manual, la lista,
 * la rueda de repetir y el relleno de recomendaciones. Antes los botones
 * calculaban `index >= tracks.length - 1` por su cuenta, y eso apagaba el
 * salto justo cuando las recomendadas estaban esperando en `upNext` — o cuando
 * el autoplay podía traerlas.
 */
export const useHaySiguiente = () =>
  useStore(
    store,
    (state) =>
      state.upNext.length > 0 ||
      siguienteIndice(state) !== null ||
      (state.repetir === 'lista' && state.tracks.length > 0) ||
      (state.repetir === 'no' && leerAjustes().autoplay && relleno !== null),
  )
