import { identidadControlDiscord, presenciaControlDiscord, type EstadoDiscordRemoto, type MensajeControlDiscord, type PresenciaControlDiscord } from './protocoloDiscordRemoto'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabase } from '../lib/supabase'
import { nombreDispositivo } from '../lib/dispositivo'
import { LATIDO_ESCUCHA_MS, VIGENCIA_ESCUCHA_MS } from './lecturaViva'
import type { PlaylistTrack } from './playlists'

export type { PlaylistTrack }

/**
 * La escucha de la cuenta por dentro: los pedidos y el canal.
 *
 * Mismo papel que `services/jam` para el Jam: acá no vive ninguna decisión —
 * eso es de `state/escucha` para el cliente y de la migración para la verdad—.
 * Este archivo solo sabe pedirle cosas al servidor (un único intent:
 * `escucha_publicar`) y enterarse de lo que pasó (el canal con presencia).
 */

export type Escucha = {
  deviceId: string
  deviceNombre: string
  /** Lo que suena, entero, para dibujar sin pedir nada más. Null: nada. */
  track: PlaylistTrack | null
  suena: boolean
  posicionMs: number
  /** Instante del **reloj del servidor** (época ms) en que arrancó; null en pausa. */
  arrancadoEn: number | null
  /** Reloj lógico: si llega algo con una revisión menor a la vista, se tira. */
  revision: number
  actualizadoEn: number | null
}

/**
 * La cola completa, con la forma exacta del estado de reproducción local.
 *
 * Va opaca a propósito: el servidor la guarda y la devuelve sin entenderla,
 * así el traspaso restaura **exactamente** lo que había — la lista, lo
 * encolado a mano, la canción manual sonando y de qué lista salió todo.
 */
export type ColaEscucha = {
  tracks: PlaylistTrack[]
  index: number
  upNext: PlaylistTrack[]
  manual: PlaylistTrack | null
  origin: { id: string; name: string } | null
}

export type EscuchaEstado = {
  escucha: Escucha
  cola: ColaEscucha | null
  /** now() del servidor en época ms, para medir el desfasaje de reloj. */
  ahora: number
}

/* ── De la fila al tipo ───────────────────────────────────────────────────── */

function texto(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function numero(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function epocaMs(v: unknown): number | null {
  if (typeof v !== 'string') return null
  const ms = Date.parse(v)
  return Number.isNaN(ms) ? null : ms
}

type Fila = Record<string, unknown>

/**
 * Una canción del jsonb, validada: sin audio o sin id no se puede reproducir.
 *
 * Se exporta porque las reacciones leen el mismo jsonb —la canción que quedó
 * congelada salió de esta misma fila— y validarlo dos veces con dos criterios
 * era la forma de que un día una pantalla dibujara algo que la otra descarta.
 */
export function cancionDeFila(v: unknown): PlaylistTrack | null {
  const r = v as Fila | null
  if (!r || typeof r.audioPath !== 'string' || r.audioPath.length === 0) return null
  if (typeof r.videoId !== 'string' || r.videoId.length === 0) return null
  return {
    id: texto(r.id) || r.videoId,
    videoId: r.videoId,
    title: texto(r.title),
    artist: texto(r.artist),
    artistId: typeof r.artistId === 'string' && r.artistId ? r.artistId : null,
    artworkUrl: texto(r.artworkUrl),
    artworkPath: typeof r.artworkPath === 'string' && r.artworkPath ? r.artworkPath : null,
    audioPath: r.audioPath,
    durationMs: numero(r.durationMs),
    truePeak: typeof r.truePeak === 'number' ? r.truePeak : undefined,
  }
}

/** La fila de `escuchas`, venga del estado completo o de un evento del canal. */
export function escuchaFromRow(row: unknown): Escucha | null {
  const r = row as Fila | null
  if (!r || typeof r.device_id !== 'string') return null
  return {
    deviceId: r.device_id,
    deviceNombre: texto(r.device_nombre),
    track: cancionDeFila(r.track),
    suena: r.suena === true,
    posicionMs: numero(r.posicion_ms),
    arrancadoEn: epocaMs(r.arrancado_en),
    revision: numero(r.revision),
    actualizadoEn: epocaMs(r.updated_at),
  }
}

function colaFrom(v: unknown): ColaEscucha | null {
  const r = v as Fila | null
  if (!r || !Array.isArray(r.tracks)) return null
  const origin = r.origin as Fila | null
  const manual = cancionDeFila(r.manual)
  return {
    tracks: r.tracks.map(cancionDeFila).filter((t): t is PlaylistTrack => t !== null),
    index: numero(r.index),
    upNext: Array.isArray(r.upNext)
      ? r.upNext.map(cancionDeFila).filter((t): t is PlaylistTrack => t !== null)
      : [],
    manual,
    origin:
      origin && typeof origin.id === 'string'
        ? { id: origin.id, name: texto(origin.name) }
        : null,
  }
}

function estadoFromJson(data: unknown): EscuchaEstado | null {
  const d = data as Fila | null
  if (!d) return null
  const escucha = escuchaFromRow(d.escucha)
  if (!escucha) return null
  return {
    escucha,
    cola: colaFrom(d.cola),
    ahora: numero(d.ahora) || Date.now(),
  }
}

/* ── Los pedidos ──────────────────────────────────────────────────────────── */

function cancionAJson(t: PlaylistTrack) {
  return {
    id: t.id,
    videoId: t.videoId,
    title: t.title,
    artist: t.artist,
    artistId: t.artistId,
    artworkUrl: t.artworkUrl,
    artworkPath: t.artworkPath,
    audioPath: t.audioPath,
    durationMs: Math.round(t.durationMs),
    truePeak: t.truePeak ?? null,
  }
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await getSupabase().rpc(fn, args)
  if (error) throw new Error(error.message)
  return data
}

/**
 * Publicar la verdad de este dispositivo. Es el único intent de la escucha:
 * la misma llamada sirve para el evento chico (play, pausa, salto), para el
 * cambio de cola (`cola` no nula) y para el traspaso — la revisión al día es
 * la llave que deja reclamar una fila que era de otro. `track` en null cierra
 * la escucha para todos.
 */
export async function publicarEscucha(a: {
  deviceId: string
  deviceNombre: string
  revision: number
  track: PlaylistTrack | null
  suena: boolean
  posicionMs: number
  cola?: ColaEscucha | null
}): Promise<number> {
  const data = await rpc('escucha_publicar', {
    p_device_id: a.deviceId,
    p_device_nombre: a.deviceNombre,
    p_revision: a.revision,
    p_track: a.track ? cancionAJson(a.track) : null,
    p_suena: a.suena,
    p_posicion_ms: Math.max(0, Math.round(a.posicionMs)),
    p_cola: a.cola
      ? {
          tracks: a.cola.tracks.map(cancionAJson),
          index: a.cola.index,
          upNext: a.cola.upNext.map(cancionAJson),
          manual: a.cola.manual ? cancionAJson(a.cola.manual) : null,
          origin: a.cola.origin,
        }
      : null,
  })
  if (typeof data !== 'number' || !Number.isFinite(data) || data <= 0) throw new Error('El servidor no confirmó la reproducción.')
  return data
}

export async function fetchEscuchaEstado(): Promise<EscuchaEstado | null> {
  return estadoFromJson(await rpc('escucha_estado', {}))
}

/* ── El canal ─────────────────────────────────────────────────────────────── */

export type Unsubscribe = () => void

/**
 * El canal de la escucha: la fila propia más presencia.
 *
 * Un cambio en `escuchas` trae la fila **entera** (REPLICA IDENTITY FULL) y
 * se aplica directo del evento — es el transporte y no puede esperar un viaje
 * extra. La cola grande no viaja por acá: quien la necesita repide
 * `escucha_estado`, con el mismo criterio de «al reconectar, el estado
 * completo tapa la ventana» del Jam y del chat.
 *
 * La presencia dice qué **dispositivos** de la cuenta están conectados ahora:
 * es lo que distingue «la computadora está sonando» de «la computadora quedó
 * diciendo que sonaba y se cerró» — sin ella el espejo mostraría una barra
 * corriendo contra un aparato apagado.
 */
/** Un dispositivo presente: su id y el nombre con que se anunció. */
export type DispositivoPresente = { deviceId: string; nombre: string; controlDiscord?: PresenciaControlDiscord }

/**
 * Lo que el canal deja mandar a un aparato puntual: «tomá vos la reproducción».
 *
 * Es lo que convierte la escucha de *pull* a *push*: en vez de ir al otro
 * aparato y traer la música, desde acá se le pide que la tome él. El `broadcast`
 * del canal alcanza —es efímero y no necesita fila en la base—, y cada
 * dispositivo se queda solo con el mensaje que lo nombra a él.
 */
export type Handoff = { destino: string; suena?: boolean; revision?: number; requestId?: string }

// Vive en el cliente (no en el módulo): Fast Refresh puede reiniciar este
// archivo mientras Supabase todavía conserva sus canales por nombre.
const CLAVE_CANALES = Symbol.for('dmusic.escucha.canales')
type ConexionEscucha = { cerrar: () => Promise<void> }

export function suscribirEscucha(
  userId: string,
  deviceId: string,
  hooks: {
    onFila: (escucha: Escucha) => void
    onPresentes: (dispositivos: DispositivoPresente[]) => void
    /** Otro aparato pidió que **este** tome la reproducción. */
    onTomar: (pedido?: Handoff) => void
    onConexion?: (estado: 'conectando' | 'conectado' | 'desconectado') => void
    onSesionControl?: (sesion: string | null) => void
    onControlDiscord?: (mensaje: unknown) => void
    /** El canal quedó suscripto: repedir el estado completo. */
    onListo: () => void
  },
): { desuscribir: Unsubscribe; mandarA: (destino: string, suena?: boolean, revision?: number) => Promise<void>; listo: Promise<void>; mandarControlDiscord: (mensaje: MensajeControlDiscord) => Promise<void>; anunciarDiscord: (estado: EstadoDiscordRemoto | null) => void } {
  const supabase = getSupabase()
  const cliente = supabase as typeof supabase & { [CLAVE_CANALES]?: Map<string, ConexionEscucha> }
  const conexiones = cliente[CLAVE_CANALES] ??= new Map()
  const topic = `escucha:${userId}`
  const anterior = conexiones.get(topic)
  const cierreAnterior = anterior?.cerrar()
  let vivo = true
  let channel: RealtimeChannel | null = null
  let cierre: Promise<void> | null = null
  let conectado = false
  let sesionControl: string | null = null
  let discord: EstadoDiscordRemoto | null = null
  const anunciar = () => {
    if (!vivo || !conectado || !channel || !sesionControl) return
    void channel.track({ en: Date.now(), nombre: nombreDispositivo(), controlDiscord: { version: 1, sesion: sesionControl, ...(discord ? { discord } : {}) } }).catch(() => {})
    hooks.onPresentes(leerPresentes(channel))
  }
  let latido: ReturnType<typeof setInterval> | null = null
  const recibidos = new Set<string>()
  const vistas = new Map<string, { marca: unknown; cuando: number }>()
  const detenerLatido = () => { if (latido) clearInterval(latido); latido = null }
  hooks.onConexion?.('conectando')

  /* La presencia de cada key trae la metadata que se publicó con `track`; de
     ahí sale el nombre. Se toma el primer registro de cada key —un aparato es
     una sola presencia—. */
  const leerPresentes = (ch: RealtimeChannel): DispositivoPresente[] => {
    const presentes: DispositivoPresente[] = []
    const estado = ch.presenceState<{ nombre?: string; en?: number; controlDiscord?: unknown }>()
    for (const [id, metas] of Object.entries(estado)) {
      const meta = [...metas].sort((a, b) => (b.en ?? 0) - (a.en ?? 0))[0]
      if (!meta) continue
      const vista = vistas.get(id)
      // Medir edad desde la recepción evita comparar relojes de dos aparatos.
      if (!vista || vista.marca !== meta.en) vistas.set(id, { marca: meta.en, cuando: Date.now() })
      if (Date.now() - vistas.get(id)!.cuando <= VIGENCIA_ESCUCHA_MS) presentes.push({ deviceId: id, nombre: meta.nombre || 'otro dispositivo', ...(presenciaControlDiscord(meta.controlDiscord) ? { controlDiscord: presenciaControlDiscord(meta.controlDiscord) } : {}) })
    }
    for (const id of vistas.keys()) if (!(id in estado)) vistas.delete(id)
    return presentes
  }

  const listo = Promise.resolve().then(async () => {
    await cierreAnterior
    if (!vivo) return
    // Recupera también un canal creado antes de cargar esta versión del módulo.
    // Nunca se añaden callbacks a una instancia que ya está suscripta.
    for (const viejo of supabase.getChannels().filter((c) => c.topic === `realtime:${topic}`)) {
      await supabase.removeChannel(viejo)
    }
    if (!vivo) return
    if (supabase.getChannels().some((c) => c.topic === `realtime:${topic}`)) {
      throw new Error('No se pudo cerrar el canal anterior de escucha.')
    }
    channel = supabase.channel(topic, { config: { private: true, presence: { key: deviceId }, broadcast: { ack: true } } })
    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'escuchas', filter: `user_id=eq.${userId}` },
        (payload) => {
          if (!vivo) return
          const escucha = escuchaFromRow(payload.new)
          if (escucha) hooks.onFila(escucha)
        },
      )
      .on('presence', { event: 'sync' }, () => {
        if (vivo && channel) hooks.onPresentes(leerPresentes(channel))
      })
      .on('broadcast', { event: 'tomar' }, ({ payload }) => {
        const pedido = payload as Handoff
        if (!vivo || !conectado || pedido?.destino !== deviceId) return
        if (pedido.revision !== undefined && (!Number.isSafeInteger(pedido.revision) || pedido.revision < 0)) return
        if (pedido.requestId) {
          if (recibidos.has(pedido.requestId)) return
          recibidos.add(pedido.requestId)
          if (recibidos.size > 64) recibidos.delete(recibidos.values().next().value!)
        }
        hooks.onTomar(pedido)
      })
      .on('broadcast', { event: 'discord-control-v1' }, ({ payload }) => {
        if (vivo && conectado) hooks.onControlDiscord?.(payload)
      })
      .subscribe((status) => {
        if (!vivo) return
        conectado = status === 'SUBSCRIBED'
        detenerLatido()
        sesionControl = conectado ? identidadControlDiscord() : null
        hooks.onSesionControl?.(sesionControl)
        hooks.onConexion?.(conectado ? 'conectado' : 'desconectado')
        if (conectado) {
          anunciar()
          latido = setInterval(anunciar, LATIDO_ESCUCHA_MS)
          hooks.onListo()
        } else { vistas.clear(); hooks.onPresentes([]) }
      })
  })
  const conexion: ConexionEscucha = {
    cerrar: () => {
      conectado = false
      detenerLatido()
      vivo = false // Ignorar eventos tardíos antes de esperar el leave de la red.
      cierre ??= listo.catch(() => {}).then(async () => {
        const viejo = channel
        channel = null
        if (viejo) await supabase.removeChannel(viejo)
        if (conexiones.get(topic) === conexion) conexiones.delete(topic)
      })
      return cierre
    },
  }
  conexiones.set(topic, conexion)

  return {
    listo,
    anunciarDiscord: estado => { discord = estado; anunciar() },
    mandarControlDiscord: async mensaje => {
      if (!vivo || !conectado || !channel || mensaje.origen !== deviceId || mensaje.origenSesion !== sesionControl) throw new Error('La conexión con tus dispositivos cambió.')
      const resultado = await channel.send({ type: 'broadcast', event: 'discord-control-v1', payload: mensaje })
      if (!vivo || !conectado || mensaje.origenSesion !== sesionControl || resultado !== 'ok') throw new Error('No se pudo enviar el pedido a esa computadora.')
    },
    desuscribir: () => { void conexion.cerrar().catch(() => {}) },
    mandarA: async (destino: string, suena?: boolean, revision?: number) => {
      if (!vivo || !conectado || !channel) throw new Error('La conexión con tus dispositivos no está disponible.')
      const resultado = await channel.send({ type: 'broadcast', event: 'tomar', payload: { destino, suena, revision, requestId: `${deviceId}:${Date.now()}:${Math.random().toString(36).slice(2)}` } })
      if (!vivo || !conectado || resultado !== 'ok') throw new Error('No se pudo enviar la reproducción. Volvé a intentar.')
    },
  }
}
