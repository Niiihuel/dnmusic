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

export type ArtistaEscuchado = { artist_id: string; artist: string; ms: number }

/**
 * Tope de canciones del mismo artista por tanda.
 *
 * Sin él, el primer artista sorteado podía llenar la tanda entera con su
 * catálogo: tres «recomendaciones» que son el mismo nombre tres veces. Dos es
 * el máximo que no se siente monotemático.
 */
const MAX_POR_ARTISTA = 2

/**
 * El núcleo de las recomendaciones: de unas anclas, una tanda de canciones.
 *
 * Recibe los artistas ancla ya elegidos —de dónde salen es problema de quien
 * llama: del historial para el autoplay, de la propia lista para las
 * sugerencias— y devuelve resultados de búsqueda **sin resolver**: traer el
 * audio es caro y solo corresponde cuando algo se va a escuchar o guardar.
 *
 * Las dos capas son las de siempre: primero lo propio (canciones de las
 * anclas), después la exploración (sus «Fans might also like»), y si no hubo
 * relacionados se completa con lo propio antes que devolver de menos.
 */
async function recomendarDesdeAnclas(
  anclas: ArtistaEscuchado[],
  vetados: Set<string>,
  cuantas: number,
  exploracion: number,
): Promise<TrackResult[]> {
  const propias = Math.max(0, cuantas - exploracion)
  const elegidas: TrackResult[] = []
  const usados = new Set<string>()
  const porArtista = new Map<string, number>()
  /* Los que ya escuchás no pueden entrar como «descubrimiento»: YouTube los
     lista como relacionados entre sí, y sin esto la exploración te devolvería
     a tu propio catálogo con otro nombre. */
  const conocidos = new Set(anclas.map((a) => a.artist_id))
  const parientes: { id: string; nombre: string }[] = []

  const sumar = (song: TrackResult): boolean => {
    if (vetados.has(song.videoId)) return false
    const artista = song.artistId ?? song.artist
    if ((porArtista.get(artista) ?? 0) >= MAX_POR_ARTISTA) return false
    vetados.add(song.videoId)
    porArtista.set(artista, (porArtista.get(artista) ?? 0) + 1)
    elegidas.push(song)
    return true
  }

  /*
   * Primero **lo propio**: canciones de las anclas.
   *
   * Va primero a propósito. La tanda arranca con algo reconocible y recién
   * después se abre; al revés, el salto a dos desconocidos seguidos se siente
   * como si la app hubiera cambiado de estación. De paso, la página de cada
   * ancla es de donde salen los relacionados: el mismo pedido sirve dos veces.
   */
  for (let intento = 0; intento < 4 + anclas.length && elegidas.length < propias; intento++) {
    const artista = elegirPesado(anclas.filter((a) => !usados.has(a.artist_id)))
    if (!artista) break
    usados.add(artista.artist_id)

    const info = await fetchArtist(artista.artist_id)
    for (const rel of info?.relacionados ?? []) {
      if (!conocidos.has(rel.id) && !parientes.some((p) => p.id === rel.id)) {
        parientes.push({ id: rel.id, nombre: rel.title })
      }
    }
    for (const song of info?.topSongs ?? []) {
      if (elegidas.length >= propias) break
      sumar(song)
    }
  }

  /*
   * Después, **lo nuevo**: los relacionados. Barajados y no en el orden de
   * YouTube, que devuelve siempre los mismos primeros: sin esto, dos tandas
   * seguidas traerían al mismo desconocido.
   */
  for (let i = parientes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[parientes[i], parientes[j]] = [parientes[j], parientes[i]]
  }
  for (const pariente of parientes) {
    if (elegidas.length >= cuantas) break
    const info = await fetchArtist(pariente.id)
    for (const song of info?.topSongs ?? []) {
      if (elegidas.length >= cuantas) break
      sumar(song)
    }
  }

  /*
   * Si no hubo relacionados —un ancla sin esa sección, o YouTube que no la
   * devolvió— la tanda se completa con lo propio. Es mejor seguir sonando con
   * algo conocido que quedarse corto por no haber encontrado novedades.
   */
  for (let intento = 0; intento < 3 && elegidas.length < cuantas; intento++) {
    const artista = elegirPesado(anclas.filter((a) => !usados.has(a.artist_id)))
    if (!artista) break
    usados.add(artista.artist_id)
    const info = await fetchArtist(artista.artist_id)
    for (const song of info?.topSongs ?? []) {
      if (elegidas.length >= cuantas) break
      sumar(song)
    }
  }

  return elegidas
}

/** Cuántas sugerencias trae la sección al pie de una lista. */
const SUGERENCIAS = 6

/**
 * Sugerencias para el pie de una lista, como las de Spotify.
 *
 * El ancla es **la lista misma**: sus artistas, pesados por cuánto de la lista
 * es de cada uno. No mira el historial — la sección dice «según las canciones
 * de esta lista», y tiene que ser cierto: una lista de cumbia sugiere cumbia
 * aunque el resto del día escuches otra cosa.
 *
 * `yaVistas` son las sugerencias que ya se mostraron en esta sesión: el botón
 * de actualizar tiene que traer caras nuevas, no rebarajar las mismas seis.
 * Devuelve resultados sin resolver; el audio se trae recién al agregar o
 * escuchar una.
 */
export async function sugerenciasParaLista(
  enLista: PlaylistTrack[],
  yaVistas: string[] = [],
  cuantas = SUGERENCIAS,
): Promise<TrackResult[]> {
  try {
    const porArtista = new Map<string, ArtistaEscuchado>()
    for (const t of enLista) {
      if (!t.artistId) continue
      const previo = porArtista.get(t.artistId)
      if (previo) previo.ms += Math.max(1, t.durationMs)
      else porArtista.set(t.artistId, { artist_id: t.artistId, artist: t.artist, ms: Math.max(1, t.durationMs) })
    }
    const anclas = [...porArtista.values()]
    if (!anclas.length) return []

    const vetados = new Set<string>([...enLista.map((t) => t.videoId), ...yaVistas])
    /* Mitad y mitad: la mitad son los artistas de la lista, la otra mitad sus
       relacionados. Es la mezcla de la captura de Spotify — conocidos para
       confiar, nuevos para descubrir. */
    return await recomendarDesdeAnclas(anclas, vetados, cuantas, Math.floor(cuantas / 2))
  } catch {
    /* Igual que el autoplay: esto es un pie de página, no puede romper la
       lista. Sin red o sin catálogo, la sección simplemente no aparece. */
    return []
  }
}

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
  /**
   * Los artistas de la cola que está sonando, como ancla de **respaldo**.
   *
   * El historial puede no alcanzar: una cuenta nueva, o escuchas anotadas sin
   * el id del artista —las de la portada venían así—. `artistas_mas_escuchados`
   * devuelve vacío en los dos casos, y el autoplay se quedaba mudo justo cuando
   * más obvio era con qué seguir: con algo parecido a la lista que acaba de
   * terminar. Si el historial no dice nada, manda la cola.
   */
  delaCola: ArtistaEscuchado[] = [],
): Promise<PlaylistTrack[]> {
  try {
    const supabase = getSupabase()
    const [{ data: artistas }, { data: recientes }] = await Promise.all([
      supabase.rpc('artistas_mas_escuchados', { p_limite: ARTISTAS }),
      supabase.rpc('escuchadas_recientes', { p_dias: DIAS_RECIENTES }),
    ])

    const escuchados = (artistas ?? []) as ArtistaEscuchado[]
    const candidatos = escuchados.length ? escuchados : delaCola
    if (!candidatos.length) return []

    /* Lo que no se puede volver a ofrecer: lo de esta semana y lo que ya está
       esperando en la cola. */
    const vetados = new Set<string>([
      ...((recientes ?? []) as { video_id: string }[]).map((r) => r.video_id),
      ...yaEnCola,
    ])

    /*
     * El armado en sí es el núcleo compartido con las sugerencias de una
     * lista: lo propio primero, la exploración después, reintentos incluidos.
     */
    const elegidas = await recomendarDesdeAnclas(candidatos, vetados, POR_TANDA, EXPLORACION)

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
