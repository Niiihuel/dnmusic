import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabase } from '../lib/supabase'
import type { PlaylistTrack } from './playlists'

/**
 * El Jam por dentro: los pedidos y el canal.
 *
 * Acá no vive ninguna decisión — eso es de `state/jam` para el cliente y de la
 * migración para la verdad. Este archivo solo sabe dos cosas: cómo pedirle
 * algo al servidor (los RPCs, que son **intents**: nunca viaja un estado
 * entero) y cómo enterarse de lo que pasó (el canal). Mismo papel que
 * `services/messages` para el chat.
 */

export type JamPermisos = {
  agregan: boolean
  controlan: boolean
  saltan: boolean
}

export type Jam = {
  id: string
  code: string
  hostId: string
  status: 'activo' | 'terminado'
  permisos: JamPermisos
  itemActual: string | null
  suena: boolean
  posicionMs: number
  /** Instante del **reloj del servidor** (época ms) en que arrancó; null en pausa. */
  arrancadoEn: number | null
  /** Reloj lógico: si llega algo con una revisión menor a la vista, se tira. */
  revision: number
}

export type JamMiembro = {
  userId: string
  rol: 'host' | 'invitado'
  /** Dónde escucha: su dispositivo sincronizado, o solo controla el del host. */
  salida: 'propia' | 'host'
  username: string
  displayName: string | null
  avatarPath: string | null
}

/**
 * Un ítem de la cola compartida.
 *
 * Tiene la misma forma que `PlaylistTrack` a propósito: así la cola del Jam
 * entra en `state/playback` sin conversión y toda la interfaz que ya dibuja
 * colas dibuja esta. El `id` es el del ítem —no el de una canción de lista—
 * porque la misma canción puede estar dos veces.
 */
export type JamItem = PlaylistTrack & {
  agregadoPor: string
  posicion: number
}

export type JamEstado = {
  jam: Jam
  miembros: JamMiembro[]
  cola: JamItem[]
  /** now() del servidor en época ms, para medir el desfasaje de reloj. */
  ahora: number
}

export type VistaJam = {
  id: string
  code: string
  hostUsername: string
  hostDisplayName: string | null
  hostAvatarPath: string | null
  cuantos: number
}

/* ── De la fila al tipo ───────────────────────────────────────────────────── */

function texto(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function textoONull(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

function numero(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** Fecha ISO del servidor → época ms; null si no hay o no se entiende. */
function epocaMs(v: unknown): number | null {
  if (typeof v !== 'string') return null
  const ms = Date.parse(v)
  return Number.isNaN(ms) ? null : ms
}

type Fila = Record<string, unknown>

/** La fila de `jams`, venga del estado completo o de un evento del canal. */
export function jamFromRow(row: unknown): Jam | null {
  const r = row as Fila | null
  if (!r || typeof r.id !== 'string' || typeof r.code !== 'string') return null
  return {
    id: r.id,
    code: r.code,
    hostId: texto(r.host_id),
    status: r.status === 'terminado' ? 'terminado' : 'activo',
    permisos: {
      agregan: r.invitados_agregan !== false,
      controlan: r.invitados_controlan !== false,
      saltan: r.invitados_saltan !== false,
    },
    itemActual: textoONull(r.item_actual),
    suena: r.suena === true,
    posicionMs: numero(r.posicion_ms),
    arrancadoEn: epocaMs(r.arrancado_en),
    revision: numero(r.revision),
  }
}

function miembroFromRow(row: unknown): JamMiembro[] {
  const r = row as Fila | null
  if (!r || typeof r.user_id !== 'string') return []
  return [
    {
      userId: r.user_id,
      rol: r.rol === 'host' ? 'host' : 'invitado',
      salida: r.salida === 'host' ? 'host' : 'propia',
      username: texto(r.username),
      displayName: textoONull(r.display_name),
      avatarPath: textoONull(r.avatar_path),
    },
  ]
}

function itemFromRow(row: unknown): JamItem[] {
  const r = row as Fila | null
  if (!r || typeof r.id !== 'string' || typeof r.audio_path !== 'string') return []
  return [
    {
      id: r.id,
      videoId: texto(r.video_id),
      title: texto(r.title),
      artist: texto(r.artist),
      artistId: textoONull(r.artist_id),
      artworkUrl: texto(r.artwork_url),
      artworkPath: textoONull(r.artwork_path),
      audioPath: r.audio_path,
      durationMs: numero(r.duration_ms),
      truePeak: typeof r.true_peak === 'number' ? r.true_peak : undefined,
      agregadoPor: texto(r.added_by),
      posicion: numero(r.posicion),
    },
  ]
}

function estadoFromJson(data: unknown): JamEstado {
  const d = data as Fila | null
  const jam = jamFromRow(d?.jam)
  if (!jam) throw new Error('El Jam llegó en un formato que no se entiende.')
  return {
    jam,
    miembros: Array.isArray(d?.miembros) ? d.miembros.flatMap(miembroFromRow) : [],
    cola: Array.isArray(d?.cola) ? d.cola.flatMap(itemFromRow) : [],
    ahora: numero(d?.ahora) || Date.now(),
  }
}

/* ── Los pedidos ──────────────────────────────────────────────────────────── */

/** Lo que viaja al agregar o crear: la canción entera, en el idioma del RPC. */
function cancionAJson(t: PlaylistTrack) {
  return {
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

export async function crearJam(
  canciones: PlaylistTrack[],
  indice: number,
  suena: boolean,
  posicionMs: number,
): Promise<JamEstado> {
  const data = await rpc('crear_jam', {
    p_canciones: canciones.map(cancionAJson),
    p_indice: Math.max(0, indice),
    p_suena: suena,
    p_posicion_ms: Math.max(0, Math.round(posicionMs)),
  })
  return estadoFromJson(data)
}

export async function unirseJam(
  code: string,
  salida: 'propia' | 'host',
): Promise<JamEstado> {
  const data = await rpc('unirse_jam', { p_code: code, p_salida: salida })
  return estadoFromJson(data)
}

export async function fetchJamEstado(jamId: string): Promise<JamEstado> {
  const data = await rpc('jam_estado', { p_jam_id: jamId })
  return estadoFromJson(data)
}

export async function salirJam(jamId: string): Promise<void> {
  await rpc('salir_jam', { p_jam_id: jamId })
}

export async function terminarJam(jamId: string): Promise<void> {
  await rpc('terminar_jam', { p_jam_id: jamId })
}

export async function expulsarDelJam(jamId: string, userId: string): Promise<void> {
  await rpc('jam_expulsar', { p_jam_id: jamId, p_user_id: userId })
}

export async function cambiarSalida(jamId: string, salida: 'propia' | 'host'): Promise<void> {
  await rpc('jam_salida', { p_jam_id: jamId, p_salida: salida })
}

export async function agregarAJam(jamId: string, track: PlaylistTrack): Promise<void> {
  await rpc('jam_agregar', { p_jam_id: jamId, p_cancion: cancionAJson(track) })
}

export async function quitarDeJam(jamId: string, itemId: string): Promise<void> {
  await rpc('jam_quitar', { p_jam_id: jamId, p_item_id: itemId })
}

export async function jamPlay(jamId: string, ms?: number): Promise<void> {
  await rpc('jam_play', { p_jam_id: jamId, p_ms: ms == null ? null : Math.round(ms) })
}

export async function jamPause(jamId: string, ms?: number): Promise<void> {
  await rpc('jam_pause', { p_jam_id: jamId, p_ms: ms == null ? null : Math.round(ms) })
}

export async function jamSeek(jamId: string, ms: number): Promise<void> {
  await rpc('jam_seek', { p_jam_id: jamId, p_ms: Math.max(0, Math.round(ms)) })
}

export async function jamTocar(jamId: string, itemId: string): Promise<void> {
  await rpc('jam_tocar', { p_jam_id: jamId, p_item_id: itemId })
}

/** Mete la canción justo después de la que suena y salta ahí, para todos. */
export async function jamTocarAhora(jamId: string, track: PlaylistTrack): Promise<void> {
  await rpc('jam_tocar_ahora', { p_jam_id: jamId, p_cancion: cancionAJson(track) })
}

export async function jamSaltar(jamId: string): Promise<void> {
  await rpc('jam_saltar', { p_jam_id: jamId })
}

export async function jamAnterior(jamId: string): Promise<void> {
  await rpc('jam_anterior', { p_jam_id: jamId })
}

export async function setPermisosJam(
  jamId: string,
  permisos: Partial<JamPermisos>,
): Promise<void> {
  await rpc('jam_permisos', {
    p_jam_id: jamId,
    p_agregan: permisos.agregan ?? null,
    p_controlan: permisos.controlan ?? null,
    p_saltan: permisos.saltan ?? null,
  })
}

export async function verJam(code: string): Promise<VistaJam | null> {
  const data = (await rpc('ver_jam', { p_code: code })) as Fila | null
  if (!data || typeof data.id !== 'string') return null
  return {
    id: data.id,
    code: texto(data.code),
    hostUsername: texto(data.host_username),
    hostDisplayName: textoONull(data.host_display_name),
    hostAvatarPath: textoONull(data.host_avatar_path),
    cuantos: numero(data.cuantos),
  }
}

export async function miJam(): Promise<string | null> {
  const data = await rpc('mi_jam', {})
  return typeof data === 'string' ? data : null
}

/* ── El canal ─────────────────────────────────────────────────────────────── */

export type Unsubscribe = () => void

/**
 * El canal de un Jam: eventos de la base más presencia.
 *
 * Dos velocidades a propósito. Un cambio en la fila de `jams` —play, pausa,
 * salto, permisos— trae la fila **entera** (REPLICA IDENTITY FULL) y se aplica
 * directo del evento: es el camino del transporte y no puede esperar un viaje
 * extra. Un cambio en la cola o en la gente avisa `onGrueso` y quien escucha
 * repide `jam_estado`: pasa poco, trae varias filas y rehacer todo de una
 * fuente única es más simple y más difícil de romper que aplicar deltas.
 *
 * Presencia: quién está **conectado ahora**, que no es lo mismo que quién es
 * miembro. La membresía vive en la base y sobrevive a un túnel; la presencia
 * la mantiene el servicio y es lo que dibuja el puntito verde.
 */
export function suscribirJam(
  jamId: string,
  miId: string,
  hooks: {
    onJam: (jam: Jam) => void
    onGrueso: () => void
    onPresentes: (userIds: string[]) => void
    onCaida: () => void
  },
): Unsubscribe {
  const supabase = getSupabase()
  let channel: RealtimeChannel | null = supabase
    .channel(`jam:${jamId}`, { config: { presence: { key: miId } } })
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'jams', filter: `id=eq.${jamId}` },
      (payload) => {
        const jam = jamFromRow(payload.new)
        if (jam) hooks.onJam(jam)
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'jam_queue', filter: `jam_id=eq.${jamId}` },
      () => hooks.onGrueso(),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'jam_members', filter: `jam_id=eq.${jamId}` },
      () => hooks.onGrueso(),
    )
    .on('presence', { event: 'sync' }, () => {
      if (channel) hooks.onPresentes(Object.keys(channel.presenceState()))
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void channel?.track({ en: Date.now() })
        // Entre que el canal se pidió y quedó suscripto pudo pasar de todo:
        // un estado completo tapa la ventana. Es el mismo criterio que la
        // carga inicial de mensajes.
        hooks.onGrueso()
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        hooks.onCaida()
      }
    })

  return () => {
    if (channel) void supabase.removeChannel(channel)
    channel = null
  }
}
