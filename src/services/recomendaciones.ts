import { getSupabase } from '../lib/supabase'
import { fetchArtist, resolveSong, type TrackResult } from './music'
import { listarMeGusta } from './gustos'
import { listPlaylists, listTracks, type PlaylistTrack } from './playlists'

/**
 * Con qué seguir cuando se termina la lista.
 *
 * **Sin ningún modelo.** La señal es tuya y de nadie más: el historial de
 * escucha —cuánto tiempo real le diste a cada artista, que vive en `plays`— y
 * tus me gusta —el gusto dicho a propósito, que vive en `me_gusta` y refuerza
 * a los artistas marcados, ver `MS_POR_GUSTO`—. El catálogo lo pone YouTube
 * Music, que la app ya consulta para todo lo demás. Es cómo funcionaban las
 * radios antes de que todo fuera una recomendación aprendida.
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
/**
 * Cuántas canciones se preparan por tanda.
 *
 * Eran tres, y tres se agotan en tres saltos: quien va salteando —que es el
 * uso más común de una radio— se quedaba sin cola en segundos y los saltos
 * siguientes caían al vacío hasta la próxima tanda. Ahora que la tanda vuelve
 * sin resolver (solo metadata, ver `proximasRecomendadas`), ocho candidatas
 * cuestan lo mismo que tres y aguantan una ráfaga de saltos entera.
 */
const POR_TANDA = 8
/**
 * Cuántas de la tanda salen de artistas que **no** escuchás.
 *
 * Cinco de ocho, la proporción de siempre: una tanda enteramente desconocida
 * es lo que hace que la gente apague el autoplay, y una enteramente conocida
 * es lo que hacía que esto no sirviera para descubrir nada. Con tres anclas
 * propias por tanda, la cola sigue sonando a vos aunque la mayoría sea nueva.
 */
const EXPLORACION = 5

export type ArtistaEscuchado = { artist_id: string; artist: string; ms: number }

/**
 * Cuánto pesa un corazón, medido en tiempo de escucha.
 *
 * Las anclas se sortean por milisegundos escuchados, así que el gusto
 * explícito entra convertido a esa misma moneda: cada me gusta a una canción
 * suma como diez minutos de escucha de su artista. Diez y no más porque el
 * corazón **refuerza** al historial, no lo pisa: tres corazones a alguien que
 * nunca escuchás pesan como media hora — entra al sorteo, pero no desplaza a
 * quien escuchás todos los días. Y un artista solo-de-corazones entra aunque
 * el reloj no lo conozca: marcar es la forma más directa de pedir «más de
 * esto».
 */
const MS_POR_GUSTO = 10 * 60_000

/**
 * Cuánto pesa una semilla, en la moneda común.
 *
 * Las semillas del onboarding son gusto **dicho**, pero dicho antes de
 * escuchar nada: medio corazón cada una. Con historial cero son las únicas
 * anclas — la radio arranca sonando a lo declarado el día uno—, y a medida
 * que `plays` acumula horas reales su peso relativo baja solo: diez horas de
 * escucha tapan cualquier declaración. Nunca valen cero a propósito: quien
 * dijo «me gusta el jazz» merece que el jazz asome aunque el reloj diga otra
 * cosa, igual que los corazones lo garantizan para lo marcado después.
 */
const MS_POR_SEMILLA = 5 * 60_000

/**
 * Las semillas del onboarding, convertidas en anclas.
 *
 * Solo las de artista: guardan el id de canal, que es literalmente lo que una
 * ancla necesita. Devuelve vacío ante cualquier tropiezo — sin sesión o sin
 * semillas, el comportamiento es el de siempre.
 */
async function anclasDeSemillas(): Promise<ArtistaEscuchado[]> {
  try {
    const { data, error } = await getSupabase()
      .from('semillas')
      .select('ref, name')
      .eq('kind', 'artista')
    if (error) return []
    return ((data ?? []) as { ref: string; name: string }[])
      .filter((s) => s.ref)
      .map((s) => ({ artist_id: s.ref, artist: s.name || s.ref, ms: MS_POR_SEMILLA }))
  } catch {
    return []
  }
}

/**
 * Los artistas de **tus listas**, en la moneda de las anclas.
 *
 * Las playlists son gusto dicho con trabajo: alguien armó esa lista canción por
 * canción. Cada artista pesa lo que dura su música adentro de todas tus listas
 * sumadas — una lista entera de alguien cuenta más que tres corazones sueltos,
 * y es justo lo que uno espera: el corazón dice «esto me gusta», la lista dice
 * «esto va junto».
 *
 * Devuelve vacío ante cualquier tropiezo, igual que las semillas.
 */
async function anclasDeListas(): Promise<ArtistaEscuchado[]> {
  try {
    const listas = await listPlaylists()
    const porArtista = new Map<string, ArtistaEscuchado>()
    await Promise.all(
      listas.map(async (lista) => {
        const temas = await listTracks(lista.id)
        for (const t of temas) {
          if (!t.artistId) continue
          const previo = porArtista.get(t.artistId)
          if (previo) previo.ms += Math.max(1, t.durationMs)
          else
            porArtista.set(t.artistId, {
              artist_id: t.artistId,
              artist: t.artist,
              ms: Math.max(1, t.durationMs),
            })
        }
      }),
    )
    return [...porArtista.values()]
  } catch {
    return []
  }
}

/**
 * Mezcla las anclas de siempre con los artistas de la cola que está sonando.
 *
 * La cola dejó de ser un respaldo para cuentas sin historial: es **la mitad
 * del sorteo**. Si acabás de escuchar una playlist de Cigarettes After Sex,
 * los adicionales tienen que sonar a eso — no al promedio de todo lo que
 * escuchaste en tu vida, que era lo que pasaba cuando el historial mandaba
 * solo. Y la otra mitad sigue siendo tuya (historial + corazones) para que la
 * radio no se olvide de quién sos a la tercera tanda.
 *
 * La cola se **normaliza** al peso total de la historia antes de sumar: sus
 * milisegundos son minutos (lo que dura la lista) contra las horas del
 * historial, y sin escalar quedaría ahogada — el «respaldo» de antes, con
 * otro nombre.
 */
function mezclarConLaCola(
  historicos: ArtistaEscuchado[],
  delaCola: ArtistaEscuchado[],
): ArtistaEscuchado[] {
  if (!historicos.length) return delaCola
  if (!delaCola.length) return historicos
  const totalHist = historicos.reduce((s, a) => s + Math.max(1, a.ms), 0)
  const totalCola = delaCola.reduce((s, a) => s + Math.max(1, a.ms), 0)
  const factor = totalHist / totalCola
  const porId = new Map(historicos.map((a) => [a.artist_id, { ...a }]))
  for (const a of delaCola) {
    const peso = Math.max(1, Math.round(Math.max(1, a.ms) * factor))
    const previo = porId.get(a.artist_id)
    if (previo) previo.ms += peso
    else porId.set(a.artist_id, { artist_id: a.artist_id, artist: a.artist, ms: peso })
  }
  return [...porId.values()]
}

/**
 * Suma los corazones a las anclas del historial, en la moneda común.
 *
 * No toca el orden de nadie: devuelve la lista lista para `elegirPesado`, que
 * ya reparte proporcional al peso.
 */
function reforzarConGustos(
  escuchados: ArtistaEscuchado[],
  gustos: { artist_id: string; artist: string; cuantos: number }[],
): ArtistaEscuchado[] {
  const porId = new Map(escuchados.map((a) => [a.artist_id, { ...a }]))
  for (const g of gustos) {
    const previo = porId.get(g.artist_id)
    if (previo) previo.ms += g.cuantos * MS_POR_GUSTO
    else porId.set(g.artist_id, { artist_id: g.artist_id, artist: g.artist, ms: g.cuantos * MS_POR_GUSTO })
  }
  return [...porId.values()]
}

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
   * Los artistas de la cola que está sonando: **la mitad del sorteo**.
   *
   * Antes eran solo el respaldo para cuentas sin historial, y los adicionales
   * de una playlist de cumbia podían salir del rock de tu historial general.
   * Ahora la cola entra normalizada al peso de la historia (ver
   * `mezclarConLaCola`): la tanda suena a lo que acabás de escuchar sin dejar
   * de sonar a vos. Si el historial no dice nada, manda la cola sola, que es
   * lo que ya pasaba.
   */
  delaCola: ArtistaEscuchado[] = [],
  /**
   * Si hay que traer el audio antes de devolver la tanda.
   *
   * Resolver es descargar la canción entera a Storage la primera vez: varios
   * segundos POR canción, y era lo que hacía que la tanda «tardara en cargar»
   * — saltear rápido agotaba la cola y los saltos quedaban muertos esperando
   * las descargas. Por defecto la tanda vuelve **al toque, sin audio**
   * (`audioPath` vacío): el motor lo resuelve recién cuando la canción va a
   * sonar, y precarga la siguiente mientras suena la actual.
   *
   * El Jam sí resuelve antes (`resolver: true`): su cola vive en el servidor
   * y `jam_agregar` exige el audio — una fila compartida sin audio no le
   * sonaría a nadie.
   */
  opciones: { resolver?: boolean } = {},
): Promise<PlaylistTrack[]> {
  try {
    const supabase = getSupabase()
    const [{ data: artistas }, { data: recientes }, { data: gustadas }] = await Promise.all([
      supabase.rpc('artistas_mas_escuchados', { p_limite: ARTISTAS }),
      supabase.rpc('escuchadas_recientes', { p_dias: DIAS_RECIENTES }),
      /* El gusto explícito, directo de la tabla: los corazones son pocos y
         propios, y RLS ya recorta a los tuyos. Se agrupan acá porque traer
         las filas es más simple que otra función SQL para una suma. */
      supabase.from('me_gusta').select('artist_id, artist'),
    ])

    const escuchados = (artistas ?? []) as ArtistaEscuchado[]
    /* Corazones por artista, contados de las filas crudas. */
    const porGusto = new Map<string, { artist_id: string; artist: string; cuantos: number }>()
    for (const g of (gustadas ?? []) as { artist_id: string | null; artist: string }[]) {
      if (!g.artist_id) continue
      const previo = porGusto.get(g.artist_id)
      if (previo) previo.cuantos += 1
      else porGusto.set(g.artist_id, { artist_id: g.artist_id, artist: g.artist, cuantos: 1 })
    }
    const reforzados = reforzarConGustos(escuchados, [...porGusto.values()])

    /*
     * Las semillas entran **siempre** al sorteo, con su peso chico de
     * declaración (ver `MS_POR_SEMILLA`). En una cuenta nueva son las únicas
     * anclas — sin ellas, `proximasRecomendadas` devolvía vacío y la radio
     * no existía hasta haber escuchado algo—; después conviven con el
     * historial, que las va diluyendo solo.
     */
    const semillas = await anclasDeSemillas()
    const porIdSemilla = new Map(reforzados.map((a) => [a.artist_id, { ...a }]))
    for (const s of semillas) {
      const previo = porIdSemilla.get(s.artist_id)
      if (previo) continue /* ya es un artista real: el reloj pesa más. */
      porIdSemilla.set(s.artist_id, s)
    }

    /*
     * Tus listas entran al sorteo con su peso de duración (ver
     * `anclasDeListas`): lo que armaste a mano dice tanto como lo que escuchás,
     * y la radio que solo miraba el reloj ignoraba justo la parte curada.
     */
    const delistas = await anclasDeListas()
    const porIdListas = new Map([...porIdSemilla.values()].map((a) => [a.artist_id, { ...a }]))
    for (const a of delistas) {
      const previo = porIdListas.get(a.artist_id)
      if (previo) previo.ms += a.ms
      else porIdListas.set(a.artist_id, a)
    }
    const conSemillas = [...porIdListas.values()]

    /* Mitad lo que estás escuchando, mitad lo que sos. Ver `mezclarConLaCola`. */
    const candidatos = mezclarConLaCola(conSemillas, delaCola)
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

    /* Sin resolver: la tanda entra a la cola ya mismo, con el audio en blanco.
       El motor lo trae cuando le toque sonar (ver `MotorAudio`). */
    if (!opciones.resolver) return sinResolver(elegidas)

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

/**
 * Una tanda de resultados convertida en cola, **sin audio**.
 *
 * Es el formato que comparten todas las salidas del motor: la cola la acepta
 * al toque y el motor de audio baja cada canción recién cuando va a sonar.
 */
function sinResolver(elegidas: TrackResult[]): PlaylistTrack[] {
  return elegidas.map((track) => ({
    id: `radio:${track.videoId}`,
    videoId: track.videoId,
    title: track.title,
    artist: track.artist,
    artistId: track.artistId,
    artworkUrl: track.artworkUrl,
    artworkPath: null,
    audioPath: '',
    durationMs: track.durationMs,
    truePeak: undefined,
  }))
}

/** Un mix de la portada: un artista tuyo y su tapa. */
export type MixPersonal = {
  artist_id: string
  artist: string
  /** La carátula de una canción suya, para la tarjeta. */
  artworkUrl: string
}

/**
 * Tus mixes personales: los artistas que más pesan en tu biblioteca.
 *
 * La biblioteca son dos fuentes y las dos dicen cosas distintas: los corazones
 * (peso fijo por canción, ver `MS_POR_GUSTO`) y tus listas (peso por duración,
 * ver `anclasDeListas`). Sumadas en una sola bolsa dan el ránking con el que se
 * arman los mixes de «Hecho para vos» — el mismo criterio de la radio, pero
 * visto como catálogo para tocar.
 */
export async function mezclasPersonales(cuantas = 6): Promise<MixPersonal[]> {
  try {
    const porArtista = new Map<string, { ancla: ArtistaEscuchado; artworkUrl: string }>()
    const sumar = (t: { artistId: string | null; artist: string; durationMs: number; artworkUrl?: string }) => {
      if (!t.artistId) return
      const peso = Math.max(1, t.durationMs)
      const previo = porArtista.get(t.artistId)
      if (previo) previo.ancla.ms += peso
      else
        porArtista.set(t.artistId, {
          ancla: { artist_id: t.artistId, artist: t.artist, ms: peso },
          /* La primera carátula que llega sirve de tapa: es de una canción
             real del artista, que es lo único que la tarjeta promete. */
          artworkUrl: t.artworkUrl ?? '',
        })
    }

    for (const g of await listarMeGusta()) sumar(g)
    for (const a of await anclasDeListas())
      sumar({ artistId: a.artist_id, artist: a.artist, durationMs: a.ms })

    return [...porArtista.values()]
      .sort((x, y) => y.ancla.ms - x.ancla.ms)
      .slice(0, cuantas)
      .map(({ ancla, artworkUrl }) => ({
        artist_id: ancla.artist_id,
        artist: ancla.artist,
        artworkUrl,
      }))
  } catch {
    return []
  }
}

/**
 * La tanda de un mix: la radio entera arrancando de **un** artista tuyo.
 *
 * Mismo núcleo de siempre (`recomendarDesdeAnclas`) con una sola ancla: mitad
 * suyo, mitad exploración desde sus relacionados. Sin vetados porque el mix es
 * una cola nueva — no viene reemplazando nada.
 */
export async function tandaDeMix(ancla: ArtistaEscuchado): Promise<PlaylistTrack[]> {
  try {
    const elegidas = await recomendarDesdeAnclas(
      [ancla],
      new Set(),
      POR_TANDA,
      Math.floor(POR_TANDA / 2),
    )
    return sinResolver(elegidas)
  } catch {
    return []
  }
}
