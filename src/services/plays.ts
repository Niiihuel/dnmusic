import { getSupabase } from '../lib/supabase'

/**
 * El historial de escuchas.
 *
 * Se anota **cuánto se escuchó de verdad**, no cuánto dura el tema: sumar
 * duraciones contaría entera una canción que saltaste a los diez segundos, y el
 * número diría más sobre cuánto tocaste el botón que sobre cuánto escuchaste.
 *
 * Nadie lee el historial de otro; lo que se comparte son los agregados. Un
 * perfil público no convierte tu historial en público.
 */

/**
 * Cuánto hay que escuchar para que cuente.
 *
 * Debajo de esto fue un vistazo, no una escucha: pasar por diez canciones
 * buscando una llenaría el historial de ruido y arruinaría cualquier «artista
 * más escuchado». Es el mismo umbral que usa el scrobbling de toda la vida.
 */
const MINIMO_MS = 30_000

export type Escucha = {
  videoId: string
  title: string
  artist: string
  artistId?: string | null
  /** Milisegundos efectivamente escuchados. */
  ms: number
}

/**
 * Anota una escucha. Silenciosa: si falla, no pasa nada.
 *
 * Es telemetría de uno mismo, no un dato del que dependa la reproducción — que
 * se caiga la anotación no puede cortar la música ni mostrar un error. Por eso
 * traga el fallo en vez de propagarlo.
 */
export async function anotarEscucha(escucha: Escucha): Promise<void> {
  if (escucha.ms < MINIMO_MS) return
  const { data } = await getSupabase().auth.getUser()
  const me = data.user?.id
  if (!me) return

  await getSupabase()
    .from('plays')
    .insert({
      owner_id: me,
      video_id: escucha.videoId,
      title: escucha.title,
      artist: escucha.artist,
      artist_id: escucha.artistId ?? null,
      ms: Math.round(escucha.ms),
    })
    .then(undefined, () => undefined)
}

export type EstadisticasPerfil = {
  minutos: number
  canciones: number
  artistaTop: string | null
  minutosArtistaTop: number
}

/** Los números de un perfil. `null` si esa cuenta no se deja ver. */
export async function fetchStats(userId: string): Promise<EstadisticasPerfil | null> {
  const { data, error } = await getSupabase().rpc('get_profile_stats', { p_user_id: userId })
  if (error) throw error
  const fila = (Array.isArray(data) ? data[0] : data) as
    | { minutos?: number; canciones?: number; artista_top?: string | null; minutos_artista_top?: number }
    | undefined
  if (!fila) return null
  return {
    minutos: fila.minutos ?? 0,
    canciones: fila.canciones ?? 0,
    artistaTop: fila.artista_top ?? null,
    minutosArtistaTop: fila.minutos_artista_top ?? 0,
  }
}
