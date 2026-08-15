import { addTrack, createPlaylist } from './playlists'
import { ensureArtwork, fetchMusica, resolveSong } from './music'
import type { TrackResult } from './music'
import { getSupabase } from '../lib/supabase'

/**
 * Traer una lista de Spotify.
 *
 * La lista no se copia: se **recrea**. De Spotify salen nombres —título,
 * artista, duración— y cada uno se vuelve a buscar en YouTube Music, que es de
 * donde sale el audio de toda la app. Lo que queda al final es una lista
 * nuestra, con nuestros `videoId` y nuestro Storage; Spotify no queda en el
 * medio de nada y la lista sigue sonando aunque mañana cierren la puerta por la
 * que entró.
 *
 * El trabajo va en tres tiempos, y esa división es la que hace que importar 100
 * canciones tarde medio minuto y no media hora:
 *
 * 1. **Leer** la lista (un solo pedido).
 * 2. **Emparejar** cada tema con una canción de YouTube Music (una búsqueda por
 *    tema, en lotes chicos). Acá se decide qué entra solo y qué se pregunta.
 * 3. **Guardar** las filas. El audio **no** se descarga: se guarda la ruta que
 *    va a tener, y el tema se baja recién cuando alguien le da play. Ver
 *    `urlDeAudio` en `services/music`, que es quien lo resuelve al vuelo.
 *
 * Ese tercer punto es deliberado y vale explicarlo. Descargar las 100 canciones
 * durante el import significaría 100 viajes seguidos a YouTube desde la misma
 * IP — que es exactamente lo que despierta al anti-bot que tanto costó
 * mantener dormido (ver `server/src/salida.ts`) — y llenar el bucket con temas
 * que quizá nadie escuche. Resolviendo al reproducir, el import es barato, y el
 * audio que se baja es el que de verdad se escucha. Como el bucket está
 * indexado por `videoId`, la segunda persona que importe el mismo tema no gasta
 * un byte.
 */

const MUSIC_API = process.env.EXPO_PUBLIC_MUSIC_API ?? 'http://localhost:8787'

/** Cuántas canciones sirve la página de embed de Spotify. Ver `server/src/spotify.ts`. */
export const TOPE_SPOTIFY = 100

export type PistaSpotify = {
  uri: string
  titulo: string
  artista: string
  durationMs: number
  /** MP3 de 30s para comparar de oído en la revisión. Puede no venir. */
  previewUrl: string | null
}

export type ListaSpotify = {
  id: string
  nombre: string
  autor: string
  portadaUrl: string | null
  pistas: PistaSpotify[]
  /** Llegó al tope de la página: puede haber más canciones sin leer. */
  truncada: boolean
}

export type Confianza = 'segura' | 'dudosa' | 'sin_resultado'

export type Candidato = {
  track: TrackResult
  puntaje: number
  /** En palabras, por qué puntuó así. Se muestra al revisar. */
  motivo: string
}

/** Un tema de Spotify con lo que se encontró para él. */
export type Emparejado = {
  pista: PistaSpotify
  confianza: Confianza
  /** El candidato elegido, o null si no hubo ninguno aceptable. */
  elegido: TrackResult | null
  candidatos: Candidato[]
}

// ── Leer ───────────────────────────────────────────────────────────────────

export async function leerListaSpotify(
  enlace: string,
  signal?: AbortSignal,
): Promise<ListaSpotify> {
  const res = await fetchMusica(`${MUSIC_API}/spotify?url=${encodeURIComponent(enlace)}`, { signal })
  const datos = (await res.json()) as Partial<ListaSpotify> & { error?: string }
  if (!res.ok || datos.error || !datos.pistas) {
    throw new Error(datos.error ?? `No se pudo leer la lista (${res.status})`)
  }
  return datos as ListaSpotify
}

/**
 * Los ids de canción que haya en un texto pegado.
 *
 * En Spotify se puede seleccionar todo dentro de una lista (Ctrl+A) y copiar
 * (Ctrl+C): al portapapeles va **un link por canción**. Esos links son la
 * salida a los dos límites del enlace de lista —el tope de 100 y que tenga que
 * ser pública—, porque cada canción tiene su propia página de embed y se puede
 * leer de a una, sin credencial y sin tope.
 */
export function idsDeCanciones(texto: string): string[] {
  const ids = new Set<string>()
  const patron = /(?:open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/|spotify:track:)([A-Za-z0-9]{22})/g
  for (const coincidencia of texto.matchAll(patron)) ids.add(coincidencia[1])
  return [...ids]
}

/** De un mismo textarea salen dos cosas distintas, y conviene decir cuál. */
export type Pegado =
  | { tipo: 'nombres'; pistas: PistaSpotify[] }
  | { tipo: 'enlaces'; ids: string[] }

/**
 * Qué hay en lo que se pegó.
 *
 * Los links de canción ganan sobre todo lo demás: si aparecen, el texto viene
 * del «copiar» de Spotify y leer sus nombres de la página de cada una da datos
 * mucho mejores —duración incluida, que es la señal más fuerte del emparejado—
 * que intentar adivinar título y artista de una URL.
 */
export function interpretarPegado(texto: string): Pegado {
  const ids = idsDeCanciones(texto)
  if (ids.length) return { tipo: 'enlaces', ids }
  return { tipo: 'nombres', pistas: parsearPegado(texto) }
}

/** Cuántos ids entran en un pedido. El server rechaza más de 100. */
const TANDA_CANCIONES = 50

/**
 * Los nombres de un montón de canciones, por sus ids, con avance.
 *
 * Va por tandas por lo mismo que el emparejado: una lista de trescientas tarda,
 * y una barra que no se mueve durante un minuto se lee como que se colgó.
 */
export async function leerCancionesSpotify(
  ids: string[],
  opciones?: { signal?: AbortSignal; alAvanzar?: (avance: Avance) => void },
): Promise<PistaSpotify[]> {
  const salida: PistaSpotify[] = []

  for (let desde = 0; desde < ids.length; desde += TANDA_CANCIONES) {
    if (opciones?.signal?.aborted) break
    const tanda = ids.slice(desde, desde + TANDA_CANCIONES)

    const res = await fetchMusica(`${MUSIC_API}/spotify/canciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: tanda }),
      signal: opciones?.signal,
    })
    const datos = (await res.json()) as { pistas?: PistaSpotify[]; error?: string }
    if (!res.ok || datos.error || !datos.pistas) {
      throw new Error(datos.error ?? `No se pudieron leer las canciones (${res.status})`)
    }

    salida.push(...datos.pistas)
    opciones?.alAvanzar?.({ hechas: Math.min(desde + TANDA_CANCIONES, ids.length), total: ids.length })
  }

  return salida
}

/**
 * La lista escrita a mano, que es el respaldo de todo.
 *
 * Existe para tres casos que el enlace no cubre: una lista de más de 100, una
 * privada que no se quiere hacer pública, y el día —que va a llegar— en que
 * Spotify cambie su página y el lector deje de andar. Como produce lo mismo que
 * el enlace, de acá en adelante el sistema no sabe por dónde entró.
 *
 * Acepta lo que la gente pega de verdad:
 *
 *   Tame Impala - The Less I Know The Better     ← lo más común
 *   1. Tame Impala — The Less I Know The Better  ← numerado, con raya larga
 *   The Less I Know The Better · Tame Impala     ← como lo muestra un reproductor
 *   "Track Name","Artist Name(s)",…              ← el CSV de un exportador
 *
 * Los links de canción los atiende `interpretarPegado`, que llama a esto solo
 * cuando no encontró ninguno.
 */
export function parsearPegado(texto: string): PistaSpotify[] {
  const lineas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (!lineas.length) return []

  const csv = cabeceraCsv(lineas[0])
  if (csv) return lineas.slice(1).flatMap((linea) => pistaDeCsv(linea, csv))

  return lineas.flatMap((linea) => {
    // Numeración y viñetas al principio: «1.», «01)», «- », «• ».
    const limpia = linea.replace(/^\s*(?:\d+\s*[.)-]\s*|[-•*]\s+)/, '').trim()
    if (!limpia) return []

    /*
     * El separador puede ser guion, raya o punto medio, pero **solo si tiene
     * espacios alrededor**: sin eso, «Jay-Z» o «Mac DeMarco - Chamber» se
     * partirían por el lugar equivocado. Se usa el primero que aparezca.
     */
    const corte = limpia.match(/\s+[-–—·|]\s+/)
    if (!corte?.index) {
      // Sin separador no se puede saber qué es artista: se busca la línea
      // entera, que es lo que haría una persona escribiéndola en el buscador.
      return [pista(limpia, '', 0)]
    }

    const izquierda = limpia.slice(0, corte.index).trim()
    const derecha = limpia.slice(corte.index + corte[0].length).trim()
    if (!izquierda || !derecha) return [pista(limpia, '', 0)]

    /*
     * ¿Cuál de los dos lados es el artista?
     *
     * «Artista - Título» es lo abrumadoramente más común, así que es el
     * supuesto por defecto. El punto medio es la excepción: los reproductores
     * lo usan al revés, «Título · Artista», y respetarlo evita invertir toda
     * una lista pegada desde una captura.
     */
    return corte[0].includes('·')
      ? [pista(izquierda, derecha, 0)]
      : [pista(derecha, izquierda, 0)]
  })
}

function pista(titulo: string, artista: string, durationMs: number): PistaSpotify {
  return { uri: '', titulo, artista, durationMs, previewUrl: null }
}

type ColumnasCsv = { titulo: number; artista: number; duracion: number }

/** Las columnas que interesan de un CSV exportado, si la primera línea es una cabecera. */
function cabeceraCsv(primera: string): ColumnasCsv | null {
  if (!primera.includes(',')) return null
  const campos = partirCsv(primera).map((c) => c.toLowerCase().trim())
  const buscar = (...nombres: string[]) =>
    campos.findIndex((c) => nombres.some((n) => c === n || c.startsWith(n)))

  const titulo = buscar('track name', 'title', 'nombre', 'canción', 'cancion', 'song')
  const artista = buscar('artist name', 'artist', 'artista')
  if (titulo < 0 || artista < 0) return null

  return { titulo, artista, duracion: buscar('duration', 'duración', 'duracion', 'length') }
}

function pistaDeCsv(linea: string, columnas: ColumnasCsv): PistaSpotify[] {
  const campos = partirCsv(linea)
  const titulo = (campos[columnas.titulo] ?? '').trim()
  if (!titulo) return []
  return [
    pista(
      titulo,
      (campos[columnas.artista] ?? '').trim(),
      duracionDeTexto(columnas.duracion >= 0 ? (campos[columnas.duracion] ?? '') : ''),
    ),
  ]
}

/**
 * Una línea de CSV en sus campos, respetando las comillas.
 *
 * Partir por coma a secas no sirve acá: los títulos con coma —«Hello, Goodbye»—
 * y sobre todo la columna de varios artistas —«"Tyler, The Creator"»— vienen
 * entrecomillados justamente porque contienen el separador.
 */
function partirCsv(linea: string): string[] {
  const campos: string[] = []
  let actual = ''
  let entreComillas = false

  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]
    if (c === '"') {
      // Dos comillas seguidas adentro de un campo son una comilla literal.
      if (entreComillas && linea[i + 1] === '"') {
        actual += '"'
        i++
      } else entreComillas = !entreComillas
    } else if (c === ',' && !entreComillas) {
      campos.push(actual)
      actual = ''
    } else actual += c
  }
  campos.push(actual)
  return campos
}

/** «3:47» o «227000» o «227» — todo termina en milisegundos, o en 0. */
function duracionDeTexto(crudo: string): number {
  const texto = crudo.trim()
  if (!texto) return 0

  const reloj = texto.match(/^(\d+):(\d{1,2})$/)
  if (reloj) return (Number(reloj[1]) * 60 + Number(reloj[2])) * 1000

  const numero = Number(texto)
  if (!Number.isFinite(numero) || numero <= 0) return 0
  // Un número chico son segundos; uno grande, milisegundos. Ninguna canción
  // dura 6000 segundos, y ninguna dura 200 milisegundos.
  return numero > 6000 ? numero : numero * 1000
}

// ── Emparejar ──────────────────────────────────────────────────────────────

/** Cuántas van por pedido. El server rechaza más de 20. */
const LOTE = 10

export type Avance = { hechas: number; total: number }

/**
 * Empareja la lista entera, de a lotes, avisando el progreso.
 *
 * Los lotes son chicos y van uno detrás del otro a propósito: adentro de cada
 * uno el server ya paraleliza de a tres, y encimarle lotes en paralelo desde
 * acá multiplicaría las búsquedas simultáneas contra YouTube sin que el import
 * termine mucho antes. Lo que sí gana el cliente con lotes es poder mostrar
 * avance real y cortar por la mitad sin dejar trabajo colgado.
 */
export async function emparejarLista(
  pistas: PistaSpotify[],
  opciones?: { signal?: AbortSignal; alAvanzar?: (avance: Avance) => void },
): Promise<Emparejado[]> {
  const salida: Emparejado[] = []

  for (let desde = 0; desde < pistas.length; desde += LOTE) {
    if (opciones?.signal?.aborted) break
    const lote = pistas.slice(desde, desde + LOTE)

    const res = await fetchMusica(`${MUSIC_API}/emparejar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pistas: lote.map((p) => ({
          titulo: p.titulo,
          artista: p.artista,
          durationMs: p.durationMs,
        })),
      }),
      signal: opciones?.signal,
    })
    const datos = (await res.json()) as {
      emparejados?: { indice: number; confianza: Confianza; elegido: TrackResult | null; candidatos: Candidato[] }[]
      error?: string
    }
    if (!res.ok || datos.error || !datos.emparejados) {
      throw new Error(datos.error ?? `No se pudo emparejar (${res.status})`)
    }

    for (const resultado of datos.emparejados) {
      salida.push({
        pista: lote[resultado.indice],
        confianza: resultado.confianza,
        elegido: resultado.elegido,
        candidatos: resultado.candidatos ?? [],
      })
    }
    opciones?.alAvanzar?.({ hechas: Math.min(desde + LOTE, pistas.length), total: pistas.length })
  }

  return salida
}

// ── Guardar ────────────────────────────────────────────────────────────────

export type ResumenImport = {
  playlistId: string
  agregadas: number
  /** Ya estaban en la lista: el mismo video dos veces. */
  repetidas: number
  /** Se eligió no traerlas, o no se encontró nada. */
  salteadas: number
}

/**
 * Una canción importada entra **sin ruta de audio**, y eso es a propósito.
 *
 * La ruta vacía no es un hueco: es el estado que el motor ya conoce y sabe
 * resolver. `MotorAudio` mira `audioPath` antes de firmar nada y, si está
 * vacía, resuelve la canción contra el servicio —la que suena, mostrando el
 * error si falla; la que sigue, callado mientras suena la anterior—. Es el
 * mismo camino por el que entran la radio y las recomendaciones.
 *
 * La tentación era guardar la ruta que la canción **va a tener**
 * (`{videoId}.m4a`), y estuvo escrito así: parece más prolijo y funciona en la
 * teoría, porque firmar una ruta que no existe falla y `urlDeAudio` reintenta
 * resolviendo. En la práctica no llegaba ahí. Con la ruta puesta, el motor la
 * daba por buena, firmaba, Storage contestaba 400 y la canción moría en «No se
 * pudo abrir esa canción» sin que nadie llamara a `/resolve`. Vacía es la
 * verdad —todavía no hay audio— y la verdad es lo que el resto del código sabe
 * leer.
 */
const SIN_RESOLVER = ''

/**
 * Crea la lista y le mete las canciones elegidas.
 *
 * Las filas se insertan **una por una y en orden** porque la posición la calcula
 * la base (`add_playlist_track` hace `max(position) + 10`): mandarlas en
 * paralelo daría a varias el mismo número y la lista quedaría desordenada.
 */
export async function guardarLista(
  nombre: string,
  elegidas: { pista: PistaSpotify; track: TrackResult }[],
  opciones?: { signal?: AbortSignal; alAvanzar?: (avance: Avance) => void; salteadas?: number },
): Promise<ResumenImport> {
  const lista = await createPlaylist(nombre)

  let agregadas = 0
  let repetidas = 0

  for (const [indice, { pista, track }] of elegidas.entries()) {
    if (opciones?.signal?.aborted) break
    const nueva = await addTrack(lista.id, {
      videoId: track.videoId,
      title: track.title,
      artist: track.artist,
      artistId: track.artistId,
      artworkUrl: track.artworkUrl,
      artworkPath: track.artworkPath ?? null,
      audioPath: SIN_RESOLVER,
      /*
       * La duración de Spotify le gana a la de la búsqueda cuando esta viene
       * en cero, que pasa (ver `trackFrom` en el server). Sin esto, la fila
       * mostraría «0:00» hasta que alguien la reproduzca.
       */
      durationMs: track.durationMs || pista.durationMs,
      truePeak: undefined,
    })
    if (nueva) agregadas++
    else repetidas++
    opciones?.alAvanzar?.({ hechas: indice + 1, total: elegidas.length })
  }

  return {
    playlistId: lista.id,
    agregadas,
    repetidas,
    salteadas: opciones?.salteadas ?? 0,
  }
}

/**
 * Lo que queda por hacer después de que la lista ya se ve: carátulas y las
 * primeras canciones listas para sonar.
 *
 * Va aparte y en segundo plano porque nada de esto hace falta para que la
 * pantalla sirva, y porque los dos son pedidos que pueden fallar sin
 * consecuencia. Se llama sin esperar el resultado.
 *
 * **Carátulas:** se copian a nuestro bucket. Sin esta copia la fila muestra la
 * URL del CDN de Google, que responde 429 cada tanto y deja el cuadro vacío
 * (ver `lib/artwork`). Es una imagen chica por canción, y no toca YouTube.
 *
 * **Las primeras:** se resuelven de verdad —audio incluido— las que están
 * arriba de todo. Es lo que hace que darle play a una lista recién importada
 * suene al instante en vez de esperar la descarga. Son pocas a propósito: cada
 * una es un viaje a YouTube.
 */
export async function terminarEnSegundoPlano(
  playlistId: string,
  tracks: TrackResult[],
  cuantasPreparar = 3,
): Promise<void> {
  const supabase = getSupabase()

  for (const track of tracks.slice(0, cuantasPreparar)) {
    try {
      const resuelta = await resolveSong(track)
      /*
       * Lo resuelto se escribe en la fila.
       *
       * El motor completa la canción en la cola que está sonando, pero eso vive
       * en memoria y se pierde al cerrar. Guardarlo acá es lo que hace que la
       * lista abra ya lista en la próxima sesión, y lo que le da a la canción
       * una ruta real para poder bajarla al teléfono.
       */
      await supabase
        .from('playlist_tracks')
        .update({
          audio_path: resuelta.path,
          ...(resuelta.artworkPath ? { artwork_path: resuelta.artworkPath } : {}),
          ...(resuelta.durationMs ? { duration_ms: resuelta.durationMs } : {}),
        })
        .eq('playlist_id', playlistId)
        .eq('video_id', track.videoId)
    } catch {
      // Que no se pueda adelantar una canción no rompe nada: se va a resolver
      // sola cuando alguien la reproduzca.
    }
  }

  for (const track of tracks) {
    if (track.artworkPath || !track.artworkUrl) continue
    try {
      const path = await ensureArtwork(track.videoId, track.artworkUrl)
      if (!path) continue
      await supabase
        .from('playlist_tracks')
        .update({ artwork_path: path })
        .eq('playlist_id', playlistId)
        .eq('video_id', track.videoId)
    } catch {
      // La carátula sigue viéndose por la URL del CDN. No vale un error.
    }
  }
}
