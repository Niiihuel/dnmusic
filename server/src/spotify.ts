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

import { createHmac, randomUUID } from 'node:crypto'

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
 * El camino largo: una lista de cualquier tamaño, no solo los primeros 100.
 *
 * El embed tapa en 100 y no pagina. Para el resto hay un solo camino sin login:
 * el mismo que usa el **reproductor web** de Spotify —su API interna
 * `api-partner.spotify.com/pathfinder`, que sí pagina—. No es una API pública;
 * es replicar lo que hace la página. Está medido de punta a punta.
 *
 * La cadena tiene cuatro piezas y Spotify rota las cuatro sin avisar:
 *
 *   1. Un **TOTP**. El endpoint que da el token pide un código de seis dígitos
 *      generado con un secreto que Spotify cambia cada tanto (es lo que rompió a
 *      spotDL en febrero de 2026). El secreto no se hardcodea: se baja de un
 *      repo de la comunidad que lo mantiene al día, y se usa la versión más alta.
 *   2. El **access token** del web player, que sale de `/api/token` con ese TOTP.
 *   3. El **client token**, de `clienttoken.spotify.com`, atado al client id del
 *      web player (el del embed no sirve, está medido).
 *   4. El **hash** de la consulta `fetchPlaylist`, que versiona el bundle del
 *      reproductor. Va hardcodeado abajo; si Spotify lo cambia, esto falla y se
 *      cae al embed.
 *
 * Por eso **todo esto es de mejor esfuerzo**: cualquier eslabón que falle
 * devuelve `null` y quien llama se queda con los 100 del embed y el pegado a
 * mano —exactamente lo de antes, nunca peor. Cuando funciona, trae la lista
 * entera.
 */
const SECRETOS_URL =
  'https://raw.githubusercontent.com/xyloflake/spot-secrets-go/main/secrets/secretDict.json'
/** El id de la consulta de playlist del reproductor web. Rota; ver arriba. */
const FETCH_PLAYLIST_HASH =
  '86dde7b9d9356e2369414647cf6950cfed96e778e129cfdfc99aea6c1613b3b0'
/** Cuántas pide cada página del pathfinder. 100 es el máximo que sirve. */
const PAGINA_PATHFINDER = 100
/** Un techo de sensatez: nadie importa una lista de diez mil a mano tampoco. */
const TOPE_PATHFINDER = 10_000

/** El secreto del TOTP, cacheado. Se rebaja de la comunidad una vez por proceso. */
let secretoCache: { ver: number; bytes: number[] } | null = null

async function secretoTotp(): Promise<{ ver: number; bytes: number[] } | null> {
  if (secretoCache) return secretoCache
  try {
    const res = await fetch(SECRETOS_URL, { headers: { 'User-Agent': NAVEGADOR } })
    if (!res.ok) return null
    const dict = (await res.json()) as Record<string, number[]>
    // La versión más alta es la vigente; las viejas quedan por compatibilidad.
    const ver = Math.max(...Object.keys(dict).map(Number).filter(Number.isFinite))
    const bytes = dict[String(ver)]
    if (!Array.isArray(bytes) || !bytes.length) return null
    secretoCache = { ver, bytes }
    return secretoCache
  } catch {
    return null
  }
}

/** Base32 de un buffer, sin padding (lo que espera el generador de TOTP). */
function base32(buf: Buffer): string {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0
  let val = 0
  let out = ''
  for (const b of buf) {
    val = (val << 8) | b
    bits += 8
    while (bits >= 5) {
      out += A[(val >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += A[(val << (5 - bits)) & 31]
  return out
}

/**
 * El código TOTP para un instante dado.
 *
 * El secreto no se usa tal cual: cada byte se transforma (`b ^ (i%33 + 9)`), la
 * tira de números resultante se pasa a hex y de ahí a base32. Es la receta de
 * Spotify, ni más ni menos; el porqué de cada paso es de ellos. Después es un
 * TOTP común (RFC 6238): HMAC-SHA1 sobre el contador de 30 segundos, seis
 * dígitos.
 */
function generarTotp(bytes: number[], segundos: number): string {
  const transformado = bytes.map((e, i) => e ^ ((i % 33) + 9)).join('')
  const secreto = base32(Buffer.from(Buffer.from(transformado, 'utf8').toString('hex'), 'hex'))

  // decodificar el base32 a la clave binaria del HMAC
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0
  let val = 0
  const clave: number[] = []
  for (const c of secreto) {
    val = (val << 5) | A.indexOf(c)
    bits += 5
    if (bits >= 8) {
      clave.push((val >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }

  let contador = Math.floor(segundos / 30)
  const cb = Buffer.alloc(8)
  for (let i = 7; i >= 0; i--) {
    cb[i] = contador & 0xff
    contador = Math.floor(contador / 256)
  }
  const h = createHmac('sha1', Buffer.from(clave)).update(cb).digest()
  const o = h[19] & 0xf
  const bin = ((h[o] & 0x7f) << 24) | ((h[o + 1] & 0xff) << 16) | ((h[o + 2] & 0xff) << 8) | (h[o + 3] & 0xff)
  return String(bin % 1_000_000).padStart(6, '0')
}

type SesionSpotify = { accessToken: string; clientToken: string; expira: number }
let sesionCache: SesionSpotify | null = null

/**
 * Un access token + client token del reproductor web, listos para el pathfinder.
 *
 * Se cachea: el access token vale una hora, así que una ráfaga de importaciones
 * no rehace el trámite —ni el TOTP, ni las dos llamadas— cada vez. Con margen,
 * se rehace a los cincuenta minutos.
 */
async function sesionPathfinder(): Promise<SesionSpotify | null> {
  if (sesionCache && Date.now() < sesionCache.expira) return sesionCache

  const secreto = await secretoTotp()
  if (!secreto) return null

  try {
    // El TOTP se calcula contra la hora del servidor de Spotify, no la nuestra:
    // un reloj local corrido tiraría un código inválido.
    const cabecera = await fetch('https://open.spotify.com/', { headers: { 'User-Agent': NAVEGADOR } })
    const horaServidor = new Date(cabecera.headers.get('date') ?? Date.now()).getTime()
    const totp = generarTotp(secreto.bytes, Math.floor(horaServidor / 1000))

    const tokRes = await fetch(
      `https://open.spotify.com/api/token?reason=init&productType=web-player&totp=${totp}&totpServer=${totp}&totpVer=${secreto.ver}`,
      { headers: { 'User-Agent': NAVEGADOR, Referer: 'https://open.spotify.com/', Origin: 'https://open.spotify.com' } },
    )
    const tok = (await tokRes.json().catch(() => null)) as { accessToken?: string; clientId?: string } | null
    if (!tok?.accessToken || !tok.clientId) return null

    const ctRes = await fetch('https://clienttoken.spotify.com/v1/clienttoken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': NAVEGADOR },
      body: JSON.stringify({
        client_data: {
          client_version: '1.2.99',
          client_id: tok.clientId,
          js_sdk_data: {
            device_brand: 'unknown',
            device_model: 'unknown',
            os: 'windows',
            os_version: 'NT 10.0',
            device_id: randomUUID(),
            device_type: 'computer',
          },
        },
      }),
    })
    const ct = (await ctRes.json().catch(() => null)) as { granted_token?: { token?: string } } | null
    const clientToken = ct?.granted_token?.token
    if (!clientToken) return null

    sesionCache = { accessToken: tok.accessToken, clientToken, expira: Date.now() + 50 * 60_000 }
    return sesionCache
  } catch {
    return null
  }
}

/** Un track del pathfinder, tal como viene anidado, mapeado a lo nuestro. */
type ItemPathfinder = {
  itemV2?: {
    data?: {
      __typename?: string
      uri?: string
      name?: string
      trackDuration?: { totalMilliseconds?: number }
      artists?: { items?: { profile?: { name?: string } }[] }
    }
  }
}

function pistaDePathfinder(item: ItemPathfinder): PistaSpotify | null {
  const d = item.itemV2?.data
  const titulo = (d?.name ?? '').trim()
  if (!titulo || d?.__typename !== 'Track') return null
  return {
    uri: d.uri ?? '',
    titulo,
    artista: (d.artists?.items ?? []).map((a) => a.profile?.name).filter(Boolean).join(', '),
    durationMs: d.trackDuration?.totalMilliseconds ?? 0,
    // El pathfinder no trae el preview de 30s; el embed sí, pero por el camino
    // largo ese extra se resigna. Emparejar contra YouTube no lo necesita.
    previewUrl: null,
  }
}

/**
 * Todas las pistas de una lista, paginando el pathfinder.
 *
 * De mejor esfuerzo: `null` ante cualquier tropiezo —sin sesión, hash cambiado,
 * un 4xx— para que `leerLista` se quede con lo del embed. Cuando anda, devuelve
 * la lista completa en orden.
 */
async function pistasCompletas(playlistId: string): Promise<PistaSpotify[] | null> {
  const sesion = await sesionPathfinder()
  if (!sesion) return null

  type ContenidoPathfinder = { totalCount?: number; items?: ItemPathfinder[] }
  const pistas: PistaSpotify[] = []
  for (let offset = 0; offset < TOPE_PATHFINDER; offset += PAGINA_PATHFINDER) {
    let contenido: ContenidoPathfinder | null = null
    try {
      const res = await fetch('https://api-partner.spotify.com/pathfinder/v1/query', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sesion.accessToken}`,
          'client-token': sesion.clientToken,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'app-platform': 'WebPlayer',
          'User-Agent': NAVEGADOR,
          Origin: 'https://open.spotify.com',
          Referer: 'https://open.spotify.com/',
        },
        body: JSON.stringify({
          operationName: 'fetchPlaylist',
          variables: {
            uri: `spotify:playlist:${playlistId}`,
            offset,
            limit: PAGINA_PATHFINDER,
            // El hash las exige aunque no las usemos; sin ellas contesta 400.
            enableWatchFeedEntrypoint: false,
            includeEpisodeContentRatingsV2: true,
          },
          extensions: { persistedQuery: { version: 1, sha256Hash: FETCH_PLAYLIST_HASH } },
        }),
      })
      if (!res.ok) return offset === 0 ? null : pistas
      const json = (await res.json()) as { data?: { playlistV2?: { content?: ContenidoPathfinder } } }
      contenido = json.data?.playlistV2?.content ?? null
    } catch {
      return offset === 0 ? null : pistas
    }
    if (!contenido) return offset === 0 ? null : pistas

    for (const item of contenido.items ?? []) {
      const pista = pistaDePathfinder(item)
      if (pista) pistas.push(pista)
    }

    const total = contenido.totalCount ?? 0
    if (!contenido.items?.length || offset + PAGINA_PATHFINDER >= total) break
  }
  return pistas
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

  /*
   * Si el embed tapó en 100 y es una lista, se intenta traerla entera por el
   * camino largo. El embed ya nos dio los metadatos ricos —nombre, portada,
   * autor— y sirve de fallback: si `pistasCompletas` no puede, la lista queda
   * con sus 100 y `truncada: true`, igual que antes. Solo las listas se
   * paginan; un álbum de más de 100 pistas no existe.
   */
  let pistasFinales = pistas
  let truncada = crudas.length >= TOPE_EMBED
  if (truncada && referencia.tipo === 'playlist') {
    const completas = await pistasCompletas(referencia.id)
    if (completas && completas.length > pistas.length) {
      pistasFinales = completas
      truncada = false
    }
  }

  return {
    id: entidad.id ?? referencia.id,
    nombre: (entidad.name ?? entidad.title ?? 'Lista de Spotify').trim(),
    autor: (entidad.subtitle ?? '').trim(),
    portadaUrl: entidad.coverArt?.sources?.[0]?.url ?? null,
    pistas: pistasFinales,
    truncada,
  }
}
