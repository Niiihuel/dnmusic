import { getSupabase } from '../lib/supabase'
import type { PlaybackOrigin } from '../state/playback'

/**
 * El historial de escuchas.
 *
 * Se anota **cuánto se escuchó de verdad**, no cuánto dura el tema: sumar
 * duraciones contaría entera una canción que saltaste a los diez segundos, y el
 * número diría más sobre cuánto tocaste el botón que sobre cuánto escuchaste.
 *
 * Nadie lee el historial de otro; lo que se comparte son los agregados. Un
 * perfil público no convierte tu historial en público.
 *
 * Desde el inicio personalizado el historial también **se dibuja**: «Seguir
 * escuchando», «Volver a escuchar» y «Tus artistas» salen de acá. Por eso cada
 * fila guarda además la tapa y la colección que sonaba (ver la migración
 * `escuchas_con_tapa`): es lo que hace que el inicio de cada persona sea el
 * suyo, sin ningún modelo en el medio — el mismo criterio que la radio.
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
  artworkUrl?: string | null
  artworkPath?: string | null
  /** La colección que sonaba: una lista, un mix, la radio. `null` si era suelta. */
  origen?: PlaybackOrigin | null
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
      artwork_url: escucha.artworkUrl || null,
      artwork_path: escucha.artworkPath || null,
      origen_id: escucha.origen?.id ?? null,
      origen_nombre: escucha.origen?.name ?? null,
      ms: Math.round(escucha.ms),
    })
    .then(undefined, () => undefined)
}

/** Una fila del historial propio, tal como se dibuja. */
export type EscuchaReciente = {
  videoId: string
  title: string
  artist: string
  artistId: string | null
  artworkUrl: string | null
  artworkPath: string | null
  /** Cuándo fue la última vez. */
  at: string
}

type FilaPlay = {
  video_id: string
  title: string
  artist: string
  artist_id: string | null
  artwork_url: string | null
  artwork_path: string | null
  origen_id: string | null
  origen_nombre: string | null
  ms: number
  at: string
}

/**
 * Las últimas filas del historial propio, crudas y en orden.
 *
 * Una sola consulta para todo lo que el inicio deriva de acá —canciones,
 * colecciones, artistas—: son tres preguntas sobre las mismas ~150 filas, y
 * hacer tres viajes por lo mismo sería pagar tres veces la latencia.
 */
async function ultimasFilas(limite = 150): Promise<FilaPlay[]> {
  const { data } = await getSupabase().auth.getUser()
  const me = data.user?.id
  if (!me) return []
  const { data: filas, error } = await getSupabase()
    .from('plays')
    .select('video_id, title, artist, artist_id, artwork_url, artwork_path, origen_id, origen_nombre, ms, at')
    .eq('owner_id', me)
    .order('at', { ascending: false })
    .limit(limite)
  if (error) throw error
  return (filas ?? []) as FilaPlay[]
}

/**
 * Lo que escuchaste últimamente, sin repetir canción y de la más reciente a
 * la más vieja. Es «Seguir escuchando» y la lista del buscador del perfil.
 */
export async function ultimasEscuchas(cuantas = 12): Promise<EscuchaReciente[]> {
  const vistas = new Set<string>()
  const out: EscuchaReciente[] = []
  for (const f of await ultimasFilas()) {
    if (vistas.has(f.video_id)) continue
    vistas.add(f.video_id)
    out.push({
      videoId: f.video_id,
      title: f.title,
      artist: f.artist,
      artistId: f.artist_id,
      artworkUrl: f.artwork_url,
      artworkPath: f.artwork_path,
      at: f.at,
    })
    if (out.length >= cuantas) break
  }
  return out
}

/** Una colección que sonó: de qué era y una tapa de una canción suya. */
export type OrigenReciente = {
  id: string
  nombre: string
  artworkUrl: string | null
  artworkPath: string | null
}

/**
 * Las colecciones que sonaron últimamente —listas, mixes, la radio—, una vez
 * cada una. Es «Volver a escuchar»: lo que Spotify pone en la grilla de
 * arriba, que no son las listas que tenés sino las que **usás**.
 */
export async function origenesRecientes(cuantos = 8): Promise<OrigenReciente[]> {
  const vistos = new Set<string>()
  const out: OrigenReciente[] = []
  for (const f of await ultimasFilas()) {
    if (!f.origen_id || vistos.has(f.origen_id)) continue
    vistos.add(f.origen_id)
    out.push({
      id: f.origen_id,
      nombre: f.origen_nombre ?? '',
      artworkUrl: f.artwork_url,
      artworkPath: f.artwork_path,
    })
    if (out.length >= cuantos) break
  }
  return out
}

/** Un artista tuyo, por cuánto lo escuchaste en estas semanas. */
export type ArtistaReciente = {
  artistId: string
  nombre: string
  ms: number
  /** La tapa de la canción suya que más sonó: es la cara que le conocés. */
  artworkUrl: string | null
  artworkPath: string | null
}

/**
 * Los artistas que más escuchaste en las últimas filas, del más al menos.
 *
 * Es «Tus artistas», y el ancla de «Porque escuchaste…». Se suma tiempo real
 * y no cantidad de veces, como todo el historial: diez canciones salteadas a
 * los treinta segundos no pueden pesar más que un disco escuchado entero.
 */
export async function artistasRecientes(cuantos = 8): Promise<ArtistaReciente[]> {
  const porArtista = new Map<string, ArtistaReciente & { tapaMs: number }>()
  for (const f of await ultimasFilas()) {
    if (!f.artist_id) continue
    const previo = porArtista.get(f.artist_id)
    if (previo) {
      previo.ms += f.ms
      if (f.ms > previo.tapaMs && (f.artwork_url || f.artwork_path)) {
        previo.tapaMs = f.ms
        previo.artworkUrl = f.artwork_url
        previo.artworkPath = f.artwork_path
      }
    } else {
      porArtista.set(f.artist_id, {
        artistId: f.artist_id,
        nombre: f.artist,
        ms: f.ms,
        artworkUrl: f.artwork_url,
        artworkPath: f.artwork_path,
        tapaMs: f.ms,
      })
    }
  }
  return [...porArtista.values()]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, cuantos)
    .map(({ tapaMs: _tapaMs, ...a }) => a)
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

/**
 * Borra tu historial de escucha, entero.
 *
 * Existe porque ese historial dejó de ser un dato de vitrina: desde que hay
 * recomendaciones, es lo que decide qué te propone la app cuando se termina una
 * lista. Poder rehacerlo desde cero es la única forma de corregir un gusto que
 * cambió, o de sacarse de encima una racha que no te representa.
 *
 * La policy de RLS ya limita el borrado a lo propio, así que no hace falta
 * filtrar por dueño acá: mandar `owner_id` sería confiar en el cliente para algo
 * que la base ya garantiza.
 */
export async function borrarHistorial(): Promise<void> {
  const { data } = await getSupabase().auth.getUser()
  const me = data.user?.id
  if (!me) return
  const { error } = await getSupabase().from('plays').delete().eq('owner_id', me)
  if (error) throw error
}
