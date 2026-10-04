import { accesoAprobado } from './acceso.js'
import { cors } from './cors.js'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cacheImage } from './artwork.js'
import { leerCanciones, leerLista } from './spotify.js'
import { isLang, translate } from './translate.js'

/**
 * Las rutas que no hablan con YouTube.
 *
 * Existe para que este puñado de rutas pueda vivir en dos lados a la vez: el
 * contenedor (`index.ts`, que las delega acá, y que hoy es el de desarrollo) y
 * una función de Vercel (`../api/index.ts`, que no sirve otra cosa). Una sola
 * implementación, dos transportes.
 *
 * El corte no es «lo liviano» por tamaño sino por **dependencia**: nada de acá
 * pasa por `getClient()` de `youtube.ts`, y esa es la única razón por la que se
 * pueden mover. Cada proceso nuevo que crea una sesión de InnerTube acuña un PO
 * token con BotGuard, y el propio `youtube.ts` se cuida de no hacerlo seguido
 * (`RESET_MIN_MS`) porque una ráfaga de sesiones desde la misma IP es la firma
 * de un bot. En serverless cada instancia es un proceso nuevo, así que mover
 * una ruta que toque InnerTube sería fabricar justo esa ráfaga. Estas cinco no
 * la tocan: `spotify.ts`, `translate.ts` y `artwork.ts` no importan nada de
 * YouTube, y `/img` es un proxy y nada más.
 *
 * Por eso también el bundle es chico: acá no entran jsdom, youtubei.js ni
 * bgutils, que son lo que hace pesado y lento de arrancar al servicio entero.
 *
 * Interfaz `Request`/`Response` y no la de `node:http` porque es la que habla
 * Vercel; `index.ts` traduce de la suya a esta, que es la conversión barata.
 */

/** Las rutas que atiende. `index.ts` la consulta para saber qué delegar. */
export const RUTAS_LIVIANAS: ReadonlySet<string> = new Set([
  '/img',
  '/translate',
  '/spotify',
  '/spotify/canciones',
  '/artwork',
])

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase: SupabaseClient | null =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

/**
 * Quién puede pedirle algo a esto. Misma regla que el servicio entero: el JWT
 * de sesión de Supabase que la app ya tiene, verificado con la service_role.
 *
 * `/img` es la excepción y no pasa por acá — ver más abajo.
 */
async function autorizado(cabecera: string | null): Promise<boolean> {
  return accesoAprobado(supabase, cabecera)
}

function json(status: number, body: unknown, origen: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(origen) },
  })
}

/**
 * Hosts de imagen que el proxy acepta.
 *
 * Es una lista blanca y no un proxy abierto: sin esto, cualquiera con la URL
 * del servicio podría usarlo para pedir lo que quiera desde nuestra IP.
 */
const IMAGE_HOSTS = /^([a-z0-9-]+\.)?(googleusercontent\.com|ytimg\.com|ggpht\.com)$/

/**
 * Devuelve una carátula remota con nuestros encabezados.
 *
 * Las tapas de la portada viven en `yt3.googleusercontent.com`, que responde
 * sin CORS y por eso Chrome las descarta enteras (ORB): se ven cuadros negros
 * donde debería haber discos. Copiarlas a Storage como hacemos con el audio
 * sería absurdo para una vitrina que cambia todos los días, así que se pasan de
 * largo con un `Cache-Control` largo para que el navegador se las quede.
 *
 * Es la ruta que más gana con la mudanza: es la de más volumen de la app —una
 * por carátula en pantalla— y en Vercel el CDN se queda con la respuesta, así
 * que la segunda persona que abre la misma portada no llega ni a la función.
 *
 * El cuerpo se pasa **en streaming** (`upstream.body`) en vez de juntarlo en un
 * Buffer: no hay razón para tener la imagen entera en memoria, y así el primer
 * byte sale antes.
 */
async function proxyImage(raw: string, origen: string | null): Promise<Response> {
  let target: URL
  try {
    target = new URL(raw)
  } catch {
    return json(400, { error: 'URL inválida' }, origen)
  }
  if (target.protocol !== 'https:' || !IMAGE_HOSTS.test(target.hostname)) {
    return json(403, { error: 'Host no permitido' }, origen)
  }

  const upstream = await fetch(target)
  if (!upstream.ok || !upstream.body) {
    return json(502, { error: 'No se pudo traer la imagen' }, origen)
  }

  const type = upstream.headers.get('content-type') ?? ''
  if (!type.startsWith('image/')) return json(415, { error: 'Eso no es una imagen' }, origen)

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': type,
      'Cache-Control': 'public, max-age=604800, immutable',
      ...cors(origen),
    },
  })
}

/**
 * Atiende el pedido si es de las suyas; devuelve `null` si no lo es, para que
 * quien llame siga buscando por su cuenta.
 *
 * `ruta` existe para quien sirve esto bajo un prefijo —en Vercel el pedido
 * llega como `/api/img`— y quiere que se resuelva por la ruta que la app pidió.
 * Va como parámetro y no reescribiendo el `Request` porque clonar uno con
 * cuerpo obliga a `duplex` y no todos los runtimes lo aceptan igual.
 */
export async function manejarLiviana(req: Request, ruta?: string): Promise<Response | null> {
  const url = new URL(req.url)
  ruta ??= url.pathname
  const origen = req.headers.get('origin')

  if (!RUTAS_LIVIANAS.has(ruta)) return null

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origen) })

  /*
   * `/img` es la única que no pide sesión, y no por descuido: su respuesta se
   * consume como `<Image source={{ uri }}>`, y ahí no hay dónde poner un
   * `Authorization`. La lista blanca de arriba es lo que la acota.
   */
  if (ruta !== '/img' && !(await autorizado(req.headers.get('authorization')))) {
    return json(401, { error: 'No autorizado' }, origen)
  }

  if (ruta === '/img' && req.method === 'GET') {
    const u = url.searchParams.get('u')
    if (!u) return json(400, { error: 'Falta el parámetro u' }, origen)
    return proxyImage(u, origen)
  }

  /*
   * Las canciones de una lista de Spotify, por su enlace.
   *
   * Va por el server y no por el cliente por dos razones: la página de embed no
   * manda cabeceras de CORS —el navegador no la puede leer— y desde el teléfono
   * tampoco hay forma de poner un User-Agent creíble.
   */
  if (ruta === '/spotify' && req.method === 'GET') {
    const enlace = url.searchParams.get('url')?.trim()
    if (!enlace) return json(400, { error: 'Falta el parámetro url' }, origen)
    try {
      return json(200, await leerLista(enlace), origen)
    } catch (e) {
      // El texto de estos errores está escrito para mostrarse tal cual: dicen
      // qué hacer («ponela pública un momento»), no qué falló por dentro.
      return json(422, { error: e instanceof Error ? e.message : 'No se pudo leer la lista' }, origen)
    }
  }

  /*
   * Canciones sueltas de Spotify, por sus ids. Es la salida al tope de 100 de
   * la página de una lista, y también a las privadas.
   */
  if (ruta === '/spotify/canciones' && req.method === 'POST') {
    const body = (await leerJson(req)) as { ids?: unknown }
    const ids = body.ids
    if (!Array.isArray(ids) || !ids.length) return json(400, { error: 'Faltan ids' }, origen)
    if (ids.length > 100) return json(413, { error: 'Demasiadas canciones en una tanda' }, origen)

    const limpios = ids
      .filter((id): id is string => typeof id === 'string')
      .filter((id) => /^[A-Za-z0-9]{22}$/.test(id))
    if (!limpios.length) return json(400, { error: 'Ningún id válido' }, origen)

    return json(200, { pistas: await leerCanciones(limpios) }, origen)
  }

  if (ruta === '/translate' && req.method === 'POST') {
    const body = (await leerJson(req)) as { texts?: unknown; to?: unknown }
    const to = String(body.to ?? '')
    const texts = body.texts
    if (!isLang(to)) return json(400, { error: 'Idioma no permitido' }, origen)
    if (!Array.isArray(texts) || texts.some((t) => typeof t !== 'string')) {
      return json(400, { error: 'Falta texts' }, origen)
    }
    // Un tope por las dudas: una letra no pasa de un par de cientos de líneas.
    if (texts.length > 400) return json(413, { error: 'Demasiadas líneas' }, origen)

    return json(200, { texts: await translate(texts as string[], to) }, origen)
  }

  /*
   * Copia solo la carátula, sin tocar el audio.
   *
   * Es para los mensajes anteriores al caché: guardaron una URL del CDN de
   * Google, que responde 429 cada tanto y deja el disco sin imagen.
   */
  if (ruta === '/artwork' && req.method === 'POST') {
    const body = (await leerJson(req)) as { videoId?: string; url?: string }
    if (!body.videoId || !body.url) return json(400, { error: 'Faltan videoId y url' }, origen)
    if (!supabase) return json(500, { error: 'Storage no configurado' }, origen)
    return json(200, { path: await cacheImage(supabase, body.url, body.videoId) }, origen)
  }

  // La ruta es de las suyas pero con otro método.
  return json(405, { error: 'Método no permitido' }, origen)
}

/** El cuerpo como objeto, o vacío si no vino o no era JSON. */
async function leerJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const texto = await req.text()
    if (!texto) return {}
    const dato = JSON.parse(texto)
    return typeof dato === 'object' && dato !== null ? (dato as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}
