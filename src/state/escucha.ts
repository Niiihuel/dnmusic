import { AppState } from 'react-native'
import { getSupabase } from '../lib/supabase'
import { idDispositivo, nombreDispositivo } from '../lib/dispositivo'
import {
  fetchEscuchaEstado,
  publicarEscucha,
  suscribirEscucha,
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

type Estado = {
  escucha: Escucha | null
  /**
   * Dispositivos de la cuenta conectados ahora (presencia). `null` hasta la
   * primera sincronización: en esa ventana se asume que el dueño está — la
   * duda no puede arrancar audio local por encima de una escucha que sí suena.
   */
  presentes: string[] | null
  /** Reloj del servidor menos reloj local, medido como en el Jam. */
  offsetMs: number
  deviceId: string | null
  /** Este aparato refleja la escucha de otro: dibuja todo, no suena nada. */
  espejo: boolean
  /** El traspaso preguntando; null sin modal a la vista. */
  pendiente: Pendiente | null
}

const store = createStore<Estado>({
  escucha: null,
  presentes: null,
  offsetMs: 0,
  deviceId: null,
  espejo: false,
  pendiente: null,
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
  return s.presentes.includes(s.escucha.deviceId)
}

/** La escucha está sonando de verdad en otro aparato conectado. */
function suenaEnOtro(s: Estado): boolean {
  return (
    s.escucha !== null &&
    s.escucha.deviceId !== s.deviceId &&
    s.escucha.suena &&
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

  const wantPlay = e.suena && duenoPresente(s)
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
  store.set({ escucha: estado.escucha, offsetMs })

  if (estado.escucha.deviceId === s.deviceId) {
    // La fila es de este mismo aparato: lo local ya es la verdad.
    if (s.espejo) store.set({ espejo: false })
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
  store.set({ escucha: fila })

  if (fila.deviceId === s.deviceId) {
    // El eco de lo nuestro, o un reclamo propio confirmado.
    if (s.espejo) store.set({ espejo: false })
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
      fila.suena && duenoPresente(store.get()),
      posicionVisible(fila, s.offsetMs),
    )
    aplicandoRemoto = false
  }
  programarRefetch()
  ajustarTicker()
}

function aplicarPresencia(ids: string[]) {
  const antes = duenoPresente(store.get())
  store.set({ presentes: ids })
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
    escuchaTransporte(s.escucha.suena && ahora, posicionVisible(s.escucha, s.offsetMs))
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
export async function iniciarEscucha(): Promise<void> {
  if (desuscribir) return
  let userId: string | null = null
  try {
    const { data } = await getSupabase().auth.getSession()
    userId = data.session?.user?.id ?? null
  } catch {
    return
  }
  if (!userId || desuscribir) return

  const deviceId = await idDispositivo()
  const v = ++version
  uid = userId
  store.set({ deviceId })
  desuscribir = suscribirEscucha(userId, deviceId, {
    onFila: (fila) => {
      if (v === version) aplicarFila(fila)
    },
    onPresentes: (ids) => {
      if (v === version) aplicarPresencia(ids)
    },
    // Entre que el canal se pidió y quedó suscripto pudo pasar de todo: un
    // estado completo tapa la ventana. Mismo criterio que el Jam y el chat.
    onListo: () => {
      if (v === version) programarRefetch()
    },
  })
  soltarPlayback = subscribePlayback(alCambiarPlayback)
  await refrescar()
}

/** Cierre local, para el logout: la sesión ya no puede firmar nada. */
export function desconectarEscucha() {
  version++
  uid = null
  desuscribir?.()
  desuscribir = null
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
  store.set({ escucha: null, presentes: null, espejo: false, pendiente: null, offsetMs: 0 })
}

/* La app vuelve al frente: lo que haya pasado mientras tanto, de una vez. */
AppState.addEventListener('change', (estado) => {
  if (estado === 'active' && uid && store.get().escucha) programarRefetch()
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
  const cambio =
    !mia ||
    !publicado ||
    publicado.trackId !== actual.id ||
    publicado.suena !== p.wantPlay ||
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
  const suena = actual !== null && p.wantPlay
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
    if (v !== version) return
    publicado = {
      trackId: actual?.id ?? null,
      suena,
      colaSig: sig,
      posicionMs: posicion,
      enviadoEn: Date.now(),
    }
    colaPendiente = false
    // Optimista: la fila es nuestra. El eco del canal trae esta misma
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
      },
      espejo: false,
    })
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
    store.set({ espejo: false })
    ajustarTicker()
    return false
  }
  // El nombre va crudo: las comillas las pone quien lo dibuja.
  store.set({
    pendiente: { nombre: s.escucha?.deviceNombre || 'otro dispositivo', continuar },
  })
  return true
}

/** «Reproducir acá»: la escucha se viene, en el segundo por el que iba. */
export function confirmarTraspaso() {
  const s = store.get()
  const pendiente = s.pendiente
  if (!pendiente) return
  store.set({ pendiente: null, espejo: false })
  ajustarTicker()
  pendiente.continuar()
}

/** «Seguir allá»: no pasa nada — que es exactamente lo que se pidió. */
export function cancelarTraspaso() {
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
