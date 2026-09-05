import { ClientType, Innertube, Platform, UniversalCache } from 'youtubei.js'
import { evaluarPlayer } from './evaluar-player.js'
import type { ObservadorDiagnostico } from './diagnostico-eventos.js'
import { CLIENTES_RESOLVE, type ClienteResolve } from './clientes-youtube.js'
import { mintSessionToken, mintVideoToken } from './potoken.js'
import { bajarPorRangos } from './descarga-youtube.js'
import { CABECERAS_MEDIA, UA_NAVEGADOR, fetchYt } from './salida.js'

/**
 * Descarga con la conexión de esta computadora y aporta el audio al servidor.
 * El servidor valida AAC y duración antes de guardar. La resolución comparte
 * el protocolo con server/src/youtube.ts; en Electron, los PO tokens se piden
 * a Chromium mediante el proveedor configurado por resolutor-hijo.ts.
 */

export type OpcionesDiagnostico = {
  cliente?: ClienteResolve
  signal?: AbortSignal
  chunkBytes?: number
  onEvento?: ObservadorDiagnostico
}

// youtubei.js v17 dejó de traer evaluador de JS por seguridad, y sin uno no se
// pueden descifrar las URLs. node:vm alcanza y mantiene el código aislado del
// scope del proceso.
let platformLoaded = false
function ensurePlatform() {
  if (platformLoaded) return
  Platform.load({
    ...Platform.shim,
    eval: evaluarPlayer,
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

/**
 * Le pone a la sesión la versión de YouTube Music que corre hoy — espejo del
 * servidor. youtubei.js trae la suya compilada y está año y medio atrasada, y
 * es de donde sale el `cver` que más abajo se le estampa a la URL de media:
 * sin este refresco, esa reescritura se copia sobre sí misma.
 *
 * No tira si falla: una versión vieja resuelve, quedarse sin sesión no.
 */
async function refrescarVersionDeMusica(yt: Innertube): Promise<void> {
  try {
    const res = await fetchYt('https://music.youtube.com/', {
      headers: { Accept: 'text/html', 'User-Agent': UA_NAVEGADOR },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()

    const version = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1]
    if (!version) throw new Error('la portada no traía la versión del cliente')
    const apiKey = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1]

    const cliente = yt.session.context.client
    cliente.clientVersion = version
    cliente.originalUrl = 'https://music.youtube.com/'
    if (cliente.mainAppWebInfo) cliente.mainAppWebInfo.graftUrl = 'https://music.youtube.com/'
    if (apiKey) yt.session.api_key = apiKey
  } catch {
    /* Silencioso a propósito: esto corre en la máquina de alguien que solo
       quería escuchar música, y la sesión sigue siendo utilizable. */
  }
}

async function getClient(): Promise<Innertube> {
  if (clientPromise && Date.now() < clientExpiraEn) return clientPromise
  ensurePlatform()
  clientExpiraEn = Date.now() + CLIENT_TTL_MS
  clientNacioEn = Date.now()

  clientPromise = (async () => {
    const bootstrap = await Innertube.create({
      retrieve_player: false,
      fetch: fetchYt,
      user_agent: UA_NAVEGADOR,
      retrieve_innertube_config: false,
    })
    const visitorData = bootstrap.session.context.client.visitorData
    if (!visitorData) throw new Error('No se obtuvo visitorData')

    const yt = await Innertube.create({
      client_type: ClientType.MUSIC,
      po_token: await mintSessionToken(visitorData),
      visitor_data: visitorData,
      retrieve_player: true,
      /* El contexto lo arma Google, no youtubei.js de sus constantes: ver el
         porqué largo en el servidor. El `visitor_data` sigue siendo el del
         bootstrap, que es al que está atado el PO token de sesión. */
      generate_session_locally: false,
      /* La config fría es un POST que contesta 401 siempre y que nadie lee. */
      retrieve_innertube_config: false,
      user_agent: UA_NAVEGADOR,
      cache: new UniversalCache(false),
      fetch: fetchYt,
    })
    await refrescarVersionDeMusica(yt)
    return yt
  })()

  const propia = clientPromise
  propia.catch(() => {
    if (clientPromise === propia) resetClient()
  })

  return clientPromise
}

type Formatos =
  | { info: Awaited<ReturnType<Innertube['getBasicInfo']>>; cliente: ClienteResolve; tokenVideo: string }
  | { info: null; razones: string[] }

async function buscarFormatos(yt: Innertube, videoId: string, opciones: OpcionesDiagnostico): Promise<Formatos> {
  const razones: string[] = []
  opciones.signal?.throwIfAborted()
  const tokenVideo = await mintVideoToken(videoId)
  for (const candidato of opciones.cliente ? [opciones.cliente] : CLIENTES_RESOLVE) {
    opciones.signal?.throwIfAborted()
    const inicio = Date.now()
    opciones.onEvento?.({ etapa: 'cliente', cliente: candidato, estado: 'consultando' })
    try {
      const intento = await yt.getBasicInfo(videoId, {
        client: candidato,
        po_token: tokenVideo,
      })
      /* Un formato sin URL ni cifrado es SABR y no sirve desde acá. */
      const audio = (intento.streaming_data?.adaptive_formats ?? []).filter(
        (f) => f.mime_type.startsWith('audio/mp4') && (f.url || f.signature_cipher) && !f.drm_families?.length && !f.drm_track_type,
      )
      opciones.signal?.throwIfAborted()
      opciones.onEvento?.({ etapa: 'cliente', cliente: candidato,
        estado: audio.length ? 'audio_disponible' : intento.playability_status?.status ?? 'sin_audio',
        duracionMs: Date.now() - inicio })
      if (audio.length) return { info: intento, cliente: candidato, tokenVideo }
      const estado = intento.playability_status
      razones.push(
        `${candidato}: ${estado?.status ?? 'sin streaming_data'}${estado?.reason ? ` — ${estado.reason}` : ''}`,
      )
    } catch (e) {
      opciones.signal?.throwIfAborted()
      opciones.onEvento?.({ etapa: 'cliente', cliente: candidato, estado: 'error', duracionMs: Date.now() - inicio })
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
  const audio = await descargarAudio(videoId)
  return aportar(apiBase, token, {
    videoId, artworkUrl,
    durationMs: audio.durationMs || durationMs || undefined,
    bytes: audio.bytes,
  })
}

/** El informe de formatos excluye la URL firmada. No descarga media. */
export async function inspeccionarAudio(videoId: string, opciones: OpcionesDiagnostico = {}) {
  const { url: _url, ...informe } = await prepararAudio(videoId, opciones)
  return informe
}

export async function descargarAudio(videoId: string, opciones: OpcionesDiagnostico = {}): Promise<{
  bytes: Uint8Array<ArrayBuffer>
  durationMs: number
}> {
  const preparado = await prepararAudio(videoId, opciones)
  const crudo = await bajarPorRangos(preparado.url, {
    fetch: fetchYt, headers: CABECERAS_MEDIA, totalEsperado: preparado.formato.bytes,
    signal: opciones.signal, chunkBytes: opciones.chunkBytes, onEvento: opciones.onEvento,
  })
  return { durationMs: preparado.durationMs, bytes: new Uint8Array(crudo) }
}

async function prepararAudio(videoId: string, opciones: OpcionesDiagnostico) {
  if (!/^[\w-]{11}$/.test(videoId)) throw new Error('videoId inválido')
  if (opciones.cliente && !CLIENTES_RESOLVE.includes(opciones.cliente)) throw new Error('Cliente no compatible')
  opciones.signal?.throwIfAborted()
  const inicioSesion = Date.now()
  let yt = await getClient()
  opciones.onEvento?.({ etapa: 'sesion', duracionMs: Date.now() - inicioSesion })
  let encontrado = await buscarFormatos(yt, videoId, opciones)

  if (!encontrado.info && !opciones.cliente && puedeResetear()) {
    /* El caso conocido es la sesión pasada de fecha; una nueva lo destraba.
       Una vez sola, y nunca sobre una sesión joven. */
    resetClient()
    yt = await getClient()
    encontrado = await buscarFormatos(yt, videoId, opciones)
  }
  if (!encontrado.info) {
    throw new Error(`Sin audio desde acá — ${encontrado.razones.join('; ')}`)
  }

  const { info, cliente, tokenVideo } = encontrado

  /*
   * Solo AAC en mp4, sin caída a Opus como tiene el servidor: `/aportar`
   * rechaza cualquier otra cosa —es su control anti-envenenamiento—, así que
   * bajar un webm sería trabajo tirado.
   */
  const enMp4 = (info.streaming_data?.adaptive_formats ?? []).filter(
    (f) => f.mime_type.startsWith('audio/mp4') && (f.url || f.signature_cipher) && !f.drm_families?.length && !f.drm_track_type,
  )
  const best = enMp4.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0]
  if (!best) throw new Error(`${cliente} no ofreció audio AAC para aportar`)
  const formato = { cliente, itag: best.itag, bytes: best.content_length, mime: best.mime_type, bitrate: best.bitrate }
  opciones.onEvento?.({ etapa: 'formato', cliente, itag: best.itag, bytes: best.content_length })
  opciones.signal?.throwIfAborted()
  const inicioDescifrado = Date.now()
  opciones.onEvento?.({ etapa: 'descifrado', estado: 'iniciando' })
  let url = await best.decipher(yt.session.player)
  opciones.onEvento?.({ etapa: 'descifrado', duracionMs: Date.now() - inicioDescifrado })

  /*
   * La misma cirugía de URL que el servidor (ver allá el porqué largo):
   * `cver` se reescribe con la versión que la sesión negoció —solo para
   * MUSIC—, y el `pot` de media se reemplaza entero por uno atado al video.
   * Cirugía sobre el string: una URL firmada no sobrevive a que la normalicen.
   */
  const cver = yt.session.context.client.clientVersion
  if (cver && cliente === 'YTMUSIC')
    url = url.replace(/([?&]cver=)[^&]*/, `$1${encodeURIComponent(cver)}`)

  // Reutiliza el token del video que se envió a /player.
  url = url
    .replace(/&pot=[^&]*/g, '')
    .replace(/\?pot=[^&]*&/, '?')
    .replace(/\?pot=[^&]*$/, '')
  url += `${url.includes('?') ? '&' : '?'}pot=${encodeURIComponent(tokenVideo)}`
  return { url, formato, durationMs: Math.round((info.basic_info.duration ?? 0) * 1000) }

}

/**
 * El aporte, en tres pasos y sin que los bytes crucen el servicio.
 *
 * Antes iba en el cuerpo de un POST a `/aportar`. Desde que el servicio vive
 * en una función y no en un contenedor eso tiene techo —el plan gratis corta
 * el pedido en 4.5 MB, y una canción de cinco minutos pesa más—, así que el
 * archivo sube **derecho a Supabase Storage** con una URL firmada de un solo
 * uso, y el servidor lo verifica desde allá.
 *
 * `/aportar` sigue existiendo para un cliente viejo, así que esto no rompe a
 * nadie que no se haya actualizado; simplemente ese camino no sirve para las
 * canciones grandes.
 */
async function aportar(
  apiBase: string,
  token: string,
  datos: {
    videoId: string
    durationMs?: number
    artworkUrl?: string
    bytes: Uint8Array<ArrayBuffer>
  },
): Promise<Aporte> {
  const pedir = async (ruta: string, cuerpo: unknown) => {
    const res = await fetch(`${apiBase}${ruta}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (!res.ok) throw new Error((data?.error as string) ?? `El aporte falló (${res.status})`)
    return data ?? {}
  }

  const permiso = (await pedir('/aportar/url', { videoId: datos.videoId })) as {
    cached?: boolean
    path?: string
    url?: string
  }
  /* Alguien la aportó mientras esta computadora la bajaba: no hay nada que
     subir y lo guardado ya sirve. */
  if (permiso.cached && permiso.path) {
    return {
      path: permiso.path,
      artworkPath: null,
      cached: true,
      durationMs: datos.durationMs ?? null,
    }
  }
  if (!permiso.url) throw new Error('El servidor no dio dónde subir el aporte')

  const subida = await fetch(permiso.url, {
    method: 'PUT',
    headers: { 'Content-Type': 'audio/mp4' },
    body: datos.bytes,
  })
  if (!subida.ok) throw new Error(`El aporte falló al subir (${subida.status})`)

  const listo = (await pedir('/aportar/confirmar', {
    videoId: datos.videoId,
    durationMs: datos.durationMs,
    artworkUrl: datos.artworkUrl,
  })) as unknown as Aporte
  if (!listo.path) throw new Error('El servidor no confirmó el aporte')
  return listo
}
