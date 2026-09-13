import type { EstadoDiscordRemoto, MensajeControlDiscord } from '../services/protocoloDiscordRemoto'
import { LATIDO_ESCUCHA_MS, VIGENCIA_ESCUCHA_MS } from '../services/lecturaViva'
import { AppState } from 'react-native'
import { getSupabase } from '../lib/supabase'
import { idDispositivo, nombreDispositivo } from '../lib/dispositivo'
import {
  fetchEscuchaEstado,
  publicarEscucha,
  suscribirEscucha,
  type DispositivoPresente,
  type ColaEscucha,
  type Escucha,
  type EscuchaEstado,
  type Unsubscribe,
} from '../services/escucha'
import {
  escuchaAplicar,
  escuchaSoltar,
  escuchaTransporte,
  getPlaybackState,
  registerEscucha,
  reportProgress,
  subscribePlayback,
  resumePlayback,
} from './playback'
import { hayJam } from './jam'
import { createStore, useStore } from './store'

/**
 * La escucha de la cuenta, del lado del cliente: una sola música para todos
 * tus dispositivos.
 *
 * Es el mismo modelo del Jam aplicado puertas adentro de la cuenta. La verdad
 * vive en Postgres (la fila de `escuchas`); el aparato que reproduce es el
 * **dueño** y publica sus eventos —play, pausa, salto, cambio de cola—; los
 * demás son **espejos**: reciben la fila por el canal, la vuelcan en
 * `state/playback` y la app entera dibuja lo que suena allá sin que ningún
 * componente sepa la diferencia. Tocar el transporte en un espejo es el
 * **traspaso**: si allá está sonando, se pregunta con un modal («¿La traés
 * acá?»); si allá está en pausa o el aparato se cerró, se toma en silencio —
 * retomar tu propia música no interrumpe a nadie.
 *
 * Este archivo no decide nada sobre la escucha —eso es de la migración, dentro
 * de su lock—. Decide **de este dispositivo**: cuándo publicar, qué hacer con
 * lo que llega, y cómo volcarlo. Vive fuera de las pantallas por lo mismo que
 * el Jam: navegar no puede cortar el espejo.
 *
 * La regla de oro heredada: **al reconectar nunca se reproducen comandos
 * viejos**. Se pide `escucha_estado` y se reemplaza todo; la `revision`
 * descarta lo rancio.
 */

type Pendiente = {
  /** Cómo se llama el aparato donde está sonando, para el modal. */
  nombre: string
  /** La acción retenida: corre si la persona elige traer la música acá. */
  continuar: () => void
}

export type ConexionEscucha = 'conectando' | 'conectado' | 'desconectado'
export type TransferenciaEscucha = { destino: string; estado: 'pendiente' | 'confirmada' | 'error'; error: string | null }
export type ActividadEscucha = { deviceId: string | null; nombre: string | null; estado: 'sonando' | 'pausado' | 'preparando' | 'desconectado' | 'inactivo' }
type Estado = {
  conexion: ConexionEscucha
  sesionControl: string | null
  transferencia: TransferenciaEscucha | null
  actividad: ActividadEscucha
  sonandoLocal: boolean
  ahora: number
  escucha: Escucha | null
  /**
   * Dispositivos de la cuenta conectados ahora (presencia). `null` hasta la
   * primera sincronización: en esa ventana se asume que el dueño está — la
   * duda no puede arrancar audio local por encima de una escucha que sí suena.
   */
  presentes: DispositivoPresente[] | null
  /** Reloj del servidor menos reloj local, medido como en el Jam. */
  offsetMs: number
  deviceId: string | null
  /** Este aparato refleja la escucha de otro: dibuja todo, no suena nada. */
  espejo: boolean
  /** El traspaso preguntando; null sin modal a la vista. */
  pendiente: Pendiente | null
  /** El selector de dispositivos, abierto o cerrado. */
  selectorAbierto: boolean
}

const store = createStore<Estado>({
  conexion: 'desconectado', sesionControl: null, transferencia: null,
  actividad: { deviceId: null, nombre: null, estado: 'inactivo' },
  sonandoLocal: false, ahora: Date.now(),
  escucha: null,
  presentes: null,
  offsetMs: 0,
  deviceId: null,
  espejo: false,
  pendiente: null,
  selectorAbierto: false,
})

/* Los eventos gruesos se juntan, mismo criterio que el refetch del Jam. */
const REFETCH_MS = 200
/* Los cambios locales también: un salto de tema trae tres sets seguidos del
 * store y tiene que viajar como una sola publicación. */
const PUBLICAR_MS = 300
/* Deriva local contra lo publicado que se lee como un seek del dueño. Más
 * fino sería perseguir el ruido del propio reloj de reproducción. */
const SEEK_UMBRAL_MS = 3000

let desuscribir: Unsubscribe | null = null
let inicio: Promise<void> | null = null
/** Enviar el «tomá vos» a un aparato: lo arma el canal en `iniciarEscucha`. */
let mandarAImpl: ((destino: string, suena?: boolean, revision?: number) => Promise<void>) | null = null
let mandarControlDiscordImpl: ((mensaje: MensajeControlDiscord) => Promise<void>) | null = null
let anunciarDiscordImpl: ((estado: EstadoDiscordRemoto | null) => void) | null = null
let discordAnunciado: { userId: string; estado: EstadoDiscordRemoto } | null = null
let recibirControlDiscord: ((mensaje: unknown) => void) | null = null
let soltarPlayback: (() => void) | null = null
let refetchTimer: ReturnType<typeof setTimeout> | null = null
let publicarTimer: ReturnType<typeof setTimeout> | null = null
let ticker: ReturnType<typeof setInterval> | null = null
/** Sube en cada conexión y cierre: una respuesta vieja no pisa nada. */
let version = 0
let uid: string | null = null
/** El volcado del servidor está escribiendo en playback: no es una decisión
 *  local y no se publica — sin esto, cada evento sería un eco infinito. */
let aplicandoRemoto = false
/** Lo último publicado, para el diff y para detectar un seek del dueño. */
let publicado: {
  trackId: string | null
  suena: boolean
  colaSig: string
  posicionMs: number
  enviadoEn: number
} | null = null
/** La próxima publicación tiene que llevar la cola completa. */
let colaPendiente = false
let relojActividad: ReturnType<typeof setInterval> | null = null
let publicacionEnCurso: { version: number; tarea: Promise<void> } | null = null
let tomaEnCurso: { version: number; tarea: Promise<void> } | null = null
let esperaTransferencia: { destino: string; revision: number; trackId: string | null; suena: boolean; resolver: (exito: boolean) => void; timer: ReturnType<typeof setTimeout> } | null = null
const TRANSFERENCIA_MS = 15_000

function filaVigente(s: Estado) {
  const marca = s.escucha?.actualizadoEn
  if (typeof marca !== 'number' || !Number.isFinite(marca)) return false
  const edad = s.ahora + s.offsetMs - marca
  return edad >= -VIGENCIA_ESCUCHA_MS && edad <= VIGENCIA_ESCUCHA_MS
}

function actualizarActividad() {
  const s = store.get(), e = s.escucha, p = getPlaybackState()
  const local = !s.espejo && (!e || e.deviceId === s.deviceId)
  const track = local ? p.manual ?? p.tracks[p.index] : e?.track
  const deviceId = local && track ? s.deviceId : e?.deviceId ?? null
  const nombre = deviceId === s.deviceId ? nombreDispositivo() : e?.deviceNombre || null
  let estado: ActividadEscucha['estado'] = 'inactivo'
  if (track && !hayJam()) {
    if (local) estado = p.wantPlay ? s.sonandoLocal && !p.error ? 'sonando' : 'preparando' : 'pausado'
    else if (s.conexion !== 'conectado' || !duenoPresente(s)) estado = 'desconectado'
    else if (s.presentes === null) estado = 'preparando'
    else if (!e?.suena) estado = 'pausado'
    else estado = filaVigente(s) ? 'sonando' : e.actualizadoEn === null ? 'preparando' : 'desconectado'
  }
  const a = s.actividad
  if (a.deviceId !== deviceId || a.nombre !== nombre || a.estado !== estado) store.set({ actividad: { deviceId, nombre, estado } })
}
store.subscribe(actualizarActividad)

function terminarTransferencia(exito: boolean, error: string | null = null) {
  const espera = esperaTransferencia
  if (!espera) return
  esperaTransferencia = null
  clearTimeout(espera.timer)
  store.set({ transferencia: { destino: espera.destino, estado: exito ? 'confirmada' : 'error', error } })
  espera.resolver(exito)
}
function actualizarIntencionTransferencia(suena: boolean) {
  if (esperaTransferencia) esperaTransferencia.suena = suena
}
function comprobarTransferencia() {
  const espera = esperaTransferencia, s = store.get(), e = s.escucha
  if (espera && e?.deviceId === espera.destino && e.revision > espera.revision && e.track?.id === espera.trackId && e.suena === espera.suena && filaVigente(s)) terminarTransferencia(true)
}
function esperarTransferencia(destino: string, suena: boolean) {
  return new Promise<boolean>(resolver => {
    const timer = setTimeout(() => terminarTransferencia(false, 'El dispositivo no confirmó la reproducción. Verificá que tenga la app abierta y conexión.'), TRANSFERENCIA_MS)
    esperaTransferencia = { destino, revision: store.get().escucha?.revision ?? 0, trackId: store.get().escucha?.track?.id ?? null, suena, resolver, timer }
    store.set({ transferencia: { destino, estado: 'pendiente', error: null } })
  })
}
function errorTransferencia(destino: string, error: string): Promise<boolean> {
  store.set({ transferencia: { destino, estado: 'error', error } })
  return Promise.resolve(false)
}

/** El motor informa actividad real; wantPlay por sí solo nunca confirma audio. */
export function reportarActividadEscucha(sonando: boolean) {
  if (store.get().sonandoLocal !== sonando) store.set({ sonandoLocal: sonando })
  alCambiarPlayback()
}

/* ── El reloj compartido ──────────────────────────────────────────────────── */

function derivada(e: Escucha, offsetMs: number): number {
  if (!e.suena || e.arrancadoEn === null) return e.posicionMs
  const servidorAhora = Date.now() + offsetMs
  return e.posicionMs + Math.max(0, servidorAhora - e.arrancadoEn)
}

/** La derivada, sin pasarse del final de la canción. */
function posicionVisible(e: Escucha, offsetMs: number): number {
  const pos = derivada(e, offsetMs)
  return e.track && e.track.durationMs > 0 ? Math.min(pos, e.track.durationMs) : pos
}

/* ── Quién es quién ───────────────────────────────────────────────────────── */

function duenoPresente(s: Estado): boolean {
  if (!s.escucha) return false
  if (s.presentes === null) return true
  return s.presentes.some((d) => d.deviceId === s.escucha!.deviceId)
}

/** La escucha está sonando de verdad en otro aparato conectado. */
function suenaEnOtro(s: Estado): boolean {
  return (
    s.escucha !== null &&
    s.escucha.deviceId !== s.deviceId &&
    s.escucha.suena &&
    s.conexion === 'conectado' && filaVigente(s) &&
    duenoPresente(s)
  )
}

function nombreDelDueno(s: Estado): string {
  const crudo = s.escucha?.deviceNombre ?? ''
  return crudo ? `«${crudo}»` : 'otro dispositivo'
}

/* ── Volcar al reproductor ────────────────────────────────────────────────── */

/**
 * La escucha remota entra al store de reproducción, entera.
 *
 * La cola llega con el `index` que el dueño publicó por última vez, que puede
 * estar viejo: los avances dentro de la lista no reenvían la cola (sería
 * mandar cientos de canciones por cada cambio de tema). El índice real se
 * reconcilia acá contra `track` — la fila liviana siempre dice qué suena.
 */
function volcar(cola: ColaEscucha | null) {
  const s = store.get()
  const e = s.escucha
  if (!e || !s.deviceId || e.deviceId === s.deviceId) return
  if (hayJam()) return
  const track = e.track
  if (!track) {
    // La escucha se cerró en el aparato dueño: acá tampoco queda nada.
    if (s.espejo) {
      aplicandoRemoto = true
      escuchaSoltar()
      aplicandoRemoto = false
    }
    store.set({ espejo: false })
    ajustarTicker()
    return
  }

  const wantPlay = e.suena && duenoPresente(s) && filaVigente(s)
  const posicion = posicionVisible(e, s.offsetMs)

  aplicandoRemoto = true
  if (cola && cola.tracks.length) {
    const enLista = cola.tracks.findIndex((t) => t.id === track.id)
    escuchaAplicar({
      tracks: cola.tracks,
      // Si lo que suena no está en la lista, era una manual (encolada o de la
      // radio): la lista queda apuntando donde iba a retomar.
      index: enLista !== -1 ? enLista : Math.min(Math.max(cola.index, 0), cola.tracks.length - 1),
      upNext: cola.upNext,
      manual: enLista === -1 ? track : null,
      origin: cola.origin,
      wantPlay,
      positionMs: posicion,
    })
  } else {
    // Sin cola guardada alcanza con la canción: la barra ya puede dibujar.
    escuchaAplicar({
      tracks: [track],
      index: 0,
      upNext: [],
      manual: null,
      origin: null,
      wantPlay,
      positionMs: posicion,
    })
  }
  aplicandoRemoto = false
  store.set({ espejo: true })
  ajustarTicker()
}

/**
 * La barra del espejo avanza por reloj: acá no hay motor que informe la
 * posición. Un `setInterval` lento —jamás `requestAnimationFrame`, ver el
 * incidente de CPU en `MotorAudio`— y solo mientras el espejo tenga algo
 * sonando en un aparato presente.
 */
function ajustarTicker() {
  const s = store.get()
  const debe =
    s.espejo &&
    s.escucha !== null &&
    s.escucha.suena &&
    s.escucha.track !== null &&
    filaVigente(s) && s.conexion === 'conectado' &&
    duenoPresente(s) &&
    !hayJam()
  if (debe && !ticker) {
    ticker = setInterval(() => {
      const a = store.get()
      const e = a.escucha
      if (!a.espejo || !e || !e.track) return
      reportProgress(posicionVisible(e, a.offsetMs), e.track.durationMs)
    }, 1000)
  } else if (!debe && ticker) {
    clearInterval(ticker)
    ticker = null
  }
}

/* ── Aplicar lo que llega ─────────────────────────────────────────────────── */

function aplicarEstado(estado: EscuchaEstado | null, medicion?: { t0: number; t1: number }) {
  const s = store.get()
  if (!estado) return
  if (s.escucha && estado.escucha.revision < s.escucha.revision) return
  const offsetMs = medicion
    ? Math.round(estado.ahora - (medicion.t0 + medicion.t1) / 2)
    : s.offsetMs
  store.set({ escucha: estado.escucha, offsetMs, ahora: Date.now() })
  comprobarTransferencia()

  if (estado.escucha.deviceId === s.deviceId) {
    // La fila es de este mismo aparato: lo local ya es la verdad.
    if (s.espejo) {
      aplicandoRemoto = true
      escuchaTransporte(estado.escucha.suena, posicionVisible(estado.escucha, offsetMs))
      aplicandoRemoto = false
      store.set({ espejo: false, sonandoLocal: false })
    }
    ajustarTicker()
    return
  }
  /*
   * Si acá ya hay música sonando por decisión local —no como espejo—, no se
   * pisa: es la carrera de dos aparatos reclamando a la vez, y se resuelve
   * publicando con la revisión fresca que acaba de llegar. El que reclama
   * último gana, como en cualquier traspaso.
   */
  if (!s.espejo && getPlaybackState().wantPlay) return
  volcar(estado.cola)
}

/** El camino rápido: la fila entera, directa del evento del canal. */
function aplicarFila(fila: Escucha) {
  const s = store.get()
  if (s.escucha && fila.revision <= s.escucha.revision) return
  store.set({ escucha: fila, ahora: Date.now() })
  comprobarTransferencia()

  if (fila.deviceId === s.deviceId) {
    // El eco de lo nuestro, o un reclamo propio confirmado.
    if (s.espejo) {
      // El ACK tardío de un reclamo en pausa no autoriza reproducir la
      // intención heredada del espejo, aunque su espera ya haya vencido.
      aplicandoRemoto = true
      escuchaTransporte(fila.suena, posicionVisible(fila, s.offsetMs))
      aplicandoRemoto = false
      store.set({ espejo: false, sonandoLocal: false })
    }
    ajustarTicker()
    return
  }

  /*
   * Es de otro aparato: este pasa a espejo **ya**. El flag es lo que calla al
   * motor si acá estaba sonando — el traspaso pedido desde otro dispositivo
   * se siente como «allá arrancó, acá se pausó», en ese orden y sin hueco.
   * La cola completa llega con el refetch; mientras tanto, si la canción a la
   * vista ya es la misma, el transporte se ajusta directo del evento.
   */
  store.set({ espejo: true })
  if (fila.track === null) {
    aplicandoRemoto = true
    escuchaSoltar()
    aplicandoRemoto = false
    store.set({ espejo: false })
    ajustarTicker()
    return
  }
  const p = getPlaybackState()
  const actual = p.manual ?? (p.index >= 0 ? (p.tracks[p.index] ?? null) : null)
  if (actual && actual.id === fila.track.id) {
    aplicandoRemoto = true
    escuchaTransporte(
      fila.suena && duenoPresente(store.get()) && filaVigente(store.get()),
      posicionVisible(fila, s.offsetMs),
    )
    aplicandoRemoto = false
  }
  programarRefetch()
  ajustarTicker()
}

function aplicarPresencia(dispositivos: DispositivoPresente[]) {
  const antes = duenoPresente(store.get())
  store.set({ presentes: dispositivos })
  const s = store.get()
  const ahora = duenoPresente(s)
  /*
   * El dueño apareció o se fue: el espejo pasa de correr a quedarse quieto
   * (o al revés) sin esperar ningún evento de la base. Un aparato que se
   * cierra sin despedirse deja la fila diciendo «suena» para siempre; la
   * presencia es lo que convierte eso en una pausa congelada en el segundo
   * en que desapareció.
   */
  if (s.espejo && antes !== ahora && s.escucha?.track) {
    aplicandoRemoto = true
    escuchaTransporte(s.escucha.suena && ahora && filaVigente(s), posicionVisible(s.escucha, s.offsetMs))
    aplicandoRemoto = false
  }
  ajustarTicker()
}

/* ── El ciclo de conexión ─────────────────────────────────────────────────── */

function programarRefetch() {
  if (!uid) return
  if (refetchTimer) clearTimeout(refetchTimer)
  refetchTimer = setTimeout(() => {
    refetchTimer = null
    void refrescar()
  }, REFETCH_MS)
}

async function refrescar() {
  if (!uid) return
  const v = version
  try {
    const t0 = Date.now()
    const estado = await fetchEscuchaEstado()
    const t1 = Date.now()
    if (v !== version) return
    aplicarEstado(estado, { t0, t1 })
  } catch {
    // Error de red: el canal reintenta solo y el próximo evento repide.
  }
}

/**
 * Arranca la escucha compartida. Lo llama el layout con la sesión puesta;
 * idempotente, como `startSession`.
 */
export function iniciarEscucha(): Promise<void> {
  if (inicio) return inicio
  if (desuscribir) return Promise.resolve()
  const v = ++version
  store.set({ conexion: 'conectando' })
  const tarea = conectarEscucha(v)
    .catch(() => { if (v === version) desconectarEscucha() })
    .finally(() => { if (inicio === tarea) inicio = null })
  inicio = tarea
  return tarea
}

async function conectarEscucha(v: number): Promise<void> {
  let userId: string | null = null
  try {
    const { data } = await getSupabase().auth.getSession()
    userId = data.session?.user?.id ?? null
  } catch {
    return
  }
  if (!userId || v !== version) return

  const deviceId = await idDispositivo()
  if (v !== version) return
  uid = userId
  store.set({ deviceId })
  if (v !== version) return
  const sub = suscribirEscucha(userId, deviceId, {
    onSesionControl: sesionControl => { if (v === version) store.set({ sesionControl }) },
    onControlDiscord: mensaje => { if (v === version) recibirControlDiscord?.(mensaje) },
    onFila: (fila) => {
      if (v === version) aplicarFila(fila)
    },
    onPresentes: (dispositivos) => {
      if (v === version) aplicarPresencia(dispositivos)
    },
    // Otro aparato eligió que la música se venga a este: se toma sin preguntar.
    // El pedido lo mandó una persona tocando el selector, así que no hay a quién
    // consultar de este lado.
    onTomar: pedido => {
      if (v === version) void tomarLocal(pedido?.suena, pedido?.revision)
    },
    onConexion: conexion => {
      if (v !== version) return
      store.set({ conexion, ahora: Date.now() })
      if (conexion === 'desconectado') terminarTransferencia(false, 'Se perdió la conexión con tus dispositivos.')
    },
    // Entre que el canal se pidió y quedó suscripto pudo pasar de todo: un
    // estado completo tapa la ventana. Mismo criterio que el Jam y el chat.
    onListo: () => {
      if (v === version) programarRefetch()
    },
  })
  desuscribir = sub.desuscribir
  mandarAImpl = sub.mandarA
  mandarControlDiscordImpl = sub.mandarControlDiscord ?? null
  anunciarDiscordImpl = sub.anunciarDiscord ?? null
  if (discordAnunciado?.userId === uid) anunciarDiscordImpl?.(discordAnunciado.estado)
  await sub.listo
  if (v !== version) return
  soltarPlayback = subscribePlayback(() => { actualizarActividad(); alCambiarPlayback() })
  relojActividad = setInterval(() => {
    store.set({ ahora: Date.now() })
    ajustarTicker()
    const s = store.get()
    if (s.espejo && s.escucha?.track && getPlaybackState().wantPlay && !suenaEnOtro(s)) {
      aplicandoRemoto = true
      escuchaTransporte(false, posicionVisible(s.escucha, s.offsetMs))
      aplicandoRemoto = false
    }
  }, 5000)
  await refrescar()
}

/** Cierre local, para el logout: la sesión ya no puede firmar nada. */
export function desconectarEscucha() {
  version++
  terminarTransferencia(false, 'La sesión de escucha se cerró.')
  if (relojActividad) clearInterval(relojActividad)
  relojActividad = null
  inicio = null
  uid = null
  desuscribir?.()
  desuscribir = null
  mandarAImpl = null
  mandarControlDiscordImpl = null
  anunciarDiscordImpl = null
  discordAnunciado = null
  soltarPlayback?.()
  soltarPlayback = null
  if (refetchTimer) {
    clearTimeout(refetchTimer)
    refetchTimer = null
  }
  if (publicarTimer) {
    clearTimeout(publicarTimer)
    publicarTimer = null
  }
  if (ticker) {
    clearInterval(ticker)
    ticker = null
  }
  publicado = null
  colaPendiente = false
  store.set({ escucha: null, presentes: null, espejo: false, pendiente: null, offsetMs: 0, deviceId: null, conexion: 'desconectado', sesionControl: null, transferencia: null, selectorAbierto: false, sonandoLocal: false })
}

/* La app vuelve al frente: lo que haya pasado mientras tanto, de una vez. */
const appStateSubscription = AppState.addEventListener('change', (estado) => {
  if (estado === 'active' && uid && store.get().escucha) programarRefetch()
})

// Metro ejecuta dispose antes de reevaluar el módulo: no quedan listeners del
// store viejo publicando ni una suscripción activa durante Fast Refresh.
const hot = (module as unknown as { hot?: { dispose: (callback: () => void) => void } }).hot
hot?.dispose(() => {
  desconectarEscucha()
  appStateSubscription.remove()
})

/* ── Publicar: este aparato cuenta lo que hace ────────────────────────────── */

/** La forma de la cola local, para saber si cambió. El índice queda afuera a
 *  propósito: avanzar dentro de la lista no reenvía cientos de canciones —el
 *  espejo reconcilia el índice contra la canción de la fila liviana—. */
function colaSigDe(p: ReturnType<typeof getPlaybackState>): string {
  const ids = (ts: { id: string }[]) => ts.map((t) => t.id).join(',')
  return `${ids(p.tracks)}#${ids(p.upNext)}#${p.manual?.id ?? ''}#${p.origin?.id ?? ''}`
}

/** Dónde debería ir la posición local si nadie la tocó desde lo publicado. */
function posicionEsperada(): number {
  if (!publicado) return 0
  if (!publicado.suena) return publicado.posicionMs
  return publicado.posicionMs + (Date.now() - publicado.enviadoEn)
}

function alCambiarPlayback() {
  if (!uid || aplicandoRemoto) return
  const s = store.get()
  if (!s.deviceId || s.espejo) return
  if (hayJam()) {
    /*
     * Con un Jam andando la escucha personal se calla: la cola es la del Jam
     * y publicarla mostraría en tus otros aparatos una música que no es tuya.
     * Si la fila quedó diciendo que acá sonaba, se cierra una vez — el
     * publicador manda `track` en null estando en Jam (ver `publicarAhora`).
     */
    if (s.escucha && s.escucha.deviceId === s.deviceId && s.escucha.track) {
      programarPublicacion()
    }
    return
  }

  const p = getPlaybackState()
  const actual = p.manual ?? (p.index >= 0 ? (p.tracks[p.index] ?? null) : null)
  const mia = s.escucha !== null && s.escucha.deviceId === s.deviceId

  if (!actual) {
    // La cola se cerró acá siendo dueños: la escucha se cierra para todos.
    if (mia && s.escucha?.track) programarPublicacion()
    return
  }
  /*
   * Un aparato que todavía no es dueño solo publica cuando alguien le dio
   * play **acá**: mirar la cola, restaurarla del disco o recibir un volcado
   * no puede robarle la fila al que está sonando. El play que llega hasta
   * este punto ya pasó por `retener`: o no había conflicto, o el traspaso se
   * decidió — la revisión fresca del espejo es la llave del reclamo.
   */
  if (!mia && !p.wantPlay) return

  const sig = colaSigDe(p)
  const esperandoOtro = esperaTransferencia && esperaTransferencia.destino !== s.deviceId
  const cambio =
    !mia ||
    !publicado ||
    publicado.trackId !== actual.id ||
    publicado.suena !== (p.wantPlay && s.sonandoLocal) ||
    (!esperandoOtro && p.wantPlay && Date.now() - publicado.enviadoEn >= LATIDO_ESCUCHA_MS) ||
    publicado.colaSig !== sig ||
    Math.abs(p.positionMs - posicionEsperada()) > SEEK_UMBRAL_MS
  if (!cambio) return
  if (!publicado || publicado.colaSig !== sig) colaPendiente = true
  programarPublicacion()
}

function programarPublicacion() {
  if (publicarTimer) return
  publicarTimer = setTimeout(() => {
    publicarTimer = null
    void publicarAhora()
  }, PUBLICAR_MS)
}

async function publicarAhora() {
  if (tomaEnCurso?.version === version) return
  if (publicacionEnCurso?.version === version) { programarPublicacion(); return publicacionEnCurso.tarea }
  if (publicarTimer) { clearTimeout(publicarTimer); publicarTimer = null }
  const operacion = { version, tarea: ejecutarPublicacion() }
  publicacionEnCurso = operacion
  try { await operacion.tarea } finally { if (publicacionEnCurso === operacion) publicacionEnCurso = null }
}
async function ejecutarPublicacion() {
  if (!uid) return
  const v = version
  const s = store.get()
  if (!s.deviceId || s.espejo) return

  const p = getPlaybackState()
  // Estando en Jam se publica el cierre: la música de acá dejó de ser tuya.
  const actual = hayJam()
    ? null
    : (p.manual ?? (p.index >= 0 ? (p.tracks[p.index] ?? null) : null))
  const sig = actual ? colaSigDe(p) : ''
  const suena = actual !== null && p.wantPlay && s.sonandoLocal
  const posicion = actual ? p.positionMs : 0

  try {
    const revision = await publicarEscucha({
      deviceId: s.deviceId,
      deviceNombre: nombreDispositivo(),
      revision: s.escucha?.revision ?? 0,
      track: actual,
      suena,
      posicionMs: posicion,
      cola:
        actual && colaPendiente
          ? { tracks: p.tracks, index: p.index, upNext: p.upNext, manual: p.manual, origin: p.origin }
          : null,
    })
    if (v !== version || (store.get().escucha?.revision ?? 0) > revision) return
    publicado = {
      trackId: actual?.id ?? null,
      suena,
      colaSig: sig,
      posicionMs: posicion,
      enviadoEn: Date.now(),
    }
    colaPendiente = false
    // Confirmada por el RPC: la fila es nuestra. El eco trae esta misma
    // revisión y `aplicarFila` lo descarta.
    store.set({
      escucha: {
        deviceId: s.deviceId,
        deviceNombre: nombreDispositivo(),
        track: actual,
        suena,
        posicionMs: posicion,
        arrancadoEn: suena ? Date.now() + store.get().offsetMs : null,
        revision,
        actualizadoEn: Date.now() + store.get().offsetMs,
      },
      espejo: false,
    })
    comprobarTransferencia()
    ajustarTicker()
  } catch {
    if (v !== version) return
    /*
     * «La música quedó en otro dispositivo» —el reclamo perdió la carrera— o
     * un error de red. En los dos casos la respuesta es la misma: pedir la
     * verdad completa. Si otro ganó, el estado nos vuelve como espejo; si fue
     * la red, el próximo cambio local republica.
     */
    publicado = null
    programarRefetch()
  }
}

/* ── El traspaso ──────────────────────────────────────────────────────────── */

/**
 * Una acción de transporte llegó con la escucha en otro aparato.
 *
 * Sonando allá: se retiene y se pregunta — el modal de `Traspaso`. En
 * silencio allá (pausa, o el aparato ausente): se toma sin preguntar, porque
 * retomar tu propia música no interrumpe a nadie, y la acción sigue su curso.
 */
function retener(continuar: () => void): boolean {
  const s = store.get()
  if (!s.espejo || hayJam()) return false
  const e = s.escucha
  if (!e || e.deviceId === s.deviceId) return false
  if (!suenaEnOtro(s)) {
    void tomarLocal(false).then(exito => { if (exito) continuar() })
    return true
  }
  // El nombre va crudo: las comillas las pone quien lo dibuja.
  store.set({
    pendiente: { nombre: s.escucha?.deviceNombre || 'otro dispositivo', continuar },
  })
  return true
}

/** «Reproducir acá»: la escucha se viene, en el segundo por el que iba. */
export async function confirmarTraspaso(): Promise<boolean> {
  const pendiente = store.get().pendiente
  if (!pendiente) return false
  const exito = await tomarLocal(false)
  if (exito && store.get().pendiente === pendiente) {
    store.set({ pendiente: null })
    pendiente.continuar()
  }
  return exito
}

/* ── El selector de dispositivos ──────────────────────────────────────────── */

/**
 * Traer la música a **este** aparato porque otro lo pidió por el canal.
 *
 * Es el traspaso, pero sin modal: del otro lado alguien eligió este dispositivo
 * en el selector, así que no hay nada que preguntar. Como espejo ya se tiene la
 * cola reflejada y la posición, alcanza con dejar de reflejar y reanudar: el
 * `resumePlayback` arranca el audio acá y, al cambiar el estado, se publica la
 * escucha con este `deviceId` —reclamando el lock—, con lo que el aparato que
 * venía sonando pasa a ser el espejo. Es el mismo mecanismo del traspaso a
 * mano, disparado desde afuera.
 */
async function tomarLocal(intencion?: boolean, revisionEsperada?: number): Promise<boolean> {
  const s = store.get(), destino = s.deviceId ?? ''
  if (tomaEnCurso?.version === version) return errorTransferencia(destino, 'Todavía hay una operación pendiente. Esperá su respuesta antes de volver a intentar.')
  if (esperaTransferencia) return false
  if (!destino || !uid || s.conexion !== 'conectado') return errorTransferencia(destino, 'Conectate para cambiar de dispositivo.')
  if (hayJam()) return errorTransferencia(destino, 'Salí del Jam para cambiar la escucha personal.')
  if (!s.escucha?.track) return errorTransferencia(destino, 'Elegí una canción antes de cambiar de dispositivo.')
  if (s.escucha.deviceId === destino) return true
  let suena = intencion ?? s.escucha.suena
  const trackIdEsperado = s.escucha.track.id
  const resultado = esperarTransferencia(destino, suena), v = version, operacion = esperaTransferencia
  const tarea = (async () => { try {
    if (publicacionEnCurso?.version === v) await publicacionEnCurso.tarea
    if (v !== version || esperaTransferencia !== operacion) return
    const t0 = Date.now(), fresca = await fetchEscuchaEstado()
    if (v !== version || esperaTransferencia !== operacion) return
    if (!fresca?.escucha.track) throw new Error('Ya no hay una canción para transferir.')
    if (revisionEsperada !== undefined && fresca.escucha.revision !== revisionEsperada) throw new Error('La reproducción cambió después del pedido. Volvé a elegir el dispositivo.')
    if (fresca.escucha.track.id !== trackIdEsperado) throw new Error('La canción cambió. Volvé a elegir el dispositivo.')
    if (intencion === undefined) {
      suena = fresca.escucha.suena
      actualizarIntencionTransferencia(suena)
    }
    aplicarEstado(fresca, { t0, t1: Date.now() })
    const p = getPlaybackState(), track = fresca.escucha.track
    const posicion = posicionVisible(fresca.escucha, store.get().offsetMs)
    const revision = await publicarEscucha({ deviceId: destino, deviceNombre: nombreDispositivo(), revision: fresca.escucha.revision,
      track, suena: false, posicionMs: posicion,
      cola: fresca.cola ?? { tracks: p.tracks, index: p.index, upNext: p.upNext, manual: p.manual, origin: p.origin } })
    if (v !== version || esperaTransferencia !== operacion) return
    if ((store.get().escucha?.revision ?? 0) > revision && store.get().escucha?.deviceId !== destino) throw new Error('Otro dispositivo tomó la reproducción. Volvé a intentar.')
    store.set({ escucha: { ...fresca.escucha, deviceId: destino, deviceNombre: nombreDispositivo(), revision,
      suena: false, posicionMs: posicion, arrancadoEn: null, actualizadoEn: Date.now() + store.get().offsetMs }, espejo: false, sonandoLocal: false })
    aplicandoRemoto = true
    escuchaTransporte(suena, posicion)
    aplicandoRemoto = false
    if (suena) resumePlayback()
    comprobarTransferencia()
    ajustarTicker()
  } catch (error) {
    if (v === version && esperaTransferencia === operacion) terminarTransferencia(false, error instanceof Error ? error.message : 'No se pudo traer la reproducción.')
  } })()
  const toma = { version: v, tarea }
  tomaEnCurso = toma
  void tarea.finally(() => { if (tomaEnCurso === toma) tomaEnCurso = null })
  return resultado
}

/** Espera al dueño confirmado; el ACK del broadcast sólo confirma el envío. */
export async function mandarEscuchaA(deviceId: string): Promise<boolean> {
  const s = store.get()
  if (esperaTransferencia) return false
  if (deviceId === s.deviceId) return traerEscuchaAca()
  if (!uid || s.conexion !== 'conectado' || !mandarAImpl) return errorTransferencia(deviceId, 'Conectate para cambiar de dispositivo.')
  if (hayJam()) return errorTransferencia(deviceId, 'Salí del Jam para cambiar la escucha personal.')
  if (!s.escucha?.track) return errorTransferencia(deviceId, 'Elegí una canción antes de cambiar de dispositivo.')
  if (!s.presentes?.some(d => d.deviceId === deviceId)) return errorTransferencia(deviceId, 'Ese dispositivo ya no está conectado.')
  if (s.escucha.deviceId === deviceId) return true
  const suena = s.escucha.deviceId === s.deviceId ? getPlaybackState().wantPlay : s.escucha.suena
  const resultado = esperarTransferencia(deviceId, suena), operacion = esperaTransferencia
  const enviar = mandarAImpl
  const v = version
  void (async () => {
    const p = getPlaybackState(), actual = p.manual ?? p.tracks[p.index]
    if (s.escucha?.deviceId === s.deviceId && actual) {
      if (publicacionEnCurso?.version === v) await publicacionEnCurso.tarea
      if (esperaTransferencia !== operacion || v !== version) return
      await publicarAhora()
      if (esperaTransferencia !== operacion || v !== version) return
      const vigente = store.get().escucha, playback = getPlaybackState()
      if (vigente?.deviceId !== s.deviceId || vigente.revision <= s.escucha.revision) throw new Error('No se pudo confirmar la canción antes de transferirla.')
      if ((playback.manual ?? playback.tracks[playback.index])?.id !== s.escucha.track?.id || playback.wantPlay !== suena) throw new Error('La reproducción cambió. Volvé a elegir el dispositivo.')
    }
    if (esperaTransferencia !== operacion || v !== version) return
    await enviar(deviceId, suena, store.get().escucha?.revision)
    if (esperaTransferencia === operacion) programarRefetch()
  })().catch(error => {
    if (esperaTransferencia === operacion) terminarTransferencia(false, error instanceof Error ? error.message : 'No se pudo enviar la reproducción.')
  })
  return resultado
}

export function traerEscuchaAca(): Promise<boolean> { return tomarLocal() }

export function abrirSelectorDispositivos() {
  store.set({ selectorAbierto: true, ...(!esperaTransferencia ? { transferencia: null } : {}) })
  if (!desuscribir) void iniciarEscucha()
  else programarRefetch()
}

export function cerrarSelectorDispositivos() {
  store.set({ selectorAbierto: false })
}

/** «Seguir allá»: no pasa nada — que es exactamente lo que se pidió. */
export function cancelarTraspaso() {
  if (esperaTransferencia) return
  store.set({ pendiente: null })
}

registerEscucha({
  retener,
  espejo: () => store.get().espejo && !hayJam(),
  nombre: () => nombreDelDueno(store.get()),
})

/* ── Hooks ────────────────────────────────────────────────────────────────── */

export const useEscuchaEspejo = () => useStore(store, (s) => s.espejo && !hayJam())
/** El nombre del aparato donde suena, o null si este no es un espejo. */
export const useEscuchaEspejoNombre = () =>
  useStore(store, (s) =>
    s.espejo && s.escucha ? s.escucha.deviceNombre || 'otro dispositivo' : null,
  )
export const useTraspasoPendiente = () => useStore(store, (s) => s.pendiente)
export const useSelectorDispositivos = () => useStore(store, (s) => s.selectorAbierto)

/**
 * Los dispositivos de la cuenta conectados ahora, para el selector.
 *
 * Tres hooks primitivos en vez de uno que arme un objeto: un selector que
 * devolviera `{ lista, actual, ... }` nuevo en cada lectura haría re-render sin
 * fin —`useSyncExternalStore` lo leería como cambio constante—. Así cada uno
 * devuelve una referencia estable (la lista tal como está en el store, o un
 * string) y el menú compone la vista.
 */
export const useDispositivos = (): DispositivoPresente[] =>
  useStore(store, (s) => s.presentes ?? VACIO)
/** El id de este aparato, para marcarse a sí mismo en el selector. */
export const useEsteDispositivo = () => useStore(store, (s) => s.deviceId)
/** El aparato que reproduce ahora mismo (dueño del lock), o null. */
export const useDispositivoQueSuena = () =>
  useStore(store, (s) => s.actividad.estado === 'sonando' ? s.actividad.deviceId : null)
export const useDispositivoSeleccionado = () => useStore(store, s => s.escucha?.deviceId ?? null)
export const useConexionEscucha = () => useStore(store, s => s.conexion)
export const useTransferenciaEscucha = () => useStore(store, s => s.transferencia)
export const useActividadEscucha = () => useStore(store, s => s.actividad)

/** Una lista vacía **estable**: devolver `[]` nuevo cada vez rompería el hook. */
const VACIO: DispositivoPresente[] = []


/** Snapshot privado de la cuenta para adaptadores con consentimiento explícito.
 * La sesión se verifica en el adaptador; este método no publica nada por sí solo.
 */
export function leerEscuchaParaIntegraciones() {
  const s = store.get(), p = getPlaybackState(), ahora = Date.now()
  // Un Jam también puede sonar en esta PC. Sólo el motor confirma escucha:
  // un participante que controla otra salida no inventa actividad local.
  const local = hayJam() || (!s.espejo && (!s.escucha || s.escucha.deviceId === s.deviceId))
  if (local) {
    const track = p.manual ?? p.tracks[p.index]
    if (!track || !p.wantPlay || !s.sonandoLocal || p.error) return null
    return { track, sonando: true, posicionMs: p.positionMs, actualizadoEn: ahora }
  }
  const e = s.escucha
  if (!e?.track || !e.suena || s.conexion !== 'conectado' || !s.presentes || !duenoPresente(s) || !filaVigente(s) || e.actualizadoEn === null) return null
  return { track: e.track, sonando: true, posicionMs: posicionVisible(e, s.offsetMs), actualizadoEn: e.actualizadoEn - s.offsetMs }
}
export const suscribirActividadParaIntegraciones = (fn: () => void) => store.subscribe(fn)


/** Transporte efímero sobre el mismo canal privado de la cuenta. */
export function leerConexionDiscord() {
  const s = store.get()
  return { userId: uid, deviceId: s.deviceId, sesion: s.sesionControl, conexion: s.conexion, presentes: s.presentes ?? VACIO }
}
export function anunciarDiscordEnDispositivos(userId: string, estado: EstadoDiscordRemoto | null) {
  discordAnunciado = estado ? { userId, estado } : null
  if (uid === userId) anunciarDiscordImpl?.(estado)
}
export function mandarControlDiscord(mensaje: MensajeControlDiscord): Promise<void> {
  if (!mandarControlDiscordImpl || store.get().conexion !== 'conectado') return Promise.reject(new Error('Conectate para controlar Discord en tu PC.'))
  return mandarControlDiscordImpl(mensaje)
}
export function suscribirControlDiscord(callback: (mensaje: unknown) => void) {
  recibirControlDiscord = callback
  return () => { if (recibirControlDiscord === callback) recibirControlDiscord = null }
}
