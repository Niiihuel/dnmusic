/**
 * Leer una lista de Spotify sin la Web API.
 *
 * La puerta oficial se cerró en febrero de 2026. El endpoint que devolvía las
 * canciones (`/playlists/{id}/tracks`) fue reemplazado por `/playlists/{id}/items`
 * con una condición nueva: *"Only available for playlists the user owns or
 * collaborates on"*. O sea que ni con token de app ni con el token de otra
 * persona se puede leer una lista ajena — hace falta que el dueño esté logueado
 * en nuestra app. Y para tener ese login hay que estar en Development Mode, que
 * en la misma tanda bajó de 25 usuarios permitidos a **5** y ahora exige que el
 * dueño de la app tenga Premium. Salir de ahí (Extended Quota) pide entidad
 * legal registrada y 250.000 usuarios activos por mes.
 *
 * Para una app de ~150 personas eso no es un límite que se esquive con código:
 * el camino oficial alcanza para cinco.
 *
 * Lo que sí sigue abierto es la página que Spotify sirve para sus reproductores
 * incrustados. Trae, en un `<script id="__NEXT_DATA__">`, exactamente lo que
 * este sistema necesita —título, artista y duración de cada tema— sin
 * autenticación de ninguna clase, y funciona incluso con las listas editoriales
 * que la API oficial contesta con 404.
 *
 * Es importante ser honestos sobre qué es esto: **no es una API documentada**.
 * Es leer una página. Puede romperse cualquier día y sin aviso. Se banca ese
 * riesgo por tres razones: se lee una sola vez por importación (no es un camino
 * caliente), lo que se lee son nombres y no audio, y si un día deja de andar lo
 * único que se cae es el import — la música ya traída no se toca. El respaldo
 * para ese día es pegar la lista a mano, que el cliente ya sabe hacer.
 */

/** Cuántas canciones sirve la página de embed, medido. No hay paginado. */
export const TOPE_EMBED = 100

export type PistaSpotify = {
  /** `spotify:track:…`. No lo usa nadie todavía; identifica la fila sin ambigüedad. */
  uri: string
  titulo: string
  /** Puede traer varios artistas separados por coma, tal como los muestra Spotify. */
  artista: string
  durationMs: number
  /**
   * MP3 de 30 segundos, o null.
   *
   * Es el mismo preview que murió en la Web API en noviembre de 2024 y que acá
   * sigue viniendo servido. Sirve para que, en la pantalla de revisión, se pueda
   * comparar de oído contra el candidato de YouTube en vez de adivinar leyendo.
   */
  previewUrl: string | null
}

export type ListaSpotify = {
  id: string
  nombre: string
  /** Quién la armó, tal como lo muestra el embed («Spotify», un usuario, …). */
  autor: string
  portadaUrl: string | null
  pistas: PistaSpotify[]
  /**
   * La página cortó en el tope y es probable que la lista real siga.
   *
   * No se puede saber con certeza: el JSON no trae el total, así que llegar
   * justo a 100 es indistinguible de una lista de exactamente 100. Se avisa en
   * vez de mentir, y el cliente ofrece pegar el resto a mano.
   */
  truncada: boolean
}

/**
 * El id de una lista, venga como venga.
 *
 * Lo que pega una persona real es cualquiera de estas formas: el link de
 * «Copiar enlace» con su `?si=…`, el URI de «Copiar URI de Spotify», el link
 * con el prefijo de idioma que mete la web (`/intl-es/`), o el id pelado si
 * alguien lo sacó de otro lado.
 */
export function idDeLista(entrada: string): { tipo: 'playlist' | 'album'; id: string } | null {
  const texto = entrada.trim()
  if (!texto) return null

  // `spotify:playlist:37i9…`
  const uri = texto.match(/^spotify:(playlist|album):([A-Za-z0-9]+)$/)
  if (uri) return { tipo: uri[1] as 'playlist' | 'album', id: uri[2] }

  // Cualquier URL de open.spotify.com, con o sin `/intl-xx/` y con o sin `/embed/`.
  const url = texto.match(
    /open\.spotify\.com\/(?:embed\/)?(?:intl-[a-z]{2}\/)?(playlist|album)\/([A-Za-z0-9]+)/,
  )
  if (url) return { tipo: url[1] as 'playlist' | 'album', id: url[2] }

  // El id pelado. Los de Spotify son base62 de 22 caracteres.
  if (/^[A-Za-z0-9]{22}$/.test(texto)) return { tipo: 'playlist', id: texto }

  return null
}

/**
 * Los ids de canción sueltos que haya en un texto.
 *
 * Es la salida al tope de 100 y, de paso, a las listas privadas —que no tienen
 * página de embed—. En Spotify se puede seleccionar todo (Ctrl+A) y copiar
 * (Ctrl+C): lo que va al portapapeles es un link por canción. Cada uno de esos
 * links **sí** tiene su embed, así que una lista de cualquier tamaño se puede
 * reconstruir de a una.
 *
 * Se aceptan las dos formas que devuelve Spotify según de dónde se copie: la
 * URL con su `?si=…` y el URI `spotify:track:…`.
 */
export function idsDeCanciones(texto: string): string[] {
  const ids = new Set<string>()
  const patron = /(?:open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/|spotify:track:)([A-Za-z0-9]{22})/g
  for (const coincidencia of texto.matchAll(patron)) ids.add(coincidencia[1])
  return [...ids]
}

/**
 * Los datos de una canción, de su propia página de embed.
 *
 * Devuelve null en vez de tirar: en una lista de trescientas, que una no se
 * pueda leer no puede llevarse el resto puesto.
 */
async function leerCancion(id: string): Promise<PistaSpotify | null> {
  try {
    const respuesta = await fetch(`https://open.spotify.com/embed/track/${id}`, {
      headers: { 'User-Agent': NAVEGADOR, 'Accept-Language': 'es' },
    })
    if (!respuesta.ok) return null

    const entidad = entidadDe(await respuesta.text())
    const titulo = (entidad?.name ?? entidad?.title ?? '').trim()
    if (!titulo) return null

    return {
      uri: entidad?.uri ?? `spotify:track:${id}`,
      titulo,
      /* Acá los artistas vienen como lista propia y no en `subtitle` —que en la
         página de una canción llega vacío—, así que se juntan como los escribe
         Spotify en cualquier otro lado. */
      artista: (entidad?.artists ?? []).map((a) => a.name).filter(Boolean).join(', '),
      durationMs: typeof entidad?.duration === 'number' ? entidad.duration : 0,
      previewUrl: entidad?.audioPreview?.url ?? null,
    }
  } catch {
    return null
  }
}

/**
 * Un montón de canciones por su id, de a poco.
 *
 * Una página por canción es mucho más tráfico que una página por lista, así que
 * la concurrencia va acotada: son pedidos livianos y sin credencial, pero
 * trescientos a la vez desde una IP de datacenter es la forma de que Spotify
 * empiece a mirarnos. Con seis en paralelo, cien canciones tardan unos segundos.
 *
 * El orden de entrada se conserva: es el de la lista de la que se copiaron.
 */
export async function leerCanciones(ids: string[], concurrencia = 6): Promise<PistaSpotify[]> {
  const salida = new Array<PistaSpotify | null>(ids.length).fill(null)
  let siguiente = 0

  const obrero = async () => {
    for (;;) {
      const indice = siguiente++
      if (indice >= ids.length) return
      salida[indice] = await leerCancion(ids[indice])
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrencia, ids.length) }, obrero))
  return salida.filter((p): p is PistaSpotify => p !== null)
}

/**
 * Un navegador cualquiera.
 *
 * Sin User-Agent creíble la página contesta un HTML distinto —el de «actualizá
 * tu navegador»— que no trae el JSON. No es evasión de nada: es pedir la misma
 * página que pediría el iframe que Spotify publica para que la incrusten.
 */
const NAVEGADOR =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

type EntidadEmbed = {
  type?: string
  name?: string
  title?: string
  subtitle?: string
  id?: string
  uri?: string
  coverArt?: { sources?: { url?: string }[] }
  /* Los tres de abajo solo vienen cuando la entidad es una canción suelta. */
  artists?: { name?: string }[]
  duration?: number
  audioPreview?: { url?: string } | null
  trackList?: {
    uri?: string
    title?: string
    subtitle?: string
    duration?: number
    audioPreview?: { url?: string } | null
  }[]
}

/**
 * El JSON que la página lleva adentro.
 *
 * Se recorta entre las etiquetas en vez de parsear el HTML entero: el bloque es
 * un `application/json` con id fijo, y traer un parser de DOM al servidor para
 * encontrar una etiqueta sería pagar mucho por muy poco.
 */
function entidadDe(html: string): EntidadEmbed | null {
  const bloque = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  )
  if (!bloque) return null
  try {
    const datos = JSON.parse(bloque[1]) as {
      props?: { pageProps?: { state?: { data?: { entity?: EntidadEmbed } } } }
    }
    return datos.props?.pageProps?.state?.data?.entity ?? null
  } catch {
    return null
  }
}

/**
 * La lista, lista para emparejar.
 *
 * Los errores se redactan pensando en quien los va a leer en la pantalla, no en
 * quien lee los logs: la causa casi siempre es que la lista es privada, y eso
 * tiene una solución concreta que conviene decir en el mismo renglón.
 */
export async function leerLista(entrada: string): Promise<ListaSpotify> {
  const referencia = idDeLista(entrada)
  if (!referencia) {
    throw new Error('Eso no parece un enlace de Spotify. Copiá el enlace de la lista y pegalo acá.')
  }

  const respuesta = await fetch(
    `https://open.spotify.com/embed/${referencia.tipo}/${referencia.id}`,
    { headers: { 'User-Agent': NAVEGADOR, 'Accept-Language': 'es' } },
  )
  if (!respuesta.ok) {
    throw new Error(
      respuesta.status === 404
        ? 'Spotify no encuentra esa lista. Si es privada, ponela pública un momento o pegá las canciones a mano.'
        : `Spotify respondió ${respuesta.status}`,
    )
  }

  const entidad = entidadDe(await respuesta.text())
  const crudas = entidad?.trackList ?? []
  if (!entidad || !crudas.length) {
    throw new Error(
      'No se pudieron leer las canciones. Si la lista es privada, ponela pública un momento o pegá las canciones a mano.',
    )
  }

  const pistas = crudas.flatMap<PistaSpotify>((pista) => {
    const titulo = (pista.title ?? '').trim()
    // Sin título no hay nada que buscar; sin artista todavía se puede intentar.
    if (!titulo) return []
    return [
      {
        uri: pista.uri ?? '',
        titulo,
        artista: (pista.subtitle ?? '').trim(),
        durationMs: typeof pista.duration === 'number' ? pista.duration : 0,
        previewUrl: pista.audioPreview?.url ?? null,
      },
    ]
  })

  return {
    id: entidad.id ?? referencia.id,
    nombre: (entidad.name ?? entidad.title ?? 'Lista de Spotify').trim(),
    autor: (entidad.subtitle ?? '').trim(),
    portadaUrl: entidad.coverArt?.sources?.[0]?.url ?? null,
    pistas,
    truncada: crudas.length >= TOPE_EMBED,
  }
}
