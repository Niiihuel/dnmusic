import { AppState } from 'react-native'
import { getSupabase } from '../lib/supabase'
import { mensajeError } from '../lib/mensajeError'
import type { PlaylistTrack } from '../services/playlists'
import {
  agregarAJam,
  cambiarSalida,
  crearJam,
  expulsarDelJam,
  fetchJamEstado,
  jamAnterior,
  jamPause,
  jamPlay,
  jamSaltar,
  jamSeek,
  jamMover,
  jamTocar,
  jamTocarAhora,
  miJam,
  quitarDeJam,
  salirJam,
  setPermisosJam,
  suscribirJam,
  unirseJam,
  type Jam,
  type JamEstado,
  type JamItem,
  type JamMiembro,
  type JamPermisos,
  type Unsubscribe,
} from '../services/jam'
import {
  getPlaybackState,
  jamAplicar,
  jamSoltar,
  registerJam,
  reportProgress,
} from './playback'
import { leerAjustes } from './ajustes'
import { proximasRecomendadas, type ArtistaEscuchado } from '../services/recomendaciones'
import { avisar } from './aviso'
import { createStore, useStore } from './store'

/**
 * El Jam del lado del cliente: la copia local de una verdad que vive en
 * Postgres.
 *
 * Este archivo no decide nada sobre el Jam — eso lo hace la migración, adentro
 * de sus locks—. Lo que decide es **de este dispositivo**: cuándo conectarse,
 * qué hacer con lo que llega por el canal, y cómo volcarlo en `state/playback`
 * para que el resto de la app ni se entere de que la cola es compartida.
 *
 * Vive fuera de las pantallas por lo mismo que `session`: navegar no puede
 * cortar el Jam. La conexión se abre al crear o unirse, sobrevive a cualquier
 * pantalla, y se rearma sola al volver la app al frente.
 *
 * La regla de oro, heredada del canal de mensajes: **al reconectar nunca se
 * reproducen comandos viejos**. Se pide `jam_estado` y se reemplaza todo; la
 * `revision` descarta lo rancio.
 */

type Conexion = 'nada' | 'conectando' | 'dentro' | 'reconectando'

type Estado = {
  jam: Jam | null
  miembros: JamMiembro[]
  cola: JamItem[]
  conexion: Conexion
  miId: string | null
  /** Quiénes están conectados ahora (presencia), que no es quiénes son miembros. */
  presentes: string[]
  /**
   * Reloj del servidor menos reloj local, en ms. Se mide con cada
   * `jam_estado` al estilo NTP: la hora del servidor contra el punto medio del
   * viaje. Con esto, «cuándo arrancó la canción» significa lo mismo en todos
   * los dispositivos aunque ningún reloj esté en hora.
   */
  offsetMs: number
}

const store = createStore<Estado>({
  jam: null,
  miembros: [],
  cola: [],
  conexion: 'nada',
  miId: null,
  presentes: [],
  offsetMs: 0,
})

/* Cuánto puede correrse un arranque hacia el futuro antes de ignorarlo: más
 * que esto es un reloj mal medido, no una cuenta regresiva. */
const ESPERA_MAX_MS = 2000
/* Los eventos gruesos se juntan: dos canciones agregadas seguidas son un solo
 * viaje a la base, no dos. Mismo criterio que la bandeja de conversaciones. */
const REFETCH_MS = 200

let desuscribir: Unsubscribe | null = null
let refetchTimer: ReturnType<typeof setTimeout> | null = null
let tickerRemoto: ReturnType<typeof setInterval> | null = null
/** El Jam al que está atada la conexión actual; para el refetch sin estado. */
let jamConectado: string | null = null
/** Sube en cada conexión y cierre: una respuesta vieja que llega tarde no pisa nada. */
let version = 0

async function miUid(): Promise<string | null> {
  try {
    const { data } = await getSupabase().auth.getSession()
    return data.session?.user?.id ?? null
  } catch {
    return null
  }
}

/* ── El reloj compartido ──────────────────────────────────────────────────── */

function derivada(jam: Jam, offsetMs: number): number {
  if (!jam.suena || jam.arrancadoEn === null) return jam.posicionMs
  const servidorAhora = Date.now() + offsetMs
  return jam.posicionMs + Math.max(0, servidorAhora - jam.arrancadoEn)
}

/** Dónde debería ir la canción **ahora**, según el servidor. Para el motor. */
export function jamPosicionObjetivoMs(): number | null {
  const s = store.get()
  if (!s.jam || !s.jam.itemActual) return null
  return derivada(s.jam, s.offsetMs)
}

export function jamSuena(): boolean {
  return store.get().jam?.suena ?? false
}

/**
 * Cuánto falta para el arranque programado, si el instante todavía no llegó.
 *
 * Los cambios de tema se fijan un pelo en el futuro (ver `jam_tocar`): todos
 * reciben el evento, cargan, y arrancan **en el instante**, no cada uno al
 * enterarse. Esto lo espera el motor antes de darle play.
 */
export function jamEsperaArranqueMs(): number {
  const s = store.get()
  if (!s.jam?.suena || s.jam.arrancadoEn === null) return 0
  const arranqueLocal = s.jam.arrancadoEn - s.offsetMs
  return Math.min(ESPERA_MAX_MS, Math.max(0, arranqueLocal - Date.now()))
}

/* ── Volcar al reproductor ────────────────────────────────────────────────── */

function soyHost(s: Estado): boolean {
  return s.jam !== null && s.jam.hostId === s.miId
}

function miSalida(s: Estado): 'propia' | 'host' {
  return s.miembros.find((m) => m.userId === s.miId)?.salida ?? 'propia'
}

function itemActualDe(s: Estado): JamItem | null {
  if (!s.jam?.itemActual) return null
  return s.cola.find((i) => i.id === s.jam?.itemActual) ?? null
}

/**
 * La verdad del Jam entra al store de reproducción.
 *
 * Va por `jamAplicar` —el camino directo— y no por las acciones: las acciones
 * publican intents, y un evento que publicara otro intent sería el Jam
 * conversando consigo mismo en eco.
 */
function volcar() {
  const s = store.get()
  if (!s.jam) return
  const index = s.jam.itemActual ? s.cola.findIndex((i) => i.id === s.jam?.itemActual) : -1
  jamAplicar({
    tracks: s.cola,
    index,
    wantPlay: s.jam.suena && index >= 0,
    /*
     * La posición derivada va siempre: al cambiar de tema es el punto de
     * arranque (cero, o el minuto justo si entraste con la canción empezada,
     * vía el mecanismo de retomar del motor), y sonando es un número que el
     * reloj local del motor pisa en el próximo cuadro. Pisar de más es
     * inocuo; pisar de menos dejaba al que entra tarde arrancando en cero.
     */
    positionMs: index >= 0 ? Math.max(0, derivada(s.jam, s.offsetMs)) : 0,
  })
  ajustarTickerRemoto()
}

/**
 * La barra del que escucha **en el dispositivo del host** avanza por reloj.
 *
 * Ese dispositivo no reproduce nada, así que no hay motor que informe la
 * posición: se deriva una vez por segundo. Es un `setInterval` lento de
 * JavaScript —nada de `requestAnimationFrame`, ver el incidente de CPU en
 * `MotorAudio`— y solo existe mientras se es control remoto con algo sonando.
 */
function ajustarTickerRemoto() {
  const s = store.get()
  const item = itemActualDe(s)
  const debe =
    s.jam !== null && s.jam.suena && item !== null && !soyHost(s) && miSalida(s) === 'host'
  if (debe && !tickerRemoto) {
    tickerRemoto = setInterval(() => {
      const ahora = store.get()
      const it = itemActualDe(ahora)
      if (!ahora.jam || !it) return
      reportProgress(Math.min(derivada(ahora.jam, ahora.offsetMs), it.durationMs), it.durationMs)
    }, 1000)
  } else if (!debe && tickerRemoto) {
    clearInterval(tickerRemoto)
    tickerRemoto = null
  }
}

/* ── Aplicar lo que llega ─────────────────────────────────────────────────── */

function aplicarEstado(estado: JamEstado, medicion?: { t0: number; t1: number }) {
  if (estado.jam.status === 'terminado') {
    cerrar('El Jam terminó.')
    return
  }
  const prev = store.get()
  // Un refetch que viajó lento no puede pisar un evento que llegó más nuevo.
  if (prev.jam && prev.jam.id === estado.jam.id && estado.jam.revision < prev.jam.revision) {
    return
  }
  const offsetMs = medicion
    ? Math.round(estado.ahora - (medicion.t0 + medicion.t1) / 2)
    : prev.offsetMs
  store.set({
    jam: estado.jam,
    miembros: estado.miembros,
    cola: estado.cola,
    offsetMs,
    conexion: 'dentro',
  })
  volcar()
}

/** El camino rápido: la fila de `jams` entera, directa del evento del canal. */
function aplicarJamRow(nuevo: Jam) {
  const s = store.get()
  if (!s.jam || s.jam.id !== nuevo.id) return
  if (nuevo.revision <= s.jam.revision) return
  if (nuevo.status === 'terminado') {
    cerrar('El Jam terminó.')
    return
  }
  /*
   * Si apunta a un ítem que todavía no conocemos —lo agregaron y lo tocaron
   * antes de que el refetch de la cola llegara—, se guarda el Jam pero no se
   * vuelca: volcarlo cortaría la música apuntando a la nada. El refetch trae
   * la cola y vuelca todo junto.
   */
  const conocido = !nuevo.itemActual || s.cola.some((i) => i.id === nuevo.itemActual)
  store.set({ jam: nuevo })
  if (conocido) volcar()
  else programarRefetch()
}

/* ── El ciclo de conexión ─────────────────────────────────────────────────── */

function programarRefetch() {
  if (!jamConectado) return
  if (refetchTimer) clearTimeout(refetchTimer)
  refetchTimer = setTimeout(() => {
    refetchTimer = null
    void refrescar()
  }, REFETCH_MS)
}

async function refrescar() {
  const id = jamConectado
  if (!id) return
  const v = version
  try {
    const t0 = Date.now()
    const estado = await fetchJamEstado(id)
    const t1 = Date.now()
    if (v !== version) return
    aplicarEstado(estado, { t0, t1 })
  } catch (e) {
    if (v !== version) return
    const texto = mensajeError(e)
    // Que el estado no llegue distingue dos finales: te sacaron, o se terminó.
    if (/No estás/.test(texto)) cerrar('Te sacaron del Jam.')
    else if (/terminó|no existe/.test(texto)) cerrar('El Jam terminó.')
    // Un error de red se tolera: el canal reintenta y el próximo evento repide.
  }
}

async function conectar(jamId: string) {
  const uid = store.get().miId ?? (await miUid())
  if (!uid) return
  desuscribir?.()
  const v = ++version
  jamConectado = jamId
  store.set({ miId: uid })
  desuscribir = suscribirJam(jamId, uid, {
    onJam: (jam) => {
      if (v === version) aplicarJamRow(jam)
    },
    onGrueso: () => {
      if (v === version) programarRefetch()
    },
    onPresentes: (ids) => {
      if (v === version) store.set({ presentes: ids })
    },
    onCaida: () => {
      if (v !== version) return
      // supabase-js rearma el canal solo; al volver, SUBSCRIBED repide todo.
      if (store.get().conexion === 'dentro') store.set({ conexion: 'reconectando' })
    },
  })
}

/**
 * Cierre local: canal, relojes y estado. El playback se suelta según quién
 * eras — el host conserva la cola que era suya, el invitado vuelve al
 * silencio. No manda ningún RPC: eso es de quien llama, si corresponde.
 */
function cerrar(mensaje?: string) {
  const s = store.get()
  const eraHost = soyHost(s)
  const habia = s.jam !== null
  version++
  jamConectado = null
  desuscribir?.()
  desuscribir = null
  if (refetchTimer) {
    clearTimeout(refetchTimer)
    refetchTimer = null
  }
  if (tickerRemoto) {
    clearInterval(tickerRemoto)
    tickerRemoto = null
  }
  store.set({ jam: null, miembros: [], cola: [], conexion: 'nada', presentes: [] })
  if (habia) jamSoltar(eraHost)
  if (mensaje && habia) avisar(mensaje)
}

/* La app vuelve al frente: lo que haya pasado mientras tanto, de una vez. */
AppState.addEventListener('change', (estado) => {
  if (estado === 'active' && store.get().jam) programarRefetch()
})

/* ── Acciones ─────────────────────────────────────────────────────────────── */

/**
 * Crear un Jam con lo que está sonando: la cola entera pasa a ser compartida,
 * apuntando a la canción actual en el segundo en que va. Devuelve si quedó
 * creado, para que la pantalla sepa si navegar al sheet.
 */
export async function crearJamActual(): Promise<boolean> {
  if (store.get().jam) return true
  const p = getPlaybackState()
  const actual = p.manual ?? (p.index >= 0 ? (p.tracks[p.index] ?? null) : null)
  if (!actual) {
    avisar('Poné algo a sonar primero: el Jam arranca con tu cola.')
    return false
  }
  // La cola como se va a escuchar: lo encolado a mano va después de lo actual.
  const canciones = (
    p.manual
      ? [p.manual, ...p.upNext, ...p.tracks.slice(p.index + 1)]
      : [...p.tracks.slice(0, p.index + 1), ...p.upNext, ...p.tracks.slice(p.index + 1)]
  ).slice(0, 500)
  const indice = p.manual ? 0 : Math.min(p.index, canciones.length - 1)

  store.set({ conexion: 'conectando', miId: await miUid() })
  try {
    const t0 = Date.now()
    const estado = await crearJam(canciones, indice, p.wantPlay, p.positionMs)
    const t1 = Date.now()
    aplicarEstado(estado, { t0, t1 })
    await conectar(estado.jam.id)
    return true
  } catch (e) {
    store.set({ conexion: 'nada' })
    avisar(`No se pudo crear el Jam: ${mensajeError(e)}`, true)
    return false
  }
}

export async function unirseAJam(code: string, salida: 'propia' | 'host'): Promise<boolean> {
  store.set({ conexion: 'conectando', miId: await miUid() })
  try {
    const t0 = Date.now()
    const estado = await unirseJam(code, salida)
    const t1 = Date.now()
    aplicarEstado(estado, { t0, t1 })
    await conectar(estado.jam.id)
    return true
  } catch (e) {
    store.set({ conexion: 'nada' })
    avisar(`No se pudo entrar al Jam: ${mensajeError(e)}`, true)
    return false
  }
}

/**
 * Salir. Para el host es terminar el Jam —sin quien lo emite no queda nada que
 * escuchar— y el servidor ya lo entiende así. Local primero, RPC después: el
 * botón tiene que responder ya, y si el pedido se pierde la expiración limpia.
 */
export function salirDelJam() {
  const s = store.get()
  if (!s.jam) return
  const id = s.jam.id
  const eraHost = soyHost(s)
  cerrar(eraHost ? 'Jam terminado.' : 'Saliste del Jam.')
  void salirJam(id).catch(() => {})
}

/** Cierre sin despedida, para el logout: la sesión ya no puede firmar RPCs. */
export function desconectarJam() {
  cerrar()
}

/** Volver a engancharse al abrir la app: la membresía vive en la base. */
export async function reconectarJam(): Promise<void> {
  if (store.get().jam || jamConectado) return
  try {
    const id = await miJam()
    if (!id || store.get().jam) return
    store.set({ conexion: 'conectando' })
    // El estado llega por el SUBSCRIBED del canal, que repide todo.
    await conectar(id)
  } catch {
    store.set({ conexion: 'nada' })
  }
}

export function agregarCancionAlJam(track: PlaylistTrack) {
  const s = store.get()
  if (!s.jam) return
  if (!puedo('agregar')) {
    avisar('El host no dejó agregar canciones.')
    return
  }
  void agregarAJam(s.jam.id, track)
    .then(() => avisar('Agregada al Jam'))
    .catch((e) => avisar(`No se pudo agregar: ${mensajeError(e)}`, true))
}

/**
 * Tocar una canción **ya**, para todos: se intercala después de la que suena
 * y el Jam salta ahí. Es lo que significa tocar una canción con un Jam
 * andando — como en Spotify—; encolar sin cambiar lo que suena es la otra
 * opción, la explícita del menú.
 */
export function tocarAhoraEnJam(track: PlaylistTrack) {
  const s = store.get()
  if (!s.jam) return
  if (!puedo('saltar')) {
    avisar('El host no dejó cambiar de canción. Podés agregarla a la cola.')
    return
  }
  void jamTocarAhora(s.jam.id, track).catch((e) => {
    avisar(`No se pudo poner: ${mensajeError(e)}`, true)
    programarRefetch()
  })
}

export function quitarCancionDelJam(itemId: string) {
  const s = store.get()
  if (!s.jam) return
  const item = s.cola.find((i) => i.id === itemId)
  if (!item) return
  if (!soyHost(s) && item.agregadoPor !== s.miId) {
    avisar('Solo podés quitar lo que agregaste vos.')
    return
  }
  void quitarDeJam(s.jam.id, itemId).catch((e) =>
    avisar(`No se pudo quitar: ${mensajeError(e)}`, true),
  )
}

/**
 * Mover una canción a otro lugar de la fila. `aIndice` es el destino dentro
 * de la cola entera. Optimista como los permisos: la fila se acomoda ya —un
 * arrastre que espera al servidor se siente roto— y el evento confirma o el
 * refetch corrige. Reordenar es editar la fila: pide el permiso de agregar.
 */
export function moverCancionDelJam(itemId: string, aIndice: number) {
  const s = store.get()
  if (!s.jam) return
  if (!puedo('agregar')) {
    avisar('El host no dejó reordenar la cola.')
    return
  }
  const desde = s.cola.findIndex((i) => i.id === itemId)
  if (desde < 0) return
  const a = Math.max(0, Math.min(s.cola.length - 1, aIndice))
  if (a === desde) return
  const cola = [...s.cola]
  const [item] = cola.splice(desde, 1)
  if (!item) return
  cola.splice(a, 0, item)
  // El ancla que entiende el servidor: lo que queda justo antes en la fila nueva.
  const tras = a > 0 ? (cola[a - 1]?.id ?? null) : null
  store.set({ cola })
  volcar()
  void jamMover(s.jam.id, itemId, tras).catch((e) => {
    avisar(`No se pudo mover: ${mensajeError(e)}`, true)
    programarRefetch()
  })
}

export function ponerPermisosJam(cambio: Partial<JamPermisos>) {
  const s = store.get()
  if (!s.jam || !soyHost(s)) return
  // Optimista: el interruptor responde ya; el evento confirma o el refetch corrige.
  store.set({ jam: { ...s.jam, permisos: { ...s.jam.permisos, ...cambio } } })
  void setPermisosJam(s.jam.id, cambio).catch((e) => {
    avisar(`No se pudo cambiar: ${mensajeError(e)}`, true)
    programarRefetch()
  })
}

export function expulsarMiembro(userId: string) {
  const s = store.get()
  if (!s.jam || !soyHost(s)) return
  void expulsarDelJam(s.jam.id, userId).catch((e) =>
    avisar(`No se pudo sacar: ${mensajeError(e)}`, true),
  )
}

/** Cambiar dónde escucho, ya adentro. La misma elección que al entrar. */
export function cambiarMiSalida(salida: 'propia' | 'host') {
  const s = store.get()
  if (!s.jam || !s.miId) return
  store.set({
    miembros: s.miembros.map((m) => (m.userId === s.miId ? { ...m, salida } : m)),
  })
  volcar()
  void cambiarSalida(s.jam.id, salida).catch((e) => {
    avisar(`No se pudo cambiar: ${mensajeError(e)}`, true)
    programarRefetch()
  })
}

/* ── Permisos, en un solo lugar ───────────────────────────────────────────── */

export function puedo(accion: 'agregar' | 'controlar' | 'saltar'): boolean {
  const s = store.get()
  if (!s.jam) return true
  if (soyHost(s)) return true
  if (accion === 'agregar') return s.jam.permisos.agregan
  if (accion === 'controlar') return s.jam.permisos.controlan
  return s.jam.permisos.saltan
}

/* ── El puente hacia playback ─────────────────────────────────────────────── */

function transporte(
  accion: 'play' | 'pause' | 'seek' | 'siguiente' | 'anterior' | 'tocar',
  ms?: number,
  itemId?: string,
): boolean {
  const s = store.get()
  if (!s.jam) return false
  const id = s.jam.id
  const host = soyHost(s)
  const fallo = (e: unknown) => {
    avisar(`El Jam no respondió: ${mensajeError(e)}`, true)
    // Ante la duda, la verdad completa: lo optimista pudo quedar mintiendo.
    programarRefetch()
  }

  if (accion === 'siguiente' || accion === 'anterior') {
    if (!puedo('saltar')) {
      avisar('El host no dejó saltar canciones.')
      return true
    }
    void (accion === 'siguiente' ? jamSaltar(id) : jamAnterior(id)).catch(fallo)
    // La que sigue la resuelve el servidor: nada local que hacer.
    return true
  }

  if (accion === 'tocar') {
    if (!puedo('saltar')) {
      avisar('El host no dejó saltar canciones.')
      return true
    }
    if (itemId) void jamTocar(id, itemId).catch(fallo)
    return false
  }

  if (!puedo('controlar')) {
    avisar('El host no dejó controlar la música.')
    return true
  }
  if (accion === 'play') {
    // Solo el host manda su posición: es el único que oye el audio de verdad.
    void jamPlay(id, host ? getPlaybackState().positionMs : undefined).catch(fallo)
  } else if (accion === 'pause') {
    void jamPause(id, host ? getPlaybackState().positionMs : undefined).catch(fallo)
  } else {
    void jamSeek(id, ms ?? 0).catch(fallo)
  }
  return false
}

registerJam({
  activo: () => store.get().jam !== null,
  esHost: () => soyHost(store.get()),
  suena: jamSuena,
  posicionObjetivoMs: jamPosicionObjetivoMs,
  transporte,
  encolar: agregarCancionAlJam,
  tocarAhora: tocarAhoraEnJam,
  publicarAvance: () => {
    const s = store.get()
    if (!s.jam) return
    void jamSaltar(s.jam.id).catch(() => programarRefetch())
  },
})

/* ── El relleno del Jam ───────────────────────────────────────────────────── */

/** Si ya hay una tanda en camino: pedir dos veces al mismo final duplica canciones. */
let rellenandoJam = false

/**
 * Cuando al Jam se le acaba la cola, el **host** lo mantiene sonando.
 *
 * Fuera de un Jam, el final de la lista sigue con recomendaciones (ver
 * `rellenarSiFalta` en playback). Adentro no había nada: `jam_saltar` sin
 * siguiente deja el Jam mudo con la misma canción en cero — apretar
 * «siguiente» en la última se sentía como un bug, y lo era: la app promete
 * que la música no se corta al terminarse la cola.
 *
 * Lo hace el host y nadie más: es el dueño del Jam (siempre tiene permiso de
 * agregar), su historial es el ancla natural, y un solo aparato pidiendo evita
 * tandas duplicadas. Corre cuando **arranca la última** canción de la cola
 * —para que la tanda llegue antes del final, como afuera— y también si el Jam
 * ya quedó mudo en el final: ahí además lo despierta.
 */
export async function rellenarJamSiFalta() {
  const s = store.get()
  if (!s.jam || !soyHost(s) || rellenandoJam) return
  if (!leerAjustes().autoplay) return
  const idx = s.jam.itemActual ? s.cola.findIndex((i) => i.id === s.jam?.itemActual) : -1
  // Solo en la última canción: si hay algo después, no falta nada.
  if (idx === -1 || idx < s.cola.length - 1) return

  rellenandoJam = true
  try {
    /* Las anclas de respaldo salen de la cola del Jam, igual que afuera salen
       de la cola que suena: si el historial del host no alcanza, seguir con
       algo parecido a lo que se estuvo escuchando. */
    const porArtista = new Map<string, ArtistaEscuchado>()
    for (const item of s.cola) {
      if (!item.artistId) continue
      const previo = porArtista.get(item.artistId)
      if (previo) previo.ms += Math.max(1, item.durationMs)
      else porArtista.set(item.artistId, { artist_id: item.artistId, artist: item.artist, ms: Math.max(1, item.durationMs) })
    }
    const tanda = await proximasRecomendadas(
      s.cola.map((i) => i.videoId),
      [...porArtista.values()],
    )

    const ahora = store.get()
    if (!ahora.jam || ahora.jam.id !== s.jam.id || !tanda.length) return
    // En serie y no en paralelo: jam_agregar ancla cada una al final de la
    // fila, y una ráfaga concurrente las dejaría en cualquier orden.
    for (const track of tanda) {
      await agregarAJam(ahora.jam.id, track)
    }

    /*
     * Si el Jam ya estaba mudo en el final —alguien apretó «siguiente» en la
     * última—, con cola nueva se lo despierta. Solo en ese caso: una pausa
     * pedida a mano congela la posición donde iba, y el silencio del final
     * queda exactamente en cero (ver `jam_saltar`); despertar sobre una pausa
     * de verdad sería pisarle el botón a alguien.
     */
    const tras = store.get()
    if (tras.jam && !tras.jam.suena && tras.jam.posicionMs === 0) {
      await jamSaltar(tras.jam.id)
    }
  } catch {
    // El relleno corre solo y no puede romper el Jam: sin tanda, silencio,
    // que es lo que ya había.
  } finally {
    rellenandoJam = false
  }
}

/* ── Hooks ────────────────────────────────────────────────────────────────── */

export const useJam = () => useStore(store, (s) => s.jam)
export const useJamActivo = () => useStore(store, (s) => s.jam !== null)
export const useMiembrosJam = () => useStore(store, (s) => s.miembros)
export const useColaJam = () => useStore(store, (s) => s.cola)
export const usePresentesJam = () => useStore(store, (s) => s.presentes)
export const useConexionJam = () => useStore(store, (s) => s.conexion)
export const useSoyHostJam = () => useStore(store, (s) => soyHost(s))
export const useMiSalidaJam = () => useStore(store, (s) => miSalida(s))
export const useCuantosJam = () => useStore(store, (s) => s.miembros.length)
export const useMiIdJam = () => useStore(store, (s) => s.miId)
/** Para el motor: cada mutación del Jam es un pulso que dispara la corrección. */
export const useJamRevision = () => useStore(store, (s) => s.jam?.revision ?? 0)
/** Este dispositivo NO reproduce: es control remoto del host. Silencia al motor. */
export const useJamSilencioso = () =>
  useStore(store, (s) => s.jam !== null && !soyHost(s) && miSalida(s) === 'host')
/** Este dispositivo reproduce y sigue al servidor: invitado con salida propia. */
export const useJamSincronizo = () =>
  useStore(store, (s) => s.jam !== null && !soyHost(s) && miSalida(s) === 'propia')
