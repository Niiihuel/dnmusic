import { trabajosCompartidos } from '../lib/trabajosCompartidos'
import { getSupabase } from '../lib/supabase'
import { validMixSpectrum, type MixSpectrumBands } from '../lib/mixSpectrum'
import { parseLrc, type LyricLine } from './letra'
import { hayResolutorABordo, resolverYAportar } from './motor/resolutorABordo'
import { iniciarResolucion, progresoResolucion, terminarResolucion } from '../state/resolucion'

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

const MUSIC_API = (process.env.EXPO_PUBLIC_MUSIC_API ?? 'http://localhost:8787').trim().replace(/\/+$/, '')

/**
 * El servicio de música, ahora entero en Vercel.
 *
 * Vivió en un contenedor de Railway, y por un tiempo partido: las rutas que no
 * hablan con YouTube (`/img`, `/translate`, `/spotify`, `/artwork`) se habían
 * mudado a una función de Vercel y el resto se quedaba allá, así que hubo una
 * segunda variable para apuntar a cada mitad. Ya no: es un solo origen y una
 * sola variable.
 *
 * El reparto sigue existiendo, pero del lado del servidor y sin que a esto le
 * importe: son dos funciones detrás de las mismas rutas —una chica para el
 * proxy de carátulas, que es la de más volumen y se cachea en el CDN, y otra
 * con youtubei.js y ffmpeg para todo lo demás—. Ver `server/api/`.
 *
 * Lo que **no** se mudó es el audio: bajarlo de YouTube desde una IP de
 * datacenter no funciona, ni en Railway ni en Vercel —los siete clientes
 * contestan «Sign in to confirm you're not a bot», incluidos los que ni pasan
 * por BotGuard—. Eso lo resuelve cada aparato con su propia IP y lo aporta al
 * caché de todos (ver `resolutorDeAca`, más abajo).
 */

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
 *
 * Se exporta porque `services/importar` habla con el mismo servicio y necesita
 * la misma credencial. Vive acá y no en `lib/` porque es de este servicio: no
 * es un `fetch` de propósito general.
 */
export async function fetchMusica(url: string, init?: RequestInit): Promise<Response> {
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
  /* Solo lo de Google pasa por el proxy: es el único CDN que corta sin CORS.
     Una tapa de nuestro Storage —las del historial, las de las listas— se
     dibuja directo; pasarla por la función era un viaje de más y, con el
     servicio caído, un cuadrado gris donde había una imagen perfectamente
     accesible. */
  try {
    if (!SIN_CORS.test(new URL(url).hostname)) return url
  } catch {
    return ''
  }
  return `${MUSIC_API}/img?u=${encodeURIComponent(url)}`
}

/** Los CDN de Google, que responden sin CORS y por eso van por el proxy. */
const SIN_CORS = /(^|\.)(googleusercontent\.com|ggpht\.com|ytimg\.com)$/i

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

/**
 * Las filas tejidas de los géneros que la persona eligió en el onboarding.
 *
 * Van **arriba** de la portada de YouTube Music: primero lo suyo —una fila de
 * listas por cada género marcado—, después lo nuevo para descubrir. Las
 * semillas viajan en el pedido; el servidor no necesita saber quién sos.
 *
 * Vacío si no hay semillas o si el servidor no pudo: en los dos casos el home
 * se queda con la portada de siempre, que es contenido válido.
 */
export async function fetchHomeGeneros(
  semillas: { kind: string; ref: string; name: string }[],
  signal?: AbortSignal,
): Promise<HomeSection[]> {
  if (!semillas.length) return []
  try {
    const res = await fetchMusica(`${MUSIC_API}/home-generos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ semillas }),
      signal,
    })
    if (!res.ok) return []
    const data = (await res.json()) as { sections?: HomeSection[] }
    return data.sections ?? []
  } catch {
    return []
  }
}

/** Una categoría de «géneros y momentos» de YouTube Music. */
export type Genero = {
  /** El parámetro opaco con el que se pide su página. */
  params: string
  name: string
  /** Una tapa representativa, para la tarjeta de la grilla. */
  artworkUrl: string
}

export async function fetchGeneros(signal?: AbortSignal): Promise<Genero[]> {
  try {
    const res = await fetchMusica(`${MUSIC_API}/generos`, { signal })
    if (!res.ok) return []
    const data = (await res.json()) as { generos?: Genero[] }
    return data.generos ?? []
  } catch {
    return []
  }
}

/** Lo que hay adentro de un género: listas y álbumes, como ítems de portada. */
export async function fetchGenero(params: string, signal?: AbortSignal): Promise<HomeItem[]> {
  try {
    const res = await fetchMusica(
      `${MUSIC_API}/genero?params=${encodeURIComponent(params)}`,
      { signal },
    )
    if (!res.ok) return []
    const data = (await res.json()) as { items?: HomeItem[] }
    return data.items ?? []
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

const busquedas = new Map<string, { hits: SearchHits; vence: number }>()

function verificarBusquedaActiva(signal?: AbortSignal): void {
  // El AbortSignal de React Native no siempre implementa throwIfAborted.
  if (signal?.aborted) throw Object.assign(new Error('Búsqueda cancelada'), { name: 'AbortError' })
}

export async function searchMusic(query: string, signal?: AbortSignal): Promise<SearchHits> {
  verificarBusquedaActiva(signal)
  const term = query.normalize('NFC').trim().replace(/\s+/g, ' ')
  if (!term) return { tracks: [], artists: [] }
  const guardada = busquedas.get(term)
  if (guardada && guardada.vence > Date.now()) return guardada.hits
  busquedas.delete(term)

  const res = await fetchMusica(`${MUSIC_API}/search?q=${encodeURIComponent(term)}`, { signal })
  if (!res.ok) throw new Error(`El servicio de música respondió ${res.status}`)
  const data = (await res.json()) as {
    results?: TrackResult[]
    artists?: ArtistResult[]
    error?: string
  }
  if (data.error) throw new Error(data.error)
  verificarBusquedaActiva(signal)
  const hits = { tracks: data.results ?? [], artists: data.artists ?? [] }
  busquedas.set(term, { hits, vence: Date.now() + 60_000 })
  while (busquedas.size > 100) busquedas.delete(busquedas.keys().next().value!)
  return hits
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
const compartirResolucion = trabajosCompartidos<ResolvedSong>()

export function resolveSong(track: TrackResult, signal?: AbortSignal): Promise<ResolvedSong> {
  return compartirResolucion(track.videoId, compartida => resolverCancion(track, compartida), signal)
}

async function resolverCancion(track: TrackResult, signal?: AbortSignal): Promise<ResolvedSong> {
  // La carátula va en el pedido: el servicio la copia a Storage y así deja de
  // depender del CDN de Google, que la corta con 429 cada tanto. La duración
  // también, si se sabe: el camino cacheado la devuelve tal cual y solo mide el
  // archivo cuando no la sabe nadie (portada: viene en cero).
  //
  // El avance de la resolución va al store (`state/resolucion`) para que la
  // tapa de la fila muestre un porcentaje en vez de una rueda. Se apaga sí o sí
  // al terminar —salga bien, falle o se cancele—.
  iniciarResolucion(track.videoId)
  try {
    const data = await pedirResolve(
      {
        videoId: track.videoId,
        artworkUrl: track.artworkUrl,
        durationMs: track.durationMs || undefined,
      },
      signal,
      (pct) => progresoResolucion(track.videoId, pct),
    )
    return {
      path: data.path,
      artworkPath: data.artworkPath ?? null,
      url: await signedUrl(data.path),
      durationMs: data.durationMs ?? track.durationMs,
    }
  } finally {
    terminarResolucion(track.videoId)
  }
}

/**
 * El resolutor de a bordo de esta sesión, si lo hay.
 *
 * Cuando la IP del servidor está en la reja anti-bot de YouTube —le pasa a las
 * IPs de datacenter por temporadas—, el dispositivo puede bajar el audio con
 * **su propia IP** y aportárselo al servidor, que lo verifica con ffprobe y lo
 * guarda en Storage para todos: la canción que resolvió uno le suena después a
 * cualquiera desde el caché.
 *
 * Hay dos, y se prueban en ese orden:
 *
 *   1. **El escritorio**, por el puente de Electron. Es el más barato: la
 *      resolución corre en el proceso principal, con Node entero.
 *   2. **El teléfono**, por el motor del WebView (`src/services/motor/`). Vino
 *      después y por un motivo concreto: quien solo tiene un iPhone dependía de
 *      que alguien más prendiera una compu, y eso no es una app que funcione.
 *
 * El navegador no tiene ninguno: hablar con InnerTube desde una página lo frena
 * CORS, que es exactamente lo que una app nativa no sufre.
 */
function resolutorDeAca():
  | ((opciones: {
      videoId: string
      apiBase: string
      token: string
      artworkUrl?: string
      durationMs?: number
    }) => Promise<{ path: string; artworkPath: string | null; durationMs: number | null }>)
  | undefined {
  const puente = (globalThis as { dnmusicEscritorio?: { resolver?: unknown } }).dnmusicEscritorio
  if (typeof puente?.resolver === 'function') {
    return puente.resolver as ReturnType<typeof resolutorDeAca>
  }
  return hayResolutorABordo() ? resolverYAportar : undefined
}

/** Si esta sesión corre adentro de la app de escritorio. */
function esEscritorio(): boolean {
  return (globalThis as { dnmusicEscritorio?: unknown }).dnmusicEscritorio !== undefined
}

/**
 * El mensaje pelado, sin la envoltura que le pone el puente de Electron.
 *
 * Un error que cruza el IPC llega con el molde `Error invoking remote method
 * 'resolver:aportar': Error: …` adelante — cincuenta y cinco caracteres de
 * ceremonia antes de la primera letra útil—. Con el recorte a ochenta, eso se
 * comía justo el dato que importa: se leyó en una captura «googlevideo
 * respondió 4…», con el código de estado cortado al medio, que es el único
 * número que distingue un 403 de un 429.
 */
function pelar(texto: string): string {
  return texto
    .replace(/^Error invoking remote method '[^']*':\s*/i, '')
    .replace(/^(Error|TypeError):\s*/i, '')
    .trim()
}

/** Un texto largo, recortado para que entre en un aviso. */
function recorte(texto: string, largo = 140): string {
  const limpio = pelar(texto).replace(/\s+/g, ' ')
  return limpio.length > largo ? `${limpio.slice(0, largo - 1)}…` : limpio
}

/**
 * Por qué no pudo **este aparato**, dicho para quien lo está leyendo.
 *
 * Cuando el servidor no puede, el plan B es resolver acá con la IP propia. Si
 * ese también falla, hasta ahora viajaba el mensaje **del servidor**: se leía
 * «YouTube no está entregando el audio», que es cierto a medias y sobre todo
 * esconde lo único accionable — que el intento local también se cayó, y por
 * qué—. El detalle entero sigue yendo al log; acá va una frase.
 *
 * Mismo criterio que `motivoParaLaApp` en el servidor: una sola frase, sin
 * nombres de clientes ni volcados. La diferencia es que esta **dice dónde**
 * falló, que es lo que distingue «esperá un rato» de «tenés que hacer algo».
 */
function motivoDeAca(e: unknown): string {
  /* Pelado antes de clasificar: si no, la envoltura del IPC empuja el motivo
     real fuera del recorte y además puede hacer fallar los reconocimientos. */
  const texto = pelar((e as Error)?.message ?? '')
  const aparato = esEscritorio() ? 'esta computadora' : 'este teléfono'

  if (/YouTube pausó las descargas/i.test(texto)) return texto
  if (/BotGuard|verificar el navegador|navegador.*(token|tiempo)/i.test(texto)) {
    return `YouTube no pudo verificar la sesión de ${aparato}. Esperá un minuto antes de volver a intentar.`
  }
  if (/googlevideo respondió (403|429)/i.test(texto)) {
    return `YouTube rechazó la descarga desde ${aparato}. Esperá un rato antes de volver a intentar.`
  }
  if (/LOGIN_REQUIRED|not a bot|Sin audio desde/i.test(texto)) {
    return `Ni el servidor ni ${aparato} pudieron sacarla de YouTube ahora mismo. Suele ser pasajero: probá en un rato.`
  }
  if (/El aporte falló \(401\)|No autorizado/i.test(texto)) {
    return 'Tu sesión venció mientras se preparaba la canción. Salí y volvé a entrar.'
  }
  if (/El aporte falló \(404\)/i.test(texto)) {
    return 'La dirección del servicio de música ya no está disponible. Actualizá la app y probá de nuevo.'
  }
  if (/El aporte falló/i.test(texto)) {
    return `${aparato === 'esta computadora' ? 'Esta computadora' : 'Este teléfono'} la bajó, pero el servidor no la aceptó (${recorte(texto, 80)}).`
  }
  if (/googlevideo|Descarga inconsistente|No se descargó audio/i.test(texto)) {
    return `YouTube cortó la descarga desde ${aparato} (${recorte(texto, 80)}). Probá de nuevo.`
  }
  if (/no ofreció audio AAC/i.test(texto)) {
    return 'YouTube no ofrece para esta canción un formato que podamos guardar.'
  }
  return `${aparato === 'esta computadora' ? 'Esta computadora' : 'Este teléfono'} tampoco pudo: ${recorte(texto)}`
}

/** El viaje a `/resolve` pelado, que comparten resolver y recuperar. */
async function pedirResolve(
  body: { videoId: string; artworkUrl?: string; durationMs?: number },
  signal?: AbortSignal,
  onProgreso?: (pct: number) => void,
): Promise<{ path: string; artworkPath?: string | null; durationMs?: number }> {
  try {
    return await pedirResolveAlServidor(body, signal, onProgreso)
  } catch (e) {
    /*
     * El servidor no pudo: si hay resolutor de a bordo, se intenta acá.
     *
     * Solo con un videoId con forma de YouTube —las canciones propias no
     * tienen a dónde ir a buscarse— y nunca sobre un pedido cancelado.
     *
     * Si el plan B **también** falla, lo que viaja es su motivo y no el del
     * servidor. Antes salía el del servidor, y era engañoso: decía «YouTube no
     * está entregando el audio» —la reja contra la IP del datacenter— cuando lo
     * que de verdad había pasado es que el intento con la IP de casa, que es el
     * que existe justamente para esquivar esa reja, se cayó por otra cosa. El
     * texto técnico entero queda en el log; a la pantalla va una frase que dice
     * dónde falló (ver `motivoDeAca`).
     */
    const resolver = resolutorDeAca()
    if (signal?.aborted || !/^[\w-]{11}$/.test(body.videoId)) throw e

    if (!resolver) {
      /*
       * Adentro del escritorio y sin resolutor: es una versión vieja.
       *
       * El puente existe (por eso sabemos que estamos en la app de PC) pero no
       * expone `resolver`, así que esta app **no tiene** plan B: depende
       * enteramente de que la IP del servidor no esté en la reja de YouTube.
       * Decirlo es lo único accionable —actualizar—, y era invisible: se veía
       * el mismo mensaje del servidor que ve la web.
       */
      if (esEscritorio()) {
        throw new Error(
          'Esta versión del escritorio no puede resolver por su cuenta. Actualizá la app y probá de nuevo.',
        )
      }
      throw e
    }

    const { data } = await getSupabase().auth.getSession()
    const token = data.session?.access_token
    if (!token) throw e
    try {
      const aporte = await resolver({ ...body, apiBase: MUSIC_API, token })
      return {
        path: aporte.path,
        artworkPath: aporte.artworkPath,
        durationMs: aporte.durationMs ?? undefined,
      }
    } catch (deAca) {
      /* El detalle técnico entero al log —es lo que sirve para diagnosticar—;
         a la pantalla, la frase que dice **dónde** se cayó. */
      console.warn(`[resolve] el plan B de a bordo tampoco pudo: ${(deAca as Error).message}`)
      throw new Error(motivoDeAca(deAca))
    }
  }
}

/**
 * `/resolve/progreso` leído de a poco, para pintar el porcentaje.
 *
 * Va por XHR y no por fetch a propósito: en iOS el fetch de React Native no
 * deja leer el cuerpo mientras llega, pero un XHR ve crecer `responseText` con
 * cada chunk. El server manda una línea JSON por evento (NDJSON): `{pct}`
 * mientras baja y `{resultado}` (o `{error}`) al final.
 */
function pedirResolveConProgreso(
  body: { videoId: string; artworkUrl?: string; durationMs?: number },
  onProgreso: (pct: number) => void,
  signal?: AbortSignal,
): Promise<{ path: string; artworkPath?: string | null; durationMs?: number }> {
  return new Promise((resolver, rechazar) => {
    void getSupabase()
      .auth.getSession()
      .then(({ data }) => {
        const token = data.session?.access_token
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${MUSIC_API}/resolve/progreso`)
        xhr.setRequestHeader('Content-Type', 'application/json')
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

        let visto = 0
        let buffer = ''
        let resultado: { path: string; artworkPath?: string | null; durationMs?: number } | null =
          null
        let error: string | null = null

        const procesar = () => {
          const texto = xhr.responseText
          buffer += texto.slice(visto)
          visto = texto.length
          let corte: number
          while ((corte = buffer.indexOf('\n')) >= 0) {
            const linea = buffer.slice(0, corte).trim()
            buffer = buffer.slice(corte + 1)
            if (!linea) continue
            try {
              const obj = JSON.parse(linea) as {
                pct?: number
                resultado?: { path?: string; artworkPath?: string | null; durationMs?: number }
                error?: string
              }
              if (typeof obj.pct === 'number') onProgreso(Math.max(0, Math.min(1, obj.pct)))
              else if (obj.resultado?.path)
                resultado = {
                  path: obj.resultado.path,
                  artworkPath: obj.resultado.artworkPath ?? null,
                  durationMs: obj.resultado.durationMs,
                }
              else if (typeof obj.error === 'string') error = obj.error
            } catch {
              // Una línea a medias de un chunk: se ignora, vuelve entera después.
            }
          }
        }

        xhr.onprogress = procesar
        xhr.onload = () => {
          procesar()
          if (resultado) resolver(resultado)
          else rechazar(new Error(error ?? `No se pudo preparar la canción (${xhr.status})`))
        }
        xhr.onerror = () => rechazar(new Error('No se pudo preparar la canción.'))
        xhr.onabort = () => {
          const e = new Error('Cancelado')
          e.name = 'AbortError'
          rechazar(e)
        }
        if (signal) {
          if (signal.aborted) {
            xhr.abort()
            return
          }
          signal.addEventListener('abort', () => xhr.abort(), { once: true })
        }
        xhr.send(JSON.stringify(body))
      })
      .catch(rechazar)
  })
}

async function pedirResolveAlServidor(
  body: { videoId: string; artworkUrl?: string; durationMs?: number },
  signal?: AbortSignal,
  onProgreso?: (pct: number) => void,
): Promise<{ path: string; artworkPath?: string | null; durationMs?: number }> {
  /*
   * Con quien quiere ver el avance, primero el camino que lo cuenta
   * (`/resolve/progreso`). Si ese server es viejo y no lo tiene, o el stream se
   * corta, cae al `/resolve` de siempre —sin número, pero funciona igual—. Un
   * corte a propósito (abort) no se disimula: se propaga.
   */
  if (onProgreso) {
    try {
      return await pedirResolveConProgreso(body, onProgreso, signal)
    } catch (e) {
      if (signal?.aborted) throw e
    }
  }
  const res = await fetchMusica(`${MUSIC_API}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
  return { path: data.path, artworkPath: data.artworkPath ?? null, durationMs: data.durationMs }
}

/**
 * URL para escuchar una ruta guardada, aunque la ruta haya envejecido.
 *
 * Una ruta de audio se guarda con su extensión —`abc123.webm`, `abc123.m4a`— y
 * la extensión **no es parte de la identidad de la canción**: es el formato que
 * YouTube ofreció ese día. Cuando el nombre canónico pasó a `.m4a`, todo lo que
 * ya estaba guardado apuntando al `.webm` quedó apuntando a la nada, y Storage
 * responde con un «Object not found» que la app mostraba tal cual: un fragmento
 * fijado hace meses dejaba de sonar sin decir por qué.
 *
 * Acá se vuelve a resolver por `videoId`, que sí es identidad: el servicio
 * devuelve la ruta que existe hoy —o la vuelve a bajar si no existe ninguna— y
 * la canción suena. Quien llama recibe también la ruta nueva, por si la puede
 * guardar y ahorrarse el rodeo la próxima vez.
 *
 * Las canciones propias no tienen a dónde volver: su audio es el archivo que
 * alguien subió y no se puede regenerar. Ahí el error viaja tal cual.
 */
export async function urlDeAudio(
  path: string,
  videoId?: string,
): Promise<{ url: string; path: string }> {
  try {
    return { url: await signedUrl(path), path }
  } catch (e) {
    if (!videoId || videoId.startsWith('propia:') || path.includes('/')) throw e
    const { path: vigente } = await pedirResolve({ videoId })
    if (vigente === path) throw e
    return { url: await signedUrl(vigente), path: vigente }
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
  /*
   * El archivo sube derecho a Storage, no por el servicio.
   *
   * Iba en el cuerpo de un POST a `/propia`, y desde que el servicio es una
   * función eso tiene techo: el plan gratis corta el pedido en 4.5 MB y acá el
   * tope es ochenta. El servidor firma una URL de un solo uso, el navegador
   * sube contra Storage, y recién después el servidor baja el archivo, lo pasa
   * por ffprobe y le lee las etiquetas — que es lo que siempre hizo, desde el
   * otro lado.
   */
  const permiso = await (async () => {
    const res = await fetchMusica(`${MUSIC_API}/propia/url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre }),
    })
    const d = (await res.json()) as { url?: string; error?: string }
    if (!res.ok || !d.url) throw new Error(d.error ?? `No se pudo subir (${res.status})`)
    return d.url
  })()

  const subida = await fetch(permiso, {
    method: 'PUT',
    headers: { 'Content-Type': archivo.type || 'application/octet-stream' },
    body: archivo,
  })
  if (!subida.ok) throw new Error(`No se pudo subir el archivo (${subida.status})`)

  const res = await fetchMusica(`${MUSIC_API}/propia/confirmar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre }),
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
  /** Energía real en tres bandas por el mismo bucket; ausente en cachés antiguos. */
  bands?: MixSpectrumBands | null
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
 * Cuánto sube el volumen por cada tramo del slider.
 *
 * El oído es **logarítmico**: la diferencia entre 0.9 y 1.0 casi no se nota,
 * mientras que entre 0.0 y 0.1 va de silencio a claramente audible. Un slider
 * lineal —el gain era `headroomGain * volume` a secas— reparte todo su recorrido
 * útil en el primer tercio: al 40% ya sonaba casi tan fuerte como al 100%, y el
 * resto del viaje no cambiaba nada. De ahí las dos quejas: «viene muy fuerte» y
 * «no tengo rango».
 *
 * Elevar la posición a una potencia estira la parte baja y comprime la alta, que
 * es justo la forma inversa del oído: el slider pasa a sentirse parejo de punta
 * a punta. El tope (1.0) sigue siendo el volumen pleno; lo que cambia es que el
 * medio ahora suena a medio.
 */
const CURVA_VOLUMEN = 2.5

export function perceptualGain(volume: number): number {
  const v = Math.max(0, Math.min(1, volume))
  return Math.pow(v, CURVA_VOLUMEN)
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
  /**
   * Un pedazo de la canción, en vez de toda.
   *
   * Sin esto, dibujar un fragmento de quince segundos de un tema de seis
   * minutos sale de dos barras estiradas: la onda es la del tema y el recorte
   * es una franja diminuta adentro. Con el tramo, las barras son de ese pedazo.
   */
  tramo?: { desdeMs: number; durMs: number },
): Promise<Waveform> {
  const rango = tramo ? `&desdeMs=${Math.round(tramo.desdeMs)}&durMs=${Math.round(tramo.durMs)}` : ''
  const res = await fetchMusica(
    `${MUSIC_API}/peaks?videoId=${encodeURIComponent(videoId)}&buckets=${buckets}${rango}`,
    { signal },
  )
  const data = (await res.json()) as Waveform & { error?: string }
  if (!res.ok || data.error) throw new Error(data.error ?? 'No se pudo leer la canción')
  if (data.bands && (!Array.isArray(data.peaks) || !validMixSpectrum(data.bands, data.peaks.length))) data.bands = null
  return data
}

/**
 * Onda de un tramo de audio ya guardado, incluida una canción propia sin
 * `videoId` resoluble. El servidor comprueba la lectura exacta con el JWT.
 */
export async function fetchAudioWaveform(
  audioPath: string,
  buckets: number,
  signal: AbortSignal | undefined,
  tramo: { desdeMs: number; durMs: number },
): Promise<Waveform> {
  const desdeMs = Math.round(tramo.desdeMs)
  const durMs = Math.round(tramo.durMs)
  if (!audioPath || !Number.isSafeInteger(desdeMs) || desdeMs < 0 ||
    !Number.isSafeInteger(durMs) || durMs < 250 || durMs > 30_000 ||
    desdeMs + durMs > 4 * 60 * 60_000 ||
    !Number.isSafeInteger(buckets) || buckets < 40 || buckets > 600) {
    throw new Error('El tramo de onda debe durar entre 250 ms y 30 s, con 40 a 600 barras.')
  }

  const query = `audioPath=${encodeURIComponent(audioPath)}&buckets=${buckets}&desdeMs=${desdeMs}&durMs=${durMs}`
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetchMusica(`${MUSIC_API}/peaks?${query}`, { signal })
    if (response.status === 429 && attempt === 0) {
      const seconds = Number(response.headers.get('Retry-After'))
      const delayMs = Number.isFinite(seconds) && seconds > 0 ? Math.min(5_000, seconds * 1_000) : 2_000
      await new Promise<void>((resolve, reject) => {
        if (signal?.aborted) { reject(new Error('Onda cancelada.')); return }
        const onAbort = () => {
          clearTimeout(timer)
          reject(new Error('Onda cancelada.'))
        }
        const timer = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort)
          resolve()
        }, delayMs)
        signal?.addEventListener('abort', onAbort, { once: true })
      })
      continue
    }

    let body: unknown
    try { body = await response.json() } catch { body = null }
    const data = body as Partial<Waveform> & { error?: string } | null
    if (!response.ok || data?.error) throw new Error(data?.error ?? 'No se pudo leer la onda del audio.')
    if (!data || !Number.isFinite(data.durationMs) || Number(data.durationMs) <= 0 ||
      Number(data.durationMs) > durMs + 100 || !Array.isArray(data.peaks) ||
      data.peaks.length !== buckets || data.peaks.some(value => !Number.isFinite(value) || value < 0 || value > 1)) {
      throw new Error('El servidor devolvió una onda inválida.')
    }
    if (data.bands && !validMixSpectrum(data.bands, data.peaks.length)) data.bands = null
    return data as Waveform
  }
  throw new Error('El servidor de ondas está ocupado. Reintentá en unos segundos.')
}

/**
 * Ondas ya pedidas, mientras la app viva.
 *
 * Una misma canción se dibuja en varios lados a la vez —un perfil con dos
 * fragmentos del mismo tema, una conversación donde volvió a aparecer— y el
 * pedido es idéntico. Se guarda la **promesa** y no el resultado: así dos
 * tarjetas que se montan en el mismo cuadro comparten un solo viaje.
 */
const ondas = new Map<string, Promise<number[]>>()

/**
 * La onda de una canción para dibujarla en una tarjeta.
 *
 * A diferencia de `fetchWaveform`, esta no se cancela ni falla ruidosamente: es
 * un adorno informado, no el contenido de la pantalla. Quien la pide dibuja
 * otra cosa mientras no esté.
 */
export function picosDeCancion(
  videoId: string,
  barras = 120,
  tramo?: { desdeMs: number; durMs: number },
): Promise<number[]> {
  const clave = `${videoId}:${barras}:${tramo ? `${tramo.desdeMs}-${tramo.durMs}` : 'todo'}`
  const yaVa = ondas.get(clave)
  if (yaVa) return yaVa

  const viaje = fetchWaveform(videoId, barras, undefined, tramo)
    .then((w) => w.peaks)
    .catch((e: unknown) => {
      // Un fallo no se cachea: la canción puede no estar guardada todavía.
      ondas.delete(clave)
      throw e
    })
  ondas.set(clave, viaje)
  return viaje
}

// ── Letra sincronizada ─────────────────────────────────────────────────────

/*
 * El tipo de la línea, el intérprete del LRC y qué línea le toca a cada momento
 * viven en `letra.ts`: son la misma cosa —el tiempo de la letra— y así se
 * pueden probar sin arrastrar Supabase. Se re-exportan porque media app las
 * importa desde acá.
 */
export { activeLyricIndex, enfoque, parseLrc, type LyricLine } from './letra'

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
