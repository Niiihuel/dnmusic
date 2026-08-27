import type { Innertube } from 'youtubei.js'
import { acunar, evaluar, hayMotor } from './MotorWebView'
import { cabecerasMedia, fetchYt, uaActual } from './salida'

/**
 * El resolutor de a bordo del teléfono: este iPhone baja el audio con **su
 * propia IP**.
 *
 * Existe por la reja anti-bot de YouTube contra las IPs de datacenter. El
 * escritorio ya tenía su versión (`desktop/src/resolutor.ts`) y con eso
 * alcanzaba mientras hubiera una compu prendida — pero quien solo tiene un
 * teléfono dependía de que otro la prendiera. Acá cada teléfono es su propia
 * salida, y además **aporta**: lo que resuelve uno queda en el bucket y le
 * suena a todos.
 *
 * El reparto es el que hace posible que esto corra en React Native:
 *
 *   · **El WebView atestigua y evalúa.** BotGuard necesita un navegador de
 *     verdad y Hermes no tiene `eval`; las dos cosas viven en
 *     `MotorWebView.tsx`, y lo que cruza son strings.
 *   · **React Native hace toda la red.** Su `fetch` es nativo y no tiene CORS,
 *     que es justo lo que una página no puede hacer contra InnerTube.
 *   · **El servidor decide qué se guarda.** `/aportar` verifica con ffprobe que
 *     sean AAC con la duración que el catálogo espera. Este teléfono no escribe
 *     en Storage: el bucket es de todos.
 *
 * La mecánica es un **espejo de `desktop/src/resolutor.ts`**, que a su vez lo
 * es de `server/src/youtube.ts`. Si tocás una, mirá las otras.
 */

/** googlevideo rechaza el GET completo; hay que pedir por rangos. */
const CHUNK_BYTES = 1 << 20

/** Con qué clientes pedir los formatos, en orden — la lista de las otras dos puntas. */
const CLIENTES_RESOLVE = [
  'YTMUSIC',
  'TV',
  'TV_SIMPLY',
  'IOS',
  'ANDROID_VR',
  'WEB_EMBEDDED',
  'MWEB',
] as const

/**
 * Clientes que además del token de sesión piden uno **atado al video** (la
 * familia web, la misma lista que yt-dlp). iOS y ANDROID_VR no llevan: son
 * clientes nativos, no pasan por BotGuard.
 */
const TOKEN_POR_VIDEO = new Set<(typeof CLIENTES_RESOLVE)[number]>([
  'YTMUSIC',
  'TV',
  'TV_SIMPLY',
  'WEB_EMBEDDED',
  'MWEB',
])

/*
 * youtubei.js y expo-file-system se cargan **tarde y a mano**.
 *
 * youtubei.js son ~650 KB que solo hacen falta cuando el servidor no pudo, o
 * sea casi nunca: evaluarlos al arrancar sería pagar ese parseo en cada
 * apertura de la app para nada. expo-file-system va por el motivo del resto del
 * repo — `requireNativeModule` **lanza al importarse** si el binario no lo
 * trae, y este módulo lo alcanza el layout (ver `src/state/descargas.ts`).
 *
 * El `require` va con la ruta escrita literal: Metro resuelve leyendo el
 * código, y con un nombre calculado no empaquetaría nada.
 */
type ModuloYt = typeof import('youtubei.js')
type ModuloArchivos = typeof import('expo-file-system')

let modYt: ModuloYt | null = null
let modArchivos: ModuloArchivos | null = null

function yt(): ModuloYt {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (modYt ??= require('youtubei.js') as ModuloYt)
}

function fs(): ModuloArchivos {
  if (!modArchivos) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    modArchivos = require('expo-file-system') as ModuloArchivos
  }
  return modArchivos
}

/**
 * Si este teléfono **y este binario** pueden resolver por su cuenta.
 *
 * Puede ser falso por dos motivos, los dos normales: la web (donde CORS impide
 * hablar con InnerTube) y cualquier build de TestFlight anterior a que el
 * WebView existiera. En los dos casos se sigue usando el `/resolve` del
 * servidor, como hasta ahora.
 */
export function hayResolutorABordo(): boolean {
  /* `hayMotor` ya responde por el WebView; acá falta el otro nativo, que es el
     que sube el archivo. Los dos vienen del mismo binario, pero preguntarlo
     por separado deja claro qué falta si algún día se separan. */
  if (!hayMotor()) return false
  try {
    fs()
    return true
  } catch {
    return false
  }
}

/**
 * Le enseña a youtubei.js a evaluar JavaScript, delegando en el WebView.
 *
 * Sin esto, el shim de React Native de youtubei.js tira a propósito: «To
 * decipher URLs, you must provide your own JavaScript evaluator». Es
 * literalmente el agujero que el motor viene a tapar.
 */
let platformLista = false
function ensurePlatform() {
  if (platformLista) return
  const { Platform } = yt()
  Platform.load({
    ...Platform.shim,
    eval: (data: { output: string }, env: Record<string, string | number | boolean | null | undefined>) =>
      evaluar(data.output, env),
  } as never)
  platformLista = true
}

/** La sesión vive lo que el integrity token del PO (~12 h), con margen. */
const CLIENT_TTL_MS = 6 * 60 * 60_000
let clientPromise: Promise<Innertube> | null = null
let clientExpiraEn = 0
let clientNacioEn = 0

/** No rehacer la sesión más seguido que esto: la ráfaga es firma de bot. */
const RESET_MIN_MS = 10 * 60_000

function puedeResetear(): boolean {
  return Date.now() - clientNacioEn > RESET_MIN_MS
}

function resetClient() {
  clientPromise = null
  clientExpiraEn = 0
}

/**
 * Le pone a la sesión la versión de YouTube Music que corre hoy.
 *
 * youtubei.js trae la suya compilada y está año y medio atrasada, y es de donde
 * sale el `cver` que más abajo se le estampa a la URL de media: sin este
 * refresco esa reescritura se copia sobre sí misma. No tira si falla.
 */
async function refrescarVersionDeMusica(cliente: Innertube): Promise<void> {
  try {
    const res = await fetchYt('https://music.youtube.com/', {
      headers: { Accept: 'text/html', 'User-Agent': uaActual() },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()
    const version = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1]
    if (!version) throw new Error('sin versión')
    const apiKey = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1]

    const ctx = cliente.session.context.client
    ctx.clientVersion = version
    ctx.originalUrl = 'https://music.youtube.com/'
    if (ctx.mainAppWebInfo) ctx.mainAppWebInfo.graftUrl = 'https://music.youtube.com/'
    if (apiKey) cliente.session.api_key = apiKey
  } catch {
    /* Silencioso: esto corre en el teléfono de alguien que solo quería
       escuchar música, y la sesión sigue siendo utilizable. */
  }
}

async function getClient(): Promise<Innertube> {
  if (clientPromise && Date.now() < clientExpiraEn) return clientPromise
  ensurePlatform()
  clientExpiraEn = Date.now() + CLIENT_TTL_MS
  clientNacioEn = Date.now()

  clientPromise = (async () => {
    const { ClientType, Innertube: IT } = yt()
    const bootstrap = await IT.create({
      retrieve_player: false,
      fetch: fetchYt,
      user_agent: uaActual(),
      retrieve_innertube_config: false,
    })
    const visitorData = bootstrap.session.context.client.visitorData
    if (!visitorData) throw new Error('No se obtuvo visitorData')

    const cliente = await IT.create({
      client_type: ClientType.MUSIC,
      po_token: await acunar(visitorData),
      visitor_data: visitorData,
      retrieve_player: true,
      /* El contexto lo arma Google y no las constantes compiladas de
         youtubei.js: ver el porqué largo en el servidor. */
      generate_session_locally: false,
      /* La config fría es un POST que contesta 401 siempre y que nadie lee. */
      retrieve_innertube_config: false,
      user_agent: uaActual(),
      fetch: fetchYt,
    })
    await refrescarVersionDeMusica(cliente)
    return cliente
  })()

  const propia = clientPromise
  propia.catch(() => {
    if (clientPromise === propia) resetClient()
  })

  return clientPromise
}

type Formatos =
  | { info: Awaited<ReturnType<Innertube['getBasicInfo']>>; cliente: (typeof CLIENTES_RESOLVE)[number] }
  | { info: null; razones: string[] }

async function buscarFormatos(cliente: Innertube, videoId: string): Promise<Formatos> {
  const razones: string[] = []
  /* El token del video se acuña una vez y lo comparten los clientes que lo
     piden. Si BotGuard falla, se sigue sin él en vez de tirar la resolución. */
  let acunado: Promise<string | undefined> | null = null
  const tokenDelVideo = () => (acunado ??= acunar(videoId).catch(() => undefined))

  for (const candidato of CLIENTES_RESOLVE) {
    try {
      const intento = await cliente.getBasicInfo(videoId, {
        client: candidato,
        po_token: TOKEN_POR_VIDEO.has(candidato) ? await tokenDelVideo() : undefined,
      })
      /* Un formato sin URL ni cifrado es SABR y no sirve desde acá. */
      const audio = (intento.streaming_data?.adaptive_formats ?? []).filter(
        (f) => f.mime_type.startsWith('audio') && (f.url || f.signature_cipher),
      )
      if (audio.length) return { info: intento, cliente: candidato }
      const estado = intento.playability_status
      razones.push(
        `${candidato}: ${estado?.status ?? 'sin streaming_data'}${estado?.reason ? ` — ${estado.reason}` : ''}`,
      )
    } catch (e) {
      razones.push(`${candidato}: ${(e as Error).message}`)
    }
  }
  return { info: null, razones }
}

export type Aporte = {
  path: string
  artworkPath: string | null
  cached: boolean
  durationMs: number | null
}

/**
 * Resuelve una canción con la IP de este teléfono y se la aporta al servidor.
 *
 * Devuelve lo mismo que `/resolve` para que quien llama no distinga de dónde
 * salió. Cualquier tropiezo tira: el que llama decide si el error del servidor
 * original era mejor noticia que este.
 */
export async function resolverYAportar(opciones: {
  videoId: string
  apiBase: string
  token: string
  artworkUrl?: string
  durationMs?: number
}): Promise<Aporte> {
  const { videoId, apiBase, token, artworkUrl, durationMs } = opciones

  let cliente = await getClient()
  let encontrado = await buscarFormatos(cliente, videoId)

  if (!encontrado.info && puedeResetear()) {
    /* El caso conocido es la sesión pasada de fecha; una nueva lo destraba.
       Una vez sola, y nunca sobre una sesión joven. */
    resetClient()
    cliente = await getClient()
    encontrado = await buscarFormatos(cliente, videoId)
  }
  if (!encontrado.info) {
    throw new Error(`Sin audio desde este teléfono — ${encontrado.razones.join('; ')}`)
  }

  const { info, cliente: quien } = encontrado

  /*
   * Solo AAC en mp4, sin caída a Opus: `/aportar` rechaza cualquier otra cosa
   * —es su control anti-envenenamiento— así que bajar un webm sería trabajo
   * tirado. Y iOS no sabe decodificar Opus de todas formas.
   */
  const enMp4 = (info.streaming_data?.adaptive_formats ?? []).filter(
    (f) => f.mime_type.startsWith('audio/mp4') && (f.url || f.signature_cipher),
  )
  const best = enMp4.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0]
  if (!best) throw new Error(`${quien} no ofreció audio AAC para aportar`)

  /* Descifrar es lo que delega en el WebView: acá es donde Hermes se quedaba
     sin `eval` y no había resolución posible desde React Native. */
  let url = await best.decipher(cliente.session.player)

  /*
   * La misma cirugía de URL que las otras dos puntas (ver allá el porqué
   * largo): `cver` se reescribe con la versión que la sesión negoció —solo
   * para MUSIC—, y el `pot` de media se reemplaza entero por uno atado al
   * video. Cirugía sobre el string: una URL firmada no sobrevive a que la
   * normalicen.
   */
  const cver = cliente.session.context.client.clientVersion
  if (cver && quien === 'YTMUSIC')
    url = url.replace(/([?&]cver=)[^&]*/, `$1${encodeURIComponent(cver)}`)

  url = url
    .replace(/&pot=[^&]*/g, '')
    .replace(/\?pot=[^&]*&/, '?')
    .replace(/\?pot=[^&]*$/, '')
  url += `${url.includes('?') ? '&' : '?'}pot=${encodeURIComponent(await acunar(videoId))}`

  const crudo = await bajarPorRangos(url)

  /*
   * La duración que se declara es la **del video según YouTube**, no la que
   * mandó la pantalla: el servidor la compara contra lo que mide ffprobe, y
   * cuanto más cerca del origen esté la declaración, mejor verifica.
   */
  const declararMs = (info.basic_info.duration ?? 0) * 1000 || durationMs || 0
  const query = new URLSearchParams({ videoId })
  if (declararMs > 0) query.set('durationMs', String(Math.round(declararMs)))
  if (artworkUrl) query.set('artworkUrl', artworkUrl)

  return aportar(`${apiBase}/aportar?${query}`, token, videoId, crudo)
}

/**
 * Sube los bytes por archivo y no por `fetch`.
 *
 * El `fetch` de React Native no manda un `Uint8Array` como cuerpo —soporta
 * strings, FormData y Blob— y convertir cinco megas a base64 para pasarlos por
 * el puente es memoria y tiempo por nada. `expo-file-system` sube el archivo
 * tal cual desde el lado nativo, que es exactamente lo que hace falta.
 *
 * El archivo temporal se borra pase lo que pase: es la cache del teléfono.
 */
async function aportar(
  url: string,
  token: string,
  videoId: string,
  bytes: Uint8Array,
): Promise<Aporte> {
  const { File, Paths } = fs()
  const archivo = new File(Paths.cache, `aporte-${videoId}.m4a`)
  try {
    if (archivo.exists) archivo.delete()
    archivo.create()
    archivo.write(bytes)

    const res = await archivo
      .createUploadTask(url, {
        httpMethod: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'audio/mp4' },
        mimeType: 'audio/mp4',
      })
      .uploadAsync()

    const data = (() => {
      try {
        return JSON.parse(res.body) as Aporte & { error?: string }
      } catch {
        return null
      }
    })()
    if (res.status < 200 || res.status >= 300 || !data?.path) {
      throw new Error(data?.error ?? `El aporte falló (${res.status})`)
    }
    return data
  } finally {
    try {
      if (archivo.exists) archivo.delete()
    } catch {
      /* Un temporal que no se pudo borrar no vale romper un aporte que salió
         bien; el sistema limpia la cache por su cuenta. */
    }
  }
}

/**
 * La descarga por rangos, con los cuidados aprendidos en el servidor:
 *
 *   · un 200 en un rango que no arranca en cero es el archivo entero metido en
 *     el medio — pegado daría un audio roto que «suena» mal para siempre;
 *   · el total lo dice el `content-range` del primer pedazo, y al final los
 *     bytes tienen que ser **exactos**: de más es tan corrupto como de menos;
 *   · el resto baja de a tres en paralelo. En el escritorio son cuatro; acá uno
 *     menos porque esto puede estar corriendo con datos móviles y una ráfaga
 *     sobre la misma URL firmada es la forma de que googlevideo corte con 403.
 */
async function bajarPorRangos(url: string): Promise<Uint8Array> {
  const pedir = async (desde: number) => {
    const res = await fetchYt(url, {
      headers: { ...cabecerasMedia(), Range: `bytes=${desde}-${desde + CHUNK_BYTES - 1}` },
    })
    if (res.status !== 206 && !(res.status === 200 && desde === 0)) {
      throw new Error(`googlevideo respondió ${res.status} al rango ${desde}`)
    }
    const rango = res.headers.get('content-range')
    const inicio = rango ? Number(rango.split(' ')[1]?.split('-')[0]) : desde
    if (Number.isFinite(inicio) && inicio !== desde) {
      throw new Error(`googlevideo sirvió el rango ${inicio} en vez de ${desde}`)
    }
    return {
      buf: new Uint8Array(await res.arrayBuffer()),
      total: rango ? Number(rango.split('/')[1]) : null,
    }
  }

  const primero = await pedir(0)
  if (!primero.buf.length) throw new Error('No se descargó audio')
  const total = primero.total
  const partes: Uint8Array[] = [primero.buf]

  if (total !== null && total > primero.buf.length) {
    const desde: number[] = []
    for (let o = primero.buf.length; o < total; o += CHUNK_BYTES) desde.push(o)
    const PARALELO = 3
    const resto = new Array<Uint8Array>(desde.length)
    let puntero = 0
    await Promise.all(
      Array.from({ length: Math.min(PARALELO, desde.length) }, async () => {
        while (puntero < desde.length) {
          const i = puntero++
          resto[i] = (await pedir(desde[i])).buf
        }
      }),
    )
    partes.push(...resto)
  }

  const largo = partes.reduce((suma, p) => suma + p.length, 0)
  if (total !== null && largo !== total) {
    throw new Error(`Descarga inconsistente: ${largo} de ${total} bytes`)
  }
  const crudo = new Uint8Array(largo)
  let offset = 0
  for (const p of partes) {
    crudo.set(p, offset)
    offset += p.length
  }
  return crudo
}
