import { getSupabase } from '../lib/supabase'
import { cancionDeFila, type PlaylistTrack } from './escucha'

/**
 * Reaccionar a lo que un contacto está escuchando.
 *
 * Es la idea de Airbuds: la música que suena en la casa de otro se puede
 * señalar, y lo que le mandaste le queda en el perfil. Acá se apoya sobre la
 * escucha que ya existe para el traspaso entre dispositivos (`escuchas`,
 * `docs/ESCUCHA.md`) — no hay un segundo lugar donde se anote qué suena.
 *
 * Dos reglas viven en la base y no acá, porque son las que hacen que esto
 * signifique algo (ver la migración `reacciones_escucha`):
 *
 *   · **La canción la elige el servidor**, leyéndola de la escucha en el
 *     instante de reaccionar. Si viniera del cliente, cualquiera podría
 *     inventarle a otro una reacción sobre algo que nunca escuchó.
 *   · **Solo entre contactos.** La escucha en vivo es de tu gente; un
 *     desconocido no ve nada y no puede reaccionar.
 */

/** Lo que está sonando en la casa de otro, sin la mecánica del traspaso. */
export type EscuchaAjena = {
  track: PlaylistTrack
  /** Suena ahora, o quedó ahí en pausa. Cambia el verbo del rótulo. */
  suena: boolean
  /** Cuándo se publicó por última vez; sirve para no mostrar algo de anteayer. */
  cuando: Date | null
}

/** Una reacción que alguien le dejó a una escucha, ya congelada. */
export type Reaccion = {
  id: string
  emoji: string
  /** La canción **de ese momento**, no la que suena ahora. */
  track: PlaylistTrack
  cuando: Date | null
  de: {
    id: string
    username: string
    displayName: string | null
    avatarPath: string | null
  }
}

function fecha(v: unknown): Date | null {
  if (typeof v !== 'string') return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Qué está escuchando esta persona ahora.
 *
 * `null` cuando no hay nada sonando **y también** cuando no sos su contacto: la
 * base devuelve cero filas en los dos casos, a propósito. Que no se distingan
 * es lo que evita que esto sirva para averiguar quién tiene a quién agregado.
 */
export async function escuchaDe(userId: string): Promise<EscuchaAjena | null> {
  const { data, error } = await getSupabase().rpc('escucha_de_contacto', {
    p_usuario: userId,
  })
  if (error) throw error
  const fila = (data ?? [])[0] as Record<string, unknown> | undefined
  if (!fila) return null
  const track = cancionDeFila(fila.track)
  if (!track) return null
  return { track, suena: fila.suena === true, cuando: fecha(fila.updated_at) }
}

/** Dejarle un emoji a lo que está sonando. Devuelve el id de la reacción. */
export async function reaccionar(userId: string, emoji: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('reaccionar_escucha', {
    p_para: userId,
    p_emoji: emoji,
  })
  if (error) throw error
  if (typeof data !== 'string' || !data) throw new Error('No se pudo reaccionar.')
  return data
}

/** Las reacciones que le dejaron a esta persona, de la más nueva a la más vieja. */
export async function reaccionesDe(userId: string, limite = 12): Promise<Reaccion[]> {
  const { data, error } = await getSupabase().rpc('reacciones_de', {
    p_usuario: userId,
    p_limit: limite,
  })
  if (error) throw error
  return (data ?? []).flatMap((fila: Record<string, unknown>) => {
    const track = cancionDeFila(fila.track)
    if (!track || typeof fila.id !== 'string') return []
    return [
      {
        id: fila.id,
        emoji: typeof fila.emoji === 'string' ? fila.emoji : '',
        track,
        cuando: fecha(fila.created_at),
        de: {
          id: typeof fila.de_user === 'string' ? fila.de_user : '',
          username: typeof fila.username === 'string' ? fila.username : '',
          displayName: typeof fila.display_name === 'string' ? fila.display_name : null,
          avatarPath: typeof fila.avatar_path === 'string' ? fila.avatar_path : null,
        },
      },
    ]
  })
}
