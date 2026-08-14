import { getSupabase } from '../lib/supabase'

/**
 * Búsqueda de canciones, audio y letra sincronizada.
 *
 * El audio viene de **YouTube Music**, resuelto por el servicio de `server/`.
 * Nada de eso puede correr en el navegador (necesita Node, jsdom y la VM de
 * BotGuard), así que acá solo se lo consume.
 *
 * El servicio descarga la canción una sola vez y la deja en Supabase Storage;
 * la app la reproduce desde ahí con una URL firmada. Al tener el tema completo
 * —y no un preview de 30s— se puede recortar cualquier parte y, sobre todo, la
 * letra sincroniza exacto: los tiempos del LRC son de la canción entera.
 */

const MUSIC_API = process.env.EXPO_PUBLIC_MUSIC_API ?? 'http://localhost:8787'
const BUCKET = 'songs'

/**
 * Un pedido al servicio de música, firmado con tu sesión.
 *
 * El servicio está en internet y hace cosas caras —`/peaks` corre ffmpeg,
 * `/resolve` escribe en nuestro Storage— así que desde que es público exige
 * sesión. La credencial es el mismo JWT con el que la app le habla a Supabase:
 * no hay un secreto aparte que mantener, ni nada escondido en el bundle que
 * alguien pueda sacar del IPA.
 *
 * Va acá y no en cada llamada porque **todas** las de este archivo lo necesitan,
 * y una que se olvide de mandarlo falla con un 401 que no dice nada útil.
 *
 * La excepción es `artworkUrlAtSize`, que devuelve una URL para `<Image>` en vez
 * de hacer un pedido: ahí no hay dónde poner una cabecera, y por eso `/img` es
 * la única ruta que el servicio deja abierta.
 */
async function fetchMusica(url: string, init?: RequestInit): Promise<Response> {
  const { data } = await getSupabase().auth.getSession()
  const token = data.session?.access_token
  return fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
}
/** Las URLs firmadas duran lo suficiente para escuchar y recortar sin apuro. */
const SIGNED_URL_TTL_S = 60 * 60

export type TrackResult = {
  videoId: string
  title: string
  artist: string
  /** Canal del artista principal; null si el resultado no lo trae. */
  artistId: string | null
  album: string
  /** Id de navegación del álbum; null si el resultado no lo trae. */
  albumId: string | null
  artworkUrl: string
  durationMs: number
  /**
   * El audio ya resuelto, cuando el resultado nace de una canción guardada.
   *
   * Una fila de lista ya sabe dónde vive su audio; convertirla a resultado y
   * volver a resolver por `videoId` era un viaje de más — y para las canciones
   * propias (`propia:…`) era un viaje a ninguna parte: ese id no existe en
   * YouTube y encolarlas o reproducirlas desde un menú fallaba. Con esto,
   * `resolveForPlayback` usa lo que ya hay.
   */
  audioPath?: string
  artworkPath?: string | null
}

/** Una canción del top de un artista: lo mismo que un resultado, con el año. */
export type ArtistSong = TrackResult & { year: number | null }

export type ArtistInfo = {
  name: string
  photoUrl: string
  /** Nuestra copia de la foto; null si no se pudo guardar. */
  photoPath: string | null
  /** Proporción real (ancho/alto) para dibujarla sin recortar. */
  photoAspect: number | null
  description: string
  /** Texto tal cual lo da YouTube, ej. "4.32 million". */
  subscribers: string | null
  /**
   * Artistas relacionados, de la sección «Fans might also like».
   *
   * Lo calcula YouTube sobre la escucha agregada de todo el mundo; acá se
   * consume igual que su catálogo. Es la única puerta de la app a artistas que
   * quien escucha todavía no conoce — ver `services/recomendaciones`.
   */
  relacionados: HomeItem[]
  /** Lo más escuchado. Puede venir vacío si YouTube no arma ese estante. */
  topSongs: ArtistSong[]
  /** Discos, del más nuevo al más viejo. */
  albums: HomeItem[]
  singles: HomeItem[]
}

/** Un artista encontrado en la búsqueda. */
export type ArtistResult = {
  /** Id de canal; con esto se abre su página. */
  id: string
  name: string
  photoUrl: string
  subtitle: string
}

/**
 * Ficha del artista: su foto y su bio, su top y su discografía.
 *
 * Devuelve null en vez de tirar: es un paseo lateral, y si falla no tiene por
 * qué romper la pantalla desde la que se abrió.
 */
export async function fetchArtist(
  artistId: string,
  signal?: AbortSignal,
): Promise<ArtistInfo | null> {
  try {
    const res = await fetchMusica(`${MUSIC_API}/artist?id=${encodeURIComponent(artistId)}`, { signal })
    if (!res.ok) return null
    const data = (await res.json()) as ArtistInfo & { error?: string }
    return data.error ? null : data
  } catch {
    return null
  }
}

/**
 * Una carátula de la portada, servida por nuestro proxy.
 *
 * Las tapas de álbum viven en `yt3.googleusercontent.com`, que responde sin
 * CORS: Chrome descarta la respuesta entera (ORB) y quedan cuadros negros. Las
 * de canciones vienen de `i.ytimg.com` y no tienen ese problema, pero pasan
 * por el mismo lado para no tener dos caminos según de dónde salió la imagen.
 */
export function proxiedImage(url: string): string {
  if (!url) return ''
  return `${MUSIC_API}/img?u=${encodeURIComponent(url)}`
}

export type HomeItem = {
  /** Qué es: define a dónde lleva al tocarlo. */
  kind: 'song' | 'album' | 'playlist' | 'artist'
  /** videoId para canciones; id de navegación para el resto. */
  id: string
  title: string
  subtitle: string
  artworkUrl: string
  /**
   * El canal del artista, en las canciones que lo traen.
   *
   * Opcional porque un servidor sin actualizar no lo manda: la portada tiene
   * que seguir dibujándose igual. Con él, una escucha nacida acá se anota con
   * su artista y alimenta las recomendaciones; sin él, se anota sin id, que es
   * lo que dejaba al autoplay sin ancla.
   */
  artistId?: string | null
  /** Año de salida, cuando el subtítulo lo trae. Ordena la discografía. */
  year: number | null
}

export type HomeSection = {
  title: string
  items: HomeItem[]
}

/**
 * La portada: novedades, lo que suena, listas.
 *
 * Devuelve vacío en vez de tirar. Es contenido de vitrina: si YouTube no
 * responde, la app sigue andando con tus listas, que es lo que importa.
 */
export async function fetchHome(signal?: AbortSignal): Promise<HomeSection[]> {
  try {
    const res = await fetchMusica(`${MUSIC_API}/home`, { signal })
    if (!res.ok) return []
    const data = (await res.json()) as { sections?: HomeSection[] }
    return data.sections ?? []
  } catch {
    return []
  }
}

export type AlbumTrack = {
  videoId: string
  title: string
  artist: string
  durationMs: number
}

export type AlbumInfo = {
  title: string
  artist: string
  /** Texto tal cual lo da YouTube, ej. "Album • 2019". */
  subtitle: string
  artworkUrl: string
  /** Nuestra copia de la tapa; null si no se pudo guardar. */
  artworkPath: string | null
  tracks: AlbumTrack[]
}

/**
 * Un álbum con sus canciones.
 *
 * Devuelve null en vez de tirar, igual que la ficha del artista: es un paseo
 * lateral, y si falla no tiene por qué romper la pantalla desde la que se abrió.
 */
export async function fetchAlbum(
  albumId: string,
  signal?: AbortSignal,
  kind: 'album' | 'playlist' = 'album',
): Promise<AlbumInfo | null> {
  try {
    const res = await fetchMusica(`${MUSIC_API}/${kind}?id=${encodeURIComponent(albumId)}`, { signal })
    if (!res.ok) return null
    const data = (await res.json()) as AlbumInfo & { error?: string }
    return data.error ? null : data
  } catch {
    return null
  }
}

/**
 * Lo que devuelve una búsqueda: canciones y artistas.
 *
 * Van juntos y no en dos pedidos porque quien escribe un nombre no sabe todavía
 * qué está buscando —«cigarettes after sex» puede ser la banda o cualquiera de
 * sus temas— y la respuesta tiene que poder ofrecerle las dos cosas de una.
 */
export type SearchHits = { tracks: TrackResult[]; artists: ArtistResult[] }

export async function searchMusic(query: string, signal?: AbortSignal): Promise<SearchHits> {
  const term = query.trim()
  if (!term) return { tracks: [], artists: [] }

  const res = await fetchMusica(`${MUSIC_API}/search?q=${encodeURIComponent(term)}`, { signal })
  if (!res.ok) throw new Error(`El servicio de música respondió ${res.status}`)
  const data = (await res.json()) as {
    results?: TrackResult[]
    artists?: ArtistResult[]
    error?: string
  }
  if (data.error) throw new Error(data.error)
  return { tracks: data.results ?? [], artists: data.artists ?? [] }
}

/** Solo las canciones, para quien no tiene dónde poner un artista. */
export async function searchTracks(query: string, signal?: AbortSignal): Promise<TrackResult[]> {
  return (await searchMusic(query, signal)).tracks
}

export type ResolvedSong = {
  /** Ruta dentro del bucket; es lo que se guarda en el mensaje. */
  path: string
  /** Nuestra copia de la carátula; null si no se pudo guardar. */
  artworkPath: string | null
  /** URL firmada, temporal. No se persiste: se firma de nuevo al reproducir. */
  url: string
  durationMs: number
}

/**
 * Deja la canción disponible para reproducir.
 *
 * La primera vez descarga de YouTube Music (unos segundos); después el servicio
 * la encuentra en Storage y responde al instante.
 */
export async function resolveSong(track: TrackResult, signal?: AbortSignal): Promise<ResolvedSong> {
  const res = await fetchMusica(`${MUSIC_API}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // La carátula va en el pedido: el servicio la copia a Storage y así deja
    // de depender del CDN de Google, que la corta con 429 cada tanto. La
    // duración también, si se sabe: el camino cacheado la devuelve tal cual y
    // solo mide el archivo cuando no la sabe nadie (portada: viene en cero).
    body: JSON.stringify({
      videoId: track.videoId,
      artworkUrl: track.artworkUrl,
      durationMs: track.durationMs || undefined,
    }),
    signal,
  })
  const data = (await res.json()) as {
    path?: string
    artworkPath?: string | null
    durationMs?: number
    error?: string
  }
  if (!res.ok || data.error || !data.path) {
    throw new Error(data.error ?? `No se pudo preparar la canción (${res.status})`)
  }
  return {
    path: data.path,
    artworkPath: data.artworkPath ?? null,
    url: await signedUrl(data.path),
    durationMs: data.durationMs ?? track.durationMs,
  }
}

export type PropiaSubida = {
  path: string
  durationMs: number
  title: string | null
  artist: string | null
  artworkPath: string | null
}

/**
 * Sube un archivo de audio propio y devuelve lo que el servidor le leyó:
 * duración, etiquetas y tapa embebida. La primera música de la app que no
 * sale de YouTube Music — sale de la compu de quien escucha.
 */
export async function subirCancionPropia(archivo: Blob, nombre: string): Promise<PropiaSubida> {
  const res = await fetchMusica(`${MUSIC_API}/propia?nombre=${encodeURIComponent(nombre)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: archivo,
  })
  const data = (await res.json()) as Partial<PropiaSubida> & { error?: string }
  if (!res.ok || data.error || !data.path) {
    throw new Error(data.error ?? `No se pudo subir (${res.status})`)
  }
  return {
    path: data.path,
    durationMs: data.durationMs ?? 0,
    title: data.title ?? null,
    artist: data.artist ?? null,
    artworkPath: data.artworkPath ?? null,
  }
}

/**
 * Se asegura de que la carátula esté copiada, y devuelve su ruta.
 *
 * Sirve para los fragmentos guardados antes de que existiera el caché: traen
 * solo la URL del CDN, que se bloquea cada tanto. Devuelve null si no se pudo,
 * y ahí quien llama se queda con la URL original.
 */
export async function ensureArtwork(videoId: string, url: string): Promise<string | null> {
  if (!videoId || !url) return null
  try {
    const res = await fetchMusica(`${MUSIC_API}/artwork`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, url }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { path?: string | null }
    return data.path ?? null
  } catch {
    return null
  }
}

/** Firma una ruta del bucket para poder reproducirla o decodificarla. */
export async function signedUrl(path: string): Promise<string> {
  const { data, error } = await getSupabase()
    .storage.from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_S)
  /*
   * El mensaje del error puede venir **vacío**.
   *
   * `??` solo cubre `null` y `undefined`, así que un error de Storage con
   * `message: ''` pasaba de largo y salía un `Error('')`. Sin texto, la app
   * mostraba un recuadro rojo con `Object { "message": "" }` y no había forma de
   * saber qué había fallado. Cualquier cosa vacía cae al texto de respaldo.
   */
  if (error || !data?.signedUrl) {
    throw new Error(error?.message?.trim() || 'No se pudo preparar esa canción.')
  }
  return data.signedUrl
}

// ── Onda de audio ──────────────────────────────────────────────────────────

export type Waveform = {
  /** Amplitud por bucket, normalizada a 0..1. */
  peaks: number[]
  /** Duración real del audio decodificado, en ms. */
  durationMs: number
}

/**
 * Pico por encima del cual hay que bajar el volumen para no distorsionar.
 *
 * Se aplica a los fragmentos que no traen su pico medido (mensajes viejos): los
 * temas medidos daban entre +0.97 y +2.82 dBFS, así que 1.4 (−2.9 dB) cubre el
 * rango observado sin quedarse corto.
 */
const ASSUMED_PEAK = 1.4

/**
 * Margen para no quedar clavado justo en el techo.
 *
 * Con ganancia exacta (1/pico) la señal aterriza en 0.00 dBFS y cualquier
 * diferencia de redondeo del decodificador vuelve a asomar por encima. Medido:
 * con la ganancia exacta el pico daba +0.02 dBFS. Bajar un pelo lo resuelve y
 * es inaudible.
 */
const SAFETY = 0.97

/**
 * Cuánto hay que atenuar para que la señal no pase de fondo de escala.
 *
 * Los códecs con pérdida no garantizan que lo decodificado quepa en ±1: al
 * reconstruir la forma de onda aparecen picos entre muestras que se pasan del
 * original. En estos temas eso da hasta +2.82 dBFS. La salida de audio recorta
 * todo lo que pase de ±1, y ese recorte es distorsión audible — se oye como
 * ruido o interferencia sobre los pasajes fuertes.
 *
 * YouTube Music no tiene el problema porque su reproductor normaliza volumen
 * con el dato de `loudnessDb`; nosotros servimos el stream tal cual, así que la
 * compensación la hacemos acá. La atenuación es de 1 a 3 dB: prácticamente
 * inaudible como cambio de volumen, y es la diferencia entre limpio y sucio.
 */
export function headroomGain(truePeak: number | undefined): number {
  const peak = truePeak && truePeak > 0 ? truePeak : ASSUMED_PEAK
  return Math.min(1, SAFETY / peak)
}

/**
 * La forma de onda de una canción, para dibujarla en el editor.
 *
 * La calcula el servicio de música con ffmpeg y no el cliente.
 *
 * Antes se decodificaba el tema entero acá con Web Audio, que existe en el
 * navegador y **no** en el teléfono: en iOS la pantalla de elegir el fragmento
 * moría con «este navegador no soporta Web Audio». Además cada plataforma podía
 * dibujar una onda distinta; ahora es la misma cuenta para todos.
 *
 * El pico real ya no viaja: medirlo bien exigía el audio sin bajar de calidad,
 * y sin él `headroomGain` cae en su margen fijo, que es conservador. Antes que
 * un número aproximado que puede distorsionar, ninguno.
 */
export async function fetchWaveform(
  videoId: string,
  buckets = 160,
  signal?: AbortSignal,
): Promise<Waveform> {
  const res = await fetchMusica(
    `${MUSIC_API}/peaks?videoId=${encodeURIComponent(videoId)}&buckets=${buckets}`,
    { signal },
  )
  const data = (await res.json()) as Waveform & { error?: string }
  if (!res.ok || data.error) throw new Error(data.error ?? 'No se pudo leer la canción')
  return data
}

// ── Letra sincronizada ─────────────────────────────────────────────────────

export type LyricLine = {
  /** Momento de la línea, en ms desde el inicio de la canción. */
  atMs: number
  text: string
}

const LRCLIB_SEARCH = 'https://lrclib.net/api/search'

/**
 * Busca la letra sincronizada en LRCLIB (gratis, sin API key, CORS abierto).
 *
 * Se usa /search y no /get porque /get exige que la duración coincida casi
 * exactamente y devuelve 404 ante la mínima diferencia; acá se elige el
 * resultado con la duración más parecida.
 *
 * Devuelve null si no hay versión sincronizada: mostrar la letra plana sin
 * tiempos sería peor que no mostrar nada, porque no puede seguir la canción.
 */
export async function fetchLyrics(
  artist: string,
  title: string,
  trackDurationMs: number,
  signal?: AbortSignal,
): Promise<LyricLine[] | null> {
  const url = `${LRCLIB_SEARCH}?${new URLSearchParams({ artist_name: artist, track_name: title })}`
  const res = await fetch(url, { signal })
  if (!res.ok) return null

  const results = (await res.json()) as {
    duration?: number
    syncedLyrics?: string | null
  }[]
  const synced = results.filter((r) => r.syncedLyrics)
  if (!synced.length) return null

  const targetSec = trackDurationMs / 1000
  const best = synced.reduce((a, b) =>
    Math.abs((a.duration ?? 0) - targetSec) <= Math.abs((b.duration ?? 0) - targetSec) ? a : b,
  )

  const lines = parseLrc(best.syncedLyrics as string)
  return lines.length ? lines : null
}

/** `[mm:ss.xx] texto` → { atMs, text }. Ignora metadatos y líneas vacías. */
export function parseLrc(lrc: string): LyricLine[] {
  const LINE = /^\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]\s?(.*)$/
  const lines: LyricLine[] = []

  for (const raw of lrc.split('\n')) {
    const m = LINE.exec(raw.trim())
    if (!m) continue
    const [, mm, ss, frac, text] = m
    if (!text.trim()) continue
    // La fracción puede venir en centésimas (.85) o milésimas (.850).
    const fracMs = frac ? Number(frac.padEnd(3, '0')) : 0
    lines.push({ atMs: Number(mm) * 60_000 + Number(ss) * 1000 + fracMs, text: text.trim() })
  }

  return lines.sort((a, b) => a.atMs - b.atMs)
}

// ── Traducción de la letra ─────────────────────────────────────────────────

/**
 * Idiomas que ofrece el selector. `off` es la letra tal como vino.
 *
 * La lista es corta a propósito: no es un traductor, es una ayuda para entender
 * qué dice la canción que estás por mandar.
 */
export const LYRIC_LANGS = [
  { value: 'off', label: 'Original', short: '' },
  { value: 'es', label: 'Español', short: 'ES' },
  { value: 'en', label: 'Inglés', short: 'EN' },
  { value: 'pt', label: 'Portugués', short: 'PT' },
  { value: 'fr', label: 'Francés', short: 'FR' },
  { value: 'it', label: 'Italiano', short: 'IT' },
  { value: 'de', label: 'Alemán', short: 'DE' },
  { value: 'ja', label: 'Japonés', short: 'JA' },
] as const

export type LyricLang = (typeof LYRIC_LANGS)[number]['value']

/**
 * Traduce la letra conservando los tiempos.
 *
 * El servicio devuelve una línea por cada una que se le mandó —traduce de a
 * una justamente para eso—, así que los `atMs` originales siguen valiendo y la
 * letra traducida sigue a la canción igual que la original.
 */
export async function translateLyrics(
  lines: LyricLine[],
  to: Exclude<LyricLang, 'off'>,
  signal?: AbortSignal,
): Promise<LyricLine[]> {
  const res = await fetchMusica(`${MUSIC_API}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, texts: lines.map((l) => l.text) }),
    signal,
  })
  if (!res.ok) throw new Error('No se pudo traducir la letra.')

  const { texts } = (await res.json()) as { texts: string[] }
  if (texts.length !== lines.length) throw new Error('La traducción volvió incompleta.')

  return lines.map((l, i) => ({ atMs: l.atMs, text: texts[i] }))
}

/** Índice de la línea que corresponde a `atMs`, o -1 si todavía no arrancó. */
export function activeLyricIndex(lines: LyricLine[], atMs: number): number {
  let lo = 0
  let hi = lines.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].atMs <= atMs) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found
}
