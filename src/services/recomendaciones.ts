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
 * Hay que ser honesto sobre qué hace y qué no: esto te trae **más de lo que ya
 * escuchás**, no cosas nuevas. Descubrir algo distinto exige salir de tu propio
 * historial, y eso este archivo no lo intenta.
 */

/** Cuántos artistas entran en el sorteo. */
const ARTISTAS = 8
/** Días hacia atrás que cuentan como «lo escuché recién». */
const DIAS_RECIENTES = 7
/** Cuántas canciones se preparan por tanda. */
const POR_TANDA = 3

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
    for (let intento = 0; intento < 4 && elegidas.length < POR_TANDA; intento++) {
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
