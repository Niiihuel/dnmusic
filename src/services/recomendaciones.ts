import { getSupabase } from '../lib/supabase'
import { fetchArtist, resolveSong, type TrackResult } from './music'
import type { PlaylistTrack } from './playlists'

/**
 * Con qué seguir cuando se termina la lista.
 *
 * **Sin ningún modelo.** La señal es tu propio historial de escucha —cuánto
 * tiempo real le diste a cada artista, que vive en `plays`— y el catálogo lo
 * pone YouTube Music, que la app ya consulta para todo lo demás. Es cómo
 * funcionaban las radios antes de que todo fuera una recomendación aprendida.
 *
 * Son **dos capas**, y la segunda es la que hace que esto sirva para descubrir:
 *
 * 1. **El ancla.** Un artista tuyo, sorteado con peso por lo que lo escuchaste.
 *    Sale enteramente de tu historial y nunca sale de él.
 * 2. **La exploración.** Los artistas relacionados de ese mismo artista, que
 *    YouTube publica en su página como «Fans might also like». Eso sí es un
 *    sistema de recomendación —un grafo de co-escucha sobre el comportamiento
 *    agregado de todo el mundo— pero lo calcula YouTube y acá se consume como se
 *    consume su catálogo: sin entrenar nada, sin inferir nada y sin que salga un
 *    dato tuyo a ningún lado.
 *
 * La segunda capa arranca **desde la primera**, y por eso no es azar: si
 * escuchás mucho a alguien, lo que entra es lo que escucha la gente que escucha
 * a ese alguien.
 */

/** Cuántos artistas entran en el sorteo. */
const ARTISTAS = 8
/** Días hacia atrás que cuentan como «lo escuché recién». */
const DIAS_RECIENTES = 7
/** Cuántas canciones se preparan por tanda. */
const POR_TANDA = 3
/**
 * Cuántas de la tanda salen de artistas que **no** escuchás.
 *
 * Dos de tres. La proporción no es un capricho: una tanda enteramente
 * desconocida es lo que hace que la gente apague el autoplay, y una enteramente
 * conocida es lo que hacía que esto no sirviera para descubrir nada. Con una
 * ancla propia por tanda, la cola sigue sonando a vos aunque la mayoría sea
 * nueva.
 */
const EXPLORACION = 2

type ArtistaEscuchado = { artist_id: string; artist: string; ms: number }

/**
 * Elige un artista al azar, **pesado por lo que lo escuchaste**.
 *
 * No es «el que más escuchás»: eso te devolvería el mismo para siempre y la
 * cola se volvería monotemática a los diez minutos. Tampoco es parejo entre los
 * ocho: si a uno le diste diez horas y a otro veinte minutos, tratarlos igual no
 * representa lo que te gusta.
 *
 * Proporcional al tiempo es el punto medio, y es el que hace que la cola se
 * sienta tuya: aparece seguido el que más escuchás, pero no siempre.
 */
function elegirPesado(artistas: ArtistaEscuchado[]): ArtistaEscuchado | null {
  const total = artistas.reduce((suma, a) => suma + Math.max(1, a.ms), 0)
  if (total <= 0) return null
  let tirada = Math.random() * total
  for (const a of artistas) {
    tirada -= Math.max(1, a.ms)
    if (tirada <= 0) return a
  }
  return artistas[artistas.length - 1] ?? null
}

/**
 * Arma la próxima tanda de recomendaciones.
 *
 * Devuelve vacío en cualquier tropiezo —sin historial, sin red, sin catálogo—
 * y eso es deliberado: esto corre solo, cuando la lista se terminó y nadie está
 * mirando. Un error acá no puede convertirse en un cartel; a lo sumo, en
 * silencio, que es exactamente lo que pasaba antes de que esto existiera.
 */
export async function proximasRecomendadas(
  yaEnCola: string[] = [],
): Promise<PlaylistTrack[]> {
  try {
    const supabase = getSupabase()
    const [{ data: artistas }, { data: recientes }] = await Promise.all([
      supabase.rpc('artistas_mas_escuchados', { p_limite: ARTISTAS }),
      supabase.rpc('escuchadas_recientes', { p_dias: DIAS_RECIENTES }),
    ])

    const candidatos = (artistas ?? []) as ArtistaEscuchado[]
    if (!candidatos.length) return []

    /* Lo que no se puede volver a ofrecer: lo de esta semana y lo que ya está
       esperando en la cola. */
    const vetados = new Set<string>([
      ...((recientes ?? []) as { video_id: string }[]).map((r) => r.video_id),
      ...yaEnCola,
    ])

    /*
     * Se intenta con varios artistas y no con uno solo.
     *
     * El elegido puede no tener catálogo devuelto, o tener solo temas que ya
     * escuchaste esta semana. Sin reintento, la cola se quedaría muda por mala
     * suerte en un sorteo.
     */
    const elegidas: TrackResult[] = []
    const usados = new Set<string>()
    /* Los que ya escuchás no pueden entrar como «descubrimiento»: YouTube los
       lista como relacionados entre sí, y sin esto la exploración te devolvería
       a tu propio catálogo con otro nombre. */
    const conocidos = new Set(candidatos.map((a) => a.artist_id))
    const parientes: { id: string; nombre: string }[] = []

    /*
     * Primero **el ancla**: una canción de un artista tuyo.
     *
     * Va primero a propósito. La tanda arranca con algo reconocible y recién
     * después se abre; al revés, el salto desde tu lista a dos desconocidos
     * seguidos se siente como si la app hubiera cambiado de estación.
     *
     * De paso, la página de ese artista es de donde salen los relacionados, así
     * que el mismo pedido sirve para las dos cosas.
     */
    for (let intento = 0; intento < 4 && elegidas.length < POR_TANDA - EXPLORACION; intento++) {
      const artista = elegirPesado(candidatos.filter((a) => !usados.has(a.artist_id)))
      if (!artista) break
      usados.add(artista.artist_id)

      const info = await fetchArtist(artista.artist_id)
      for (const rel of info?.relacionados ?? []) {
        if (!conocidos.has(rel.id) && !parientes.some((p) => p.id === rel.id)) {
          parientes.push({ id: rel.id, nombre: rel.title })
        }
      }
      for (const song of info?.topSongs ?? []) {
        if (elegidas.length >= POR_TANDA - EXPLORACION) break
        if (vetados.has(song.videoId)) continue
        vetados.add(song.videoId)
        elegidas.push(song)
      }
    }

    /*
     * Después, **lo nuevo**: los relacionados de tus artistas.
     *
     * Barajados y no en el orden de YouTube, que devuelve siempre los mismos
     * primeros: sin esto, dos tandas seguidas te traerían al mismo desconocido.
     */
    for (let i = parientes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[parientes[i], parientes[j]] = [parientes[j], parientes[i]]
    }
    for (const pariente of parientes) {
      if (elegidas.length >= POR_TANDA) break
      const info = await fetchArtist(pariente.id)
      for (const song of info?.topSongs ?? []) {
        if (elegidas.length >= POR_TANDA) break
        if (vetados.has(song.videoId)) continue
        vetados.add(song.videoId)
        elegidas.push(song)
      }
    }

    /*
     * Si no hubo relacionados —un artista sin esa sección, o YouTube que no la
     * devolvió— la tanda se completa con lo tuyo. Es mejor seguir sonando con
     * algo conocido que cortar la música por no haber encontrado novedades.
     */
    for (let intento = 0; intento < 3 && elegidas.length < POR_TANDA; intento++) {
      const artista = elegirPesado(candidatos.filter((a) => !usados.has(a.artist_id)))
      if (!artista) break
      usados.add(artista.artist_id)
      const info = await fetchArtist(artista.artist_id)
      for (const song of info?.topSongs ?? []) {
        if (elegidas.length >= POR_TANDA) break
        if (vetados.has(song.videoId)) continue
        vetados.add(song.videoId)
        elegidas.push(song)
      }
    }

    /*
     * Resolver es traer el audio a Storage, y la primera vez de cada tema es un
     * viaje largo. Van en paralelo y las que fallan se descartan: es mejor
     * seguir con dos que frenar todo por una.
     */
    const resueltas = await Promise.all(
      elegidas.map(async (track): Promise<PlaylistTrack | null> => {
        try {
          const song = await resolveSong(track)
          return {
            id: `radio:${track.videoId}`,
            videoId: track.videoId,
            title: track.title,
            artist: track.artist,
            artistId: track.artistId,
            artworkUrl: track.artworkUrl,
            artworkPath: song.artworkPath,
            audioPath: song.path,
            durationMs: song.durationMs || track.durationMs,
            truePeak: undefined,
          }
        } catch {
          return null
        }
      }),
    )

    return resueltas.filter((t): t is PlaylistTrack => t !== null)
  } catch {
    return []
  }
}
