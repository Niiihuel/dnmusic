import { ClientType, Innertube, Platform, UniversalCache } from 'youtubei.js'
import { runInNewContext } from 'node:vm'
import { mintSessionToken, mintVideoToken } from './potoken.js'

/**
 * El resolutor de a bordo: esta compu baja el audio con **su propia IP**.
 *
 * Existe por la reja anti-bot de YouTube contra las IPs de datacenter: el
 * servidor de Railway puede pasar días con `LOGIN_REQUIRED` en los siete
 * clientes mientras cualquier IP residencial resuelve sin drama — se comprobó
 * el día del apagón, corriendo el mismo código en una casa y en Railway a la
 * vez. Acá cada usuario de escritorio es su propia salida.
 *
 * La mecánica de resolución es un **espejo de `server/src/youtube.ts`**, con
 * la misma sesión MUSIC, los mismos PO tokens y la misma cirugía de URL. El
 * primer borrador probó el atajo de los clientes móviles sin token y no
 * existe: googlevideo corta con 403 pasado el primer megabyte también en IPs
 * residenciales — el token de origen se exige en todos lados; lo que cambia
 * con la IP es la reja de `LOGIN_REQUIRED` de los /player. Si tocás la copia,
 * mirá el original.
 *
 * El reparto de responsabilidades es deliberado:
 *
 *   · **Esta punta baja bytes** y los manda a `/aportar`.
 *   · **El servidor decide qué se guarda**: ffprobe verifica que sean AAC con
 *     la duración que el catálogo espera, y ffmpeg los remuxea. Esta compu no
 *     escribe en Storage: no tiene ni las llaves ni la confianza — el bucket
 *     es de todos.
 *
 * Es Node puro a propósito, sin nada de Electron: se prueba con `node` a
 * secas, y el día que el satélite de una compu de escritorio quiera correr
 * como worker suelto, este archivo ya sabe.
 */

/** googlevideo rechaza el GET completo; hay que pedir por rangos. */
const CHUNK_BYTES = 1 << 20

/** Con qué clientes pedir los formatos, en orden — la lista del servidor. */
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

// youtubei.js v17 dejó de traer evaluador de JS por seguridad, y sin uno no se
// pueden descifrar las URLs. node:vm alcanza y mantiene el código aislado del
// scope del proceso.
let platformLoaded = false
function ensurePlatform() {
  if (platformLoaded) return
  Platform.load({
    ...Platform.shim,
    eval: (data: { output: string; exported: string[] }, env: Record<string, unknown>) => {
      // El script emitido usa `return` de nivel superior: se evalúa como cuerpo
      // de función, no como script suelto.
      const names = Object.keys(env)
      const factory = runInNewContext(
        `(function(${names.join(',')}) {\n${data.output}\n})`,
        Object.create(null),
        { timeout: 10_000 },
      )
      return factory(...names.map((n) => env[n]))
    },
  } as never)
  platformLoaded = true
}

/**
 * La sesión vive lo que el integrity token del PO (~12 h, con margen). En una
 * app de escritorio el proceso rara vez dura tanto, pero el TTL cuesta dos
 * líneas y ahorra el mismo bug que ya mordió en Railway.
 */
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

async function getClient(): Promise<Innertube> {
  if (clientPromise && Date.now() < clientExpiraEn) return clientPromise
  ensurePlatform()
  clientExpiraEn = Date.now() + CLIENT_TTL_MS
  clientNacioEn = Date.now()

  clientPromise = (async () => {
    const bootstrap = await Innertube.create({ retrieve_player: false })
    const visitorData = bootstrap.session.context.client.visitorData
    if (!visitorData) throw new Error('No se obtuvo visitorData')

    return Innertube.create({
      client_type: ClientType.MUSIC,
      po_token: await mintSessionToken(visitorData),
      visitor_data: visitorData,
      retrieve_player: true,
      generate_session_locally: true,
      cache: new UniversalCache(false),
    })
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

async function buscarFormatos(yt: Innertube, videoId: string): Promise<Formatos> {
  const razones: string[] = []
  /* El token del video se acuña una vez y lo comparten los clientes que lo
     piden. Si BotGuard falla, se sigue sin él en vez de tirar la resolución. */
  let acunado: Promise<string | undefined> | null = null
  const tokenDelVideo = () =>
    (acunado ??= mintVideoToken(videoId).catch(() => undefined))

  for (const candidato of CLIENTES_RESOLVE) {
    try {
      const intento = await yt.getBasicInfo(videoId, {
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
 * Resuelve una canción con la IP de esta máquina y se la aporta al servidor.
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

  let yt = await getClient()
  let encontrado = await buscarFormatos(yt, videoId)

  if (!encontrado.info && puedeResetear()) {
    /* El caso conocido es la sesión pasada de fecha; una nueva lo destraba.
       Una vez sola, y nunca sobre una sesión joven. */
    resetClient()
    yt = await getClient()
    encontrado = await buscarFormatos(yt, videoId)
  }
  if (!encontrado.info) {
    throw new Error(`Sin audio desde acá — ${encontrado.razones.join('; ')}`)
  }

  const { info, cliente } = encontrado

  /*
   * Solo AAC en mp4, sin caída a Opus como tiene el servidor: `/aportar`
   * rechaza cualquier otra cosa —es su control anti-envenenamiento—, así que
   * bajar un webm sería trabajo tirado.
   */
  const enMp4 = (info.streaming_data?.adaptive_formats ?? []).filter(
    (f) => f.mime_type.startsWith('audio/mp4') && (f.url || f.signature_cipher),
  )
  const best = enMp4.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0]
  if (!best) throw new Error(`${cliente} no ofreció audio AAC para aportar`)
  let url = await best.decipher(yt.session.player)

  /*
   * La misma cirugía de URL que el servidor (ver allá el porqué largo):
   * `cver` se reescribe con la versión que la sesión negoció —solo para
   * MUSIC—, y el `pot` de media se reemplaza entero por uno atado al video.
   * Cirugía sobre el string: una URL firmada no sobrevive a que la normalicen.
   */
  const cver = yt.session.context.client.clientVersion
  if (cver && cliente === 'YTMUSIC')
    url = url.replace(/([?&]cver=)[^&]*/, `$1${encodeURIComponent(cver)}`)

  url = url
    .replace(/&pot=[^&]*/g, '')
    .replace(/\?pot=[^&]*&/, '?')
    .replace(/\?pot=[^&]*$/, '')
  const videoToken = await mintVideoToken(videoId)
  url += `${url.includes('?') ? '&' : '?'}pot=${encodeURIComponent(videoToken)}`

  const crudo = await bajarPorRangos(url)

  /*
   * La duración que se declara es la **del video según YouTube**, no la que
   * mandó el renderer: el servidor la compara contra lo que mide ffprobe, y
   * cuanto más cerca del origen esté la declaración, mejor verifica.
   */
  const declararMs = (info.basic_info.duration ?? 0) * 1000 || durationMs || 0
  const query = new URLSearchParams({ videoId })
  if (declararMs > 0) query.set('durationMs', String(Math.round(declararMs)))
  if (artworkUrl) query.set('artworkUrl', artworkUrl)

  const res = await fetch(`${apiBase}/aportar?${query}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'audio/mp4',
    },
    body: new Uint8Array(crudo),
  })
  const data = (await res.json().catch(() => null)) as (Aporte & { error?: string }) | null
  if (!res.ok || !data?.path) {
    throw new Error(data?.error ?? `El aporte falló (${res.status})`)
  }
  return data
}

/**
 * La descarga por rangos, con los cuidados aprendidos en el servidor:
 *
 *   · un 200 en un rango que no arranca en cero es el archivo entero metido en
 *     el medio — pegado daría un audio roto que «suena» mal para siempre;
 *   · el total lo dice el `content-range` del primer pedazo, y al final los
 *     bytes tienen que ser **exactos**: de más es tan corrupto como de menos;
 *   · el resto baja de a cuatro en paralelo — una ráfaga mayor sobre la misma
 *     URL firmada es la forma de que googlevideo corte con 403.
 */
async function bajarPorRangos(url: string): Promise<Buffer> {
  const pedir = async (desde: number) => {
    const res = await fetch(url, {
      headers: { Range: `bytes=${desde}-${desde + CHUNK_BYTES - 1}` },
    })
    if (res.status !== 206 && !(res.status === 200 && desde === 0)) {
      throw new Error(`googlevideo respondió ${res.status} al rango ${desde}`)
    }
    const range = res.headers.get('content-range')
    const inicio = range ? Number(range.split(' ')[1]?.split('-')[0]) : desde
    if (Number.isFinite(inicio) && inicio !== desde) {
      throw new Error(`googlevideo sirvió el rango ${inicio} en vez de ${desde}`)
    }
    return {
      buf: Buffer.from(await res.arrayBuffer()),
      total: range ? Number(range.split('/')[1]) : null,
    }
  }

  const primero = await pedir(0)
  if (!primero.buf.length) throw new Error('No se descargó audio')
  const total = primero.total
  const chunks: Buffer[] = [primero.buf]

  if (total !== null && total > primero.buf.length) {
    const desde: number[] = []
    for (let o = primero.buf.length; o < total; o += CHUNK_BYTES) desde.push(o)
    const PARALELO = 4
    const resto: Buffer[] = new Array<Buffer>(desde.length)
    let puntero = 0
    await Promise.all(
      Array.from({ length: Math.min(PARALELO, desde.length) }, async () => {
        while (puntero < desde.length) {
          const i = puntero++
          resto[i] = (await pedir(desde[i])).buf
        }
      }),
    )
    chunks.push(...resto)
  }

  const crudo = Buffer.concat(chunks)
  if (total !== null && crudo.length !== total) {
    throw new Error(`Descarga inconsistente: ${crudo.length} de ${total} bytes`)
  }
  return crudo
}
