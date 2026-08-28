import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import { chequearSalud } from './salud.js'
import {
  prepararAporte,
  getAlbum,
  getArtist,
  getGenero,
  getGeneros,
  getHome,
  getHomeGeneros,
  type SemillaEntrada,
  getPlaylistInfo,
  resolveAudio,
  peaks,
  search,
  searchArtists,
} from './youtube.js'
import { isLang, translate } from './translate.js'
import { leerCanciones, leerLista } from './spotify.js'
import { emparejarLote } from './emparejar.js'
import { notificarMensaje, notificarSolicitud } from './push.js'
import { cacheImage } from './artwork.js'
import { subirPropia } from './propia.js'

/**
 * Servicio de resolución de música.
 *
 * Existe únicamente porque la parte de YouTube necesita Node, jsdom y la VM de
 * BotGuard — nada de eso corre en el navegador. Expone lo mínimo:
 *
 *   GET  /search?q=…          → metadatos de canciones
 *   GET  /home                → la portada: novedades, tendencias, listas
 *   GET  /album|/playlist?id= → una colección con sus canciones
 *   GET  /img?u=…             → proxy de carátulas (ver abajo)
 *   GET  /peaks?videoId=…     → la forma de onda, calculada con ffmpeg
 *   GET  /artist?id=…         → ficha del artista (foto, bio, suscriptores)
 *   POST /resolve {videoId}   → descarga audio y carátula UNA vez, a Storage
 *   POST /translate {texts,to}→ traduce la letra, línea por línea
 *   GET  /spotify?url=…       → las canciones de una lista de Spotify
 *   POST /spotify/canciones   → canciones sueltas por id (listas de +100)
 *   POST /emparejar {pistas}  → de esos nombres, la canción de YouTube Music
 *
 * El audio se guarda en Supabase Storage y la app lo reproduce desde ahí. Así el
 * contacto con YouTube ocurre una vez por canción y no en cada reproducción: es
 * más rápido para quien escucha, y las flores ya enviadas siguen sonando aunque
 * YouTube rompa esto mañana.
 */

const ejecutar = promisify(execFile)

/**
 * La duración de un audio ya guardado, medida del archivo mismo.
 *
 * Es el último recurso del camino cacheado de /resolve: solo corre cuando ni
 * el cliente ni la búsqueda saben la duración (las canciones de la portada
 * vienen sin ella). ffprobe lee la cabecera del contenedor — no decodifica el
 * audio — así que tarda lo que tarda un GET del principio del archivo.
 */
async function medirDuracionMs(
  storage: NonNullable<typeof supabase>,
  path: string,
): Promise<number | undefined> {
  try {
    const { data } = await storage.storage.from(BUCKET).createSignedUrl(path, 60)
    if (!data?.signedUrl) return undefined
    const { stdout } = await ejecutar('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      data.signedUrl,
    ])
    const segundos = Number(String(stdout).trim())
    return Number.isFinite(segundos) && segundos > 0 ? Math.round(segundos * 1000) : undefined
  } catch {
    // Sin duración medible se devuelve nada: el cliente queda como estaba.
    return undefined
  }
}

/**
 * La onda de una canción, guardada al lado del audio.
 *
 * Calcularla es caro de verdad: ffmpeg baja el tema entero y lo decodifica a
 * PCM. Eso se banca una vez, en el editor de fragmento; no se banca cada vez
 * que alguien abre un perfil o desliza el chat, que es donde la onda pasó a
 * dibujarse. El resultado es un puñado de números, así que se archiva como un
 * JSON diminuto —del orden de un kilobyte— en el mismo bucket que el audio.
 *
 * La clave lleva la cantidad de barras porque una onda de 160 no se puede
 * derivar de una de 60 sin inventar detalle.
 */
function rutaPicos(videoId: string, buckets: number, desdeMs: number, durMs: number): string {
  const tramo = durMs > 0 ? `-${Math.round(desdeMs)}-${Math.round(durMs)}` : ''
  return `picos/${videoId}-${buckets}${tramo}.json`
}

/**
 * El archivo de audio de una canción, sea cual sea su extensión.
 *
 * El nombre canónico es `.m4a`, pero lo guardado antes de esa decisión son
 * `.webm`, y si YouTube no ofreciera mp4 para algún tema volvería a haberlos.
 * Dar por sentada la extensión era la diferencia entre dibujar la onda y
 * responder «esa canción no está guardada» de un archivo que sí está.
 */
async function archivoDeCancion(
  storage: NonNullable<typeof supabase>,
  videoId: string,
): Promise<string | null> {
  const { data } = await storage.storage.from(BUCKET).list('', { search: videoId })
  const encontrados = (data ?? []).filter((f) => f.name.startsWith(`${videoId}.`))
  if (!encontrados.length) return null
  const canonico = encontrados.find((f) => f.name === `${videoId}.m4a`)
  return (canonico ?? encontrados[0]).name
}

async function picosGuardados(
  storage: NonNullable<typeof supabase>,
  ruta: string,
): Promise<{ peaks: number[]; durationMs: number } | null> {
  try {
    const { data, error } = await storage.storage.from(BUCKET).download(ruta)
    if (error || !data) return null
    const leido = JSON.parse(await data.text()) as { peaks?: unknown; durationMs?: unknown }
    if (!Array.isArray(leido.peaks) || typeof leido.durationMs !== 'number') return null
    return { peaks: leido.peaks as number[], durationMs: leido.durationMs }
  } catch {
    // Un JSON corrupto no vale más que no tenerlo: se vuelve a calcular.
    return null
  }
}

const PORT = Number(process.env.PORT ?? 8787)
const BUCKET = process.env.AUDIO_BUCKET ?? 'songs'
const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// La service_role key saltea RLS. Vive solo acá, jamás en el bundle del cliente.
const supabase =
  SUPABASE_URL && SERVICE_KEY ? createClient(SUPABASE_URL, SERVICE_KEY) : null

/**
 * Los orígenes que pueden leer nuestras respuestas, separados por coma.
 *
 * Era **uno solo**, y eso no daba: la app vive en más de un dominio a la vez
 * —el canónico y el que Vercel asigna al proyecto— y `Access-Control-Allow-Origin`
 * no acepta una lista. Con un valor fijo, el dominio que no estuviera ahí se
 * comía un error de CORS en cada búsqueda, que se ve como «no encuentra
 * canciones» sin ninguna pista de por qué.
 *
 * La forma correcta es la de siempre: se compara el `Origin` del pedido contra
 * la lista y **se devuelve ese mismo**, uno solo. Sin lista configurada se
 * responde `*`, que es lo que hacía antes y lo que sirve en desarrollo.
 */
const ORIGENES = (process.env.ALLOWED_ORIGIN ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

function cors(req: import('node:http').IncomingMessage) {
  const origen = req.headers.origin
  return {
    'Access-Control-Allow-Origin':
      ORIGENES.length === 0 ? '*' : origen && ORIGENES.includes(origen) ? origen : ORIGENES[0],
    /* Le avisa a las cachés intermedias que la respuesta cambia según quién
       pregunta. Sin esto, un proxy podría servirle a un dominio la cabecera
       que se calculó para el otro. */
    Vary: 'Origin',
    'Access-Control-Allow-Headers': 'content-type, authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  }
}

function responder(
  res: import('node:http').ServerResponse,
  status: number,
  body: unknown,
  req?: import('node:http').IncomingMessage,
) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...(req ? cors(req) : {}),
  })
  res.end(payload)
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
 * sería absurdo para una vitrina que cambia todos los días y que casi nadie
 * mira dos veces, así que se pasan de largo con un `Cache-Control` largo para
 * que el navegador se las quede.
 */
async function proxyImage(
  res: import('node:http').ServerResponse,
  raw: string,
  req: import('node:http').IncomingMessage,
) {
  let target: URL
  try {
    target = new URL(raw)
  } catch {
    return responder(res, 400, { error: 'URL inválida' }, req)
  }
  if (target.protocol !== 'https:' || !IMAGE_HOSTS.test(target.hostname)) {
    return responder(res, 403, { error: 'Host no permitido' }, req)
  }

  const upstream = await fetch(target)
  if (!upstream.ok || !upstream.body)
    return responder(res, 502, { error: 'No se pudo traer la imagen' }, req)

  const type = upstream.headers.get('content-type') ?? ''
  if (!type.startsWith('image/')) return responder(res, 415, { error: 'Eso no es una imagen' }, req)

  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': 'public, max-age=604800, immutable',
    ...cors(req),
  })
  res.end(Buffer.from(await upstream.arrayBuffer()))
}

/**
 * Quién puede pedirle algo a este servicio.
 *
 * El servicio es público —tiene una URL en internet— y hace dos cosas caras:
 * `/peaks` corre ffmpeg sobre el audio, y `/resolve` **escribe en nuestro
 * Storage** con la service_role. Sin esto, cualquiera con la URL podía hacernos
 * gastar CPU y llenarnos el bucket.
 *
 * La credencial es el **JWT de sesión de Supabase** que ya tiene la app, y no un
 * token compartido puesto a mano. Un token fijo tendría que viajar en el bundle
 * —es una app de cliente, no hay dónde esconderlo— así que cualquiera que
 * descargue el IPA lo saca en dos minutos y no habríamos ganado nada. El JWT, en
 * cambio, es de una persona, vence solo y se corta cerrando su sesión.
 *
 * Se verifica contra Supabase con la service_role, que es la misma que ya
 * usamos para Storage: si devuelve un usuario, la firma es válida y no venció.
 *
 * `CORS` no cumple este papel y por eso no alcanzaba: solo le dice al
 * **navegador** qué respuestas puede leer. Un `curl` lo ignora por completo.
 */
/** Tope de un aporte: una canción de 10 minutos en 256kbps son ~19 MB. */
const APORTE_MAX_BYTES = 40 * 1024 * 1024

/** Quién firma este pedido, para el log de aportes. Nunca corta el camino. */
async function quienEs(req: import('node:http').IncomingMessage): Promise<string> {
  try {
    const token = req.headers.authorization?.slice(7) ?? ''
    const { data } = await supabase!.auth.getUser(token)
    return data.user?.id ?? 'desconocido'
  } catch {
    return 'desconocido'
  }
}

async function autorizado(req: import('node:http').IncomingMessage): Promise<boolean> {
  if (!supabase) return false
  const cabecera = req.headers.authorization
  if (!cabecera?.startsWith('Bearer ')) return false
  try {
    const { data, error } = await supabase.auth.getUser(cabecera.slice(7))
    return !error && !!data.user
  } catch {
    // Supabase no contestó: se niega. Ante la duda, no se atiende.
    return false
  }
}

/**
 * Resolver una canción a Storage y devolver su ficha. Es el corazón de
 * `/resolve`, afuera del handler para que el camino con progreso lo comparta
 * sin copiarlo. `onProgreso` (0..1) es el avance de la descarga; sin él, todo
 * funciona igual que antes.
 */
async function resolverCancion(
  db: NonNullable<typeof supabase>,
  body: { videoId: string; artworkUrl?: string; durationMs?: number },
  onProgreso?: (pct: number) => void,
) {
  const { videoId } = body
  const path = `${videoId}.m4a`
  const artworkP = cacheImage(db, body.artworkUrl, videoId)
  const { data: existing } = await db.storage.from(BUCKET).list('', { search: path })
  if (existing?.some((f) => f.name === path)) {
    const durationMs =
      body.durationMs && body.durationMs > 0 ? body.durationMs : await medirDuracionMs(db, path)
    return { path, artworkPath: await artworkP, cached: true, durationMs }
  }
  const audio = await resolveAudio(videoId, onProgreso)
  const destino = `${videoId}.${audio.ext}`
  const { error } = await db.storage
    .from(BUCKET)
    .upload(destino, audio.bytes, { contentType: audio.mimeType, upsert: true })
  if (error) throw new Error(`No se pudo guardar: ${error.message}`)
  return {
    path: destino,
    artworkPath: await artworkP,
    cached: false,
    title: audio.title,
    artist: audio.artist,
    durationMs: audio.durationMs,
    bitrate: audio.bitrate,
    bytes: audio.bytes.length,
  }
}

const server = createServer(async (req, res) => {
  /* El atajo del pedido: ya sabe a quién le contesta, así que la cabecera de
     CORS sale bien sin que cada `return` tenga que acordarse de pasarla. */
  const json = (status: number, body: unknown) => responder(res, status, body, req)
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors(req))
      return res.end()
    }

    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)

    if (url.pathname === '/health') {
      const salud = await chequearSalud(supabase)
      return json(salud.ok ? 200 : 503, salud)
    }

    /*
     * El aviso de push, que **no viene de una persona**: lo manda el trigger
     * de la base por pg_net, sin sesión. Su credencial es un secreto
     * compartido entre la base (`private.push_relay`) y este proceso
     * (`PUSH_SECRET`) — dos lugares del lado del servidor, nunca el bundle.
     */
    if (url.pathname === '/push' && req.method === 'POST') {
      const secreto = process.env.PUSH_SECRET
      if (!secreto || req.headers['x-push-secret'] !== secreto) {
        return json(401, { error: 'No autorizado' })
      }
      if (!supabase) return json(503, { error: 'Sin Supabase configurado' })
      /* Dos avisos por la misma puerta: un mensaje nuevo o una solicitud de
         contacto. Los distingue qué campo viene, que es lo que puso el trigger
         correspondiente (ver las migraciones de push). */
      const body = (await readJson(req)) as {
        messageId?: unknown
        solicitudDe?: unknown
        solicitudPara?: unknown
      }
      if (typeof body.messageId === 'string') {
        return json(200, await notificarMensaje(supabase, body.messageId))
      }
      if (typeof body.solicitudDe === 'string' && typeof body.solicitudPara === 'string') {
        return json(200, await notificarSolicitud(supabase, body.solicitudDe, body.solicitudPara))
      }
      return json(400, { error: 'Falta messageId o el par de la solicitud' })
    }

    /*
     * Todo lo demás pide sesión, con **dos excepciones**.
     *
     * `/health` queda abierto porque es lo que mira Railway para saber si el
     * contenedor está vivo, y no tiene sesión que ofrecer ni dato que filtrar.
     *
     * `/img` queda abierto porque **no puede llevar cabecera**: su respuesta se
     * consume como `<Image source={{ uri }}>`, y ahí no hay forma de mandar un
     * `Authorization`. No queda desprotegido del todo: `IMAGE_HOSTS` lo limita a
     * los hosts de carátulas de Google, así que es un proxy de imágenes acotado
     * y no uno abierto. Es lo más barato que expone el servicio.
     */
    if (url.pathname !== '/img' && !(await autorizado(req))) {
      return json(401, { error: 'No autorizado' })
    }

    if (url.pathname === '/search' && req.method === 'GET') {
      const q = url.searchParams.get('q')?.trim()
      if (!q) return json(400, { error: 'Falta el parámetro q' })
      /* Canciones y artistas se piden juntos y en paralelo: quien busca no
         sabe de antemano cuál de los dos quería, y esperar dos veces por lo
         mismo se sentiría el doble de lento. */
      const [results, artists] = await Promise.all([search(q), searchArtists(q)])
      return json(200, { results, artists })
    }

    if (url.pathname === '/artist' && req.method === 'GET') {
      const id = url.searchParams.get('id')?.trim()
      if (!id) return json(400, { error: 'Falta el parámetro id' })
      const artist = await getArtist(id)
      // La foto se copia igual que la carátula: el CDN de Google la corta con
      // 429 cada tanto y el panel del artista queda con un hueco.
      const photoPath = supabase ? await cacheImage(supabase, artist.photoUrl, `artist-${id}`) : null
      return json(200, { ...artist, photoPath })
    }

    /*
     * La forma de onda de una canción ya guardada.
     *
     * Antes se calculaba en el cliente decodificando el tema entero con Web
     * Audio. Eso existe en el navegador y **no** en el teléfono: en iOS la
     * pantalla de elegir el fragmento moría con «este navegador no soporta Web
     * Audio». Acá lo hace ffmpeg, que ya está instalado para remuxar, y el
     * resultado es el mismo en las dos plataformas — antes cada una podía
     * dibujar una onda distinta.
     */
    if (url.pathname === '/peaks' && req.method === 'GET') {
      const videoId = url.searchParams.get('videoId')?.trim()
      if (!videoId) return json(400, { error: 'Falta videoId' })
      if (!supabase) return json(500, { error: 'Storage no configurado' })

      const buckets = Math.max(40, Math.min(600, Number(url.searchParams.get('buckets')) || 160))
      /*
       * El tramo pedido, si es un fragmento.
       *
       * Dibujar un fragmento de quince segundos con la onda de la canción
       * entera es dibujar otra cosa: en un tema de seis minutos, esos quince
       * segundos son dos barras. Con el tramo, las ciento cuarenta barras de la
       * tarjeta son ciento cuarenta barras **de ese pedazo**.
       */
      const desdeMs = Math.max(0, Number(url.searchParams.get('desdeMs')) || 0)
      const durMs = Math.max(0, Number(url.searchParams.get('durMs')) || 0)
      const ruta = rutaPicos(videoId, buckets, desdeMs, durMs)

      const archivada = await picosGuardados(supabase, ruta)
      if (archivada) return json(200, archivada)

      const nombre = await archivoDeCancion(supabase, videoId)
      if (!nombre) return json(404, { error: 'Esa canción no está guardada' })
      const { data: firmada, error: e } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(nombre, 300)
      if (e || !firmada?.signedUrl) return json(404, { error: 'Esa canción no está guardada' })

      const onda = await peaks(
        firmada.signedUrl,
        buckets,
        durMs > 0 ? { desdeMs, durMs } : undefined,
      )
      /*
       * Se archiva sin esperar y sin que importe si falla: la onda ya está
       * calculada y quien la pidió no tiene por qué esperar a que se guarde. Si
       * no se pudo guardar, la próxima vez se calcula de nuevo y listo.
       */
      void supabase.storage
        .from(BUCKET)
        .upload(ruta, JSON.stringify(onda), {
          contentType: 'application/json',
          upsert: true,
        })
        .catch(() => {})

      return json(200, onda)
    }

    if (url.pathname === '/img' && req.method === 'GET') {
      const u = url.searchParams.get('u')
      if (!u) return json(400, { error: 'Falta el parámetro u' })
      return proxyImage(res, u, req)
    }

    if (url.pathname === '/home' && req.method === 'GET') {
      return json(200, { sections: await getHome() })
    }

    /*
     * El home tejido de los géneros que la persona eligió. Las semillas vienen
     * en el cuerpo —el cliente ya las tiene, así que el servidor no toca la
     * base— y se acotan a un puñado para no armar una portada infinita.
     */
    if (url.pathname === '/home-generos' && req.method === 'POST') {
      const body = (await readJson(req)) as { semillas?: unknown }
      const semillas = Array.isArray(body.semillas)
        ? (body.semillas.filter(
            (s): s is SemillaEntrada =>
              typeof s === 'object' &&
              s !== null &&
              typeof (s as SemillaEntrada).ref === 'string' &&
              typeof (s as SemillaEntrada).name === 'string',
          ) as SemillaEntrada[])
        : []
      if (!semillas.length) return json(200, { sections: [] })
      return json(200, { sections: await getHomeGeneros(semillas.slice(0, 20)) })
    }

    if (url.pathname === '/generos' && req.method === 'GET') {
      return json(200, { generos: await getGeneros() })
    }

    if (url.pathname === '/genero' && req.method === 'GET') {
      const params = url.searchParams.get('params')?.trim()
      if (!params) return json(400, { error: 'Falta el parámetro params' })
      return json(200, await getGenero(params))
    }

    if ((url.pathname === '/album' || url.pathname === '/playlist') && req.method === 'GET') {
      const id = url.searchParams.get('id')?.trim()
      if (!id) return json(400, { error: 'Falta el parámetro id' })
      const album =
        url.pathname === '/album' ? await getAlbum(id) : await getPlaylistInfo(id)
      // Misma razón que con la foto del artista: el CDN de Google corta con 429
      // cada tanto y la tapa quedaría en blanco.
      const artworkPath = supabase
        ? await cacheImage(supabase, album.artworkUrl, `album-${id}`)
        : null
      return json(200, { ...album, artworkPath })
    }

    /*
     * Las canciones de una lista de Spotify, por su enlace.
     *
     * Va por el server y no por el cliente por dos razones: la página de embed
     * no manda cabeceras de CORS —el navegador no la puede leer— y desde el
     * teléfono tampoco hay forma de poner un User-Agent creíble. Acá además
     * queda un solo lugar donde arreglar el parseo el día que Spotify cambie la
     * página.
     */
    if (url.pathname === '/spotify' && req.method === 'GET') {
      const enlace = url.searchParams.get('url')?.trim()
      if (!enlace) return json(400, { error: 'Falta el parámetro url' })
      try {
        return json(200, await leerLista(enlace))
      } catch (e) {
        // El texto de estos errores está escrito para mostrarse tal cual: dicen
        // qué hacer («ponela pública un momento»), no qué falló por dentro.
        return json(422, { error: e instanceof Error ? e.message : 'No se pudo leer la lista' })
      }
    }

    /*
     * Canciones sueltas de Spotify, por sus ids.
     *
     * Es la salida al tope de 100 de la página de una lista, y también a las
     * privadas: seleccionar todo y copiar en Spotify deja un link por canción,
     * y cada uno tiene su propio embed. El cliente manda de a tandas para poder
     * mostrar avance.
     */
    if (url.pathname === '/spotify/canciones' && req.method === 'POST') {
      const body = (await readJson(req)) as { ids?: unknown }
      const ids = body.ids
      if (!Array.isArray(ids) || !ids.length) return json(400, { error: 'Faltan ids' })
      if (ids.length > 100) return json(413, { error: 'Demasiadas canciones en una tanda' })

      const limpios = ids
        .filter((id): id is string => typeof id === 'string')
        .filter((id) => /^[A-Za-z0-9]{22}$/.test(id))
      if (!limpios.length) return json(400, { error: 'Ningún id válido' })

      return json(200, { pistas: await leerCanciones(limpios) })
    }

    /*
     * De nombres de Spotify a canciones de YouTube Music.
     *
     * Se pide por lotes chicos y no la lista entera de una: así el cliente
     * puede mostrar avance real, cancelar a la mitad sin dejar trabajo colgado,
     * y —lo que más importa— el volumen de búsquedas contra YouTube queda
     * repartido en el tiempo en vez de salir todo junto. El anti-bot mira
     * justamente eso (ver `salida.ts`).
     */
    if (url.pathname === '/emparejar' && req.method === 'POST') {
      const body = (await readJson(req)) as { pistas?: unknown }
      const pistas = body.pistas
      if (!Array.isArray(pistas) || !pistas.length) return json(400, { error: 'Faltan pistas' })
      if (pistas.length > 20) return json(413, { error: 'Demasiadas pistas en un lote' })

      const limpias = pistas.map((p) => {
        const pista = p as { titulo?: unknown; artista?: unknown; durationMs?: unknown }
        return {
          titulo: String(pista.titulo ?? '').slice(0, 200),
          artista: String(pista.artista ?? '').slice(0, 200),
          durationMs: Number(pista.durationMs) || 0,
        }
      })
      if (limpias.some((p) => !p.titulo)) return json(400, { error: 'Hay una pista sin título' })

      return json(200, { emparejados: await emparejarLote(limpias) })
    }

    if (url.pathname === '/translate' && req.method === 'POST') {
      const body = (await readJson(req)) as { texts?: unknown; to?: unknown }
      const to = String(body.to ?? '')
      const texts = body.texts
      if (!isLang(to)) return json(400, { error: 'Idioma no permitido' })
      if (!Array.isArray(texts) || texts.some((t) => typeof t !== 'string')) {
        return json(400, { error: 'Falta texts' })
      }
      // Un tope por las dudas: una letra no pasa de un par de cientos de líneas.
      if (texts.length > 400) return json(413, { error: 'Demasiadas líneas' })

      return json(200, { texts: await translate(texts as string[], to) })
    }

    /*
     * Copia solo la carátula, sin tocar el audio.
     *
     * Es para los mensajes anteriores al caché: guardaron una URL del CDN de
     * Google, que responde 429 cada tanto y deja el disco sin imagen. Pasar por
     * /resolve funcionaría pero arrastra la comprobación del audio; acá alcanza
     * con la imagen, y es idempotente.
     */
    if (url.pathname === '/artwork' && req.method === 'POST') {
      const body = (await readJson(req)) as { videoId?: string; url?: string }
      if (!body.videoId || !body.url) return json(400, { error: 'Faltan videoId y url' })
      if (!supabase) return json(500, { error: 'Storage no configurado' })
      return json(200, { path: await cacheImage(supabase, body.url, body.videoId) })
    }

    /*
     * Un cliente con IP residencial aporta el audio que este servidor no pudo
     * bajar — la resolución comunitaria contra la reja anti-bot de datacenter.
     *
     * El cuerpo son los bytes crudos del formato mp4 que el cliente bajó de
     * googlevideo; los metadatos van por query. Nada se guarda sin pasar por
     * `prepararAporte`, que verifica que sea AAC, que dure lo que el catálogo
     * espera, y lo remuxea estricto. Quién lo aportó queda en el log: en una
     * app de conocidos alcanza con poder mirar, pero hay que poder mirar.
     */
    if (url.pathname === '/aportar' && req.method === 'POST') {
      if (!supabase) return json(500, { error: 'Storage no configurado' })
      const videoId = url.searchParams.get('videoId') ?? ''
      if (!/^[\w-]{11}$/.test(videoId)) return json(400, { error: 'videoId inválido' })
      const durationMs = Number(url.searchParams.get('durationMs') ?? 0) || null
      const artworkUrl = url.searchParams.get('artworkUrl') ?? undefined

      const path = `${videoId}.m4a`
      const artworkP = cacheImage(supabase, artworkUrl, videoId)

      /* Idempotente: si otro lo aportó (o el servidor lo resolvió) mientras
         este cliente bajaba, se contesta lo guardado y los bytes se tiran. */
      const { data: existing } = await supabase.storage.from(BUCKET).list('', { search: path })
      if (existing?.some((f) => f.name === path)) {
        return json(200, { path, artworkPath: await artworkP, cached: true, durationMs })
      }

      let crudo: Buffer
      try {
        crudo = await readRaw(req, APORTE_MAX_BYTES)
      } catch {
        return json(413, { error: 'El aporte no puede pasar de 40 MB' })
      }
      if (crudo.length < 100_000) return json(422, { error: 'Demasiado chico para ser una canción' })

      try {
        const listo = await prepararAporte(crudo, durationMs)
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(path, listo.bytes, { contentType: 'audio/mp4', upsert: false })
        if (error && !/already exists|duplicate/i.test(error.message)) {
          return json(500, { error: `No se pudo guardar: ${error.message}` })
        }
        console.log(
          `[aporta] ${videoId} (${listo.bytes.length}b, ${listo.durationMs}ms) por ${await quienEs(req)}`,
        )
        return json(200, {
          path,
          artworkPath: await artworkP,
          cached: false,
          durationMs: listo.durationMs,
        })
      } catch (e) {
        console.warn(`[aporta] ${videoId} rechazado: ${(e as Error).message}`)
        return json(422, { error: 'El audio aportado no pasó la verificación.' })
      }
    }

    if (url.pathname === '/resolve' && req.method === 'POST') {
      const body = await readJson(req) as {
        videoId?: string
        artworkUrl?: string
        durationMs?: number
      }
      const videoId = body.videoId
      if (!videoId) return json(400, { error: 'Falta videoId' })
      if (!supabase) return json(500, { error: 'Storage no configurado' })

      try {
        return json(
          200,
          await resolverCancion(supabase, {
            videoId,
            artworkUrl: body.artworkUrl,
            durationMs: body.durationMs,
          }),
        )
      } catch (e) {
        return json(500, { error: (e as Error).message })
      }
    }

    /*
     * POST /resolve/progreso {videoId} — lo mismo que /resolve, pero **contando
     * en voz alta**.
     *
     * La resolución es un viaje largo (bajar el tema de YouTube, remuxar,
     * subir) que /resolve contesta de una sola vez: el cliente ve una rueda
     * girando y no sabe si carga o si el server se cayó. Acá la respuesta va
     * saliendo por chunks, una línea JSON por vez —`{"pct":0.42}`— y termina
     * con `{"resultado": …}` (lo mismo que devuelve /resolve) o `{"error": …}`.
     *
     * NDJSON y no SSE porque del otro lado hay React Native: en iOS el fetch no
     * deja leer el cuerpo de a poco, pero un XHR con `onprogress` sí ve crecer
     * el texto. Una línea por evento es todo lo que hace falta. Si el cliente
     * no puede con el stream, siempre le queda /resolve.
     */
    if (url.pathname === '/resolve/progreso' && req.method === 'POST') {
      const body = (await readJson(req)) as {
        videoId?: string
        artworkUrl?: string
        durationMs?: number
      }
      const videoId = body.videoId
      if (!videoId) return json(400, { error: 'Falta videoId' })
      if (!supabase) return json(500, { error: 'Storage no configurado' })

      res.writeHead(200, {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache',
        ...cors(req),
      })
      const escribir = (obj: unknown) => res.write(JSON.stringify(obj) + '\n')
      /* El progreso cae si el cliente cortó: escribir en un socket muerto tira. */
      let vivo = true
      req.on('close', () => {
        vivo = false
      })
      try {
        const resultado = await resolverCancion(
          supabase,
          { videoId, artworkUrl: body.artworkUrl, durationMs: body.durationMs },
          (pct) => {
            if (vivo) escribir({ pct })
          },
        )
        if (vivo) escribir({ resultado })
      } catch (e) {
        if (vivo) escribir({ error: (e as Error).message })
      }
      res.end()
      return
    }

    /*
     * POST /propia?nombre=cancion.mp3 — el cuerpo es el archivo crudo.
     *
     * Una canción del disco de quien escucha, a Storage. La primera música de
     * la app que no viene de YouTube: se valida con ffprobe, se leen etiquetas
     * y tapa embebida, y se guarda tal cual (ver `propia.ts`).
     */
    if (url.pathname === '/propia' && req.method === 'POST') {
      if (!supabase) return json(500, { error: 'Storage no configurado' })
      const nombre = url.searchParams.get('nombre') ?? 'audio'
      let bytes: Buffer
      try {
        bytes = await readRaw(req, PROPIA_MAX_BYTES)
      } catch {
        return json(413, { error: 'El archivo es demasiado grande (80 MB como mucho).' })
      }
      if (!bytes.length) return json(400, { error: 'No llegó ningún archivo.' })
      return json(200, await subirPropia(supabase, BUCKET, bytes, nombre))
    }

    return json(404, { error: 'No existe' })
  } catch (e) {
    // El detalle va al log del servidor; al cliente solo lo necesario.
    console.error('[flora-music]', e)
    return json(502, { error: (e as Error).message })
  }
})

/*
 * Se devuelve solo el `path`, nunca una URL.
 *
 * El bucket es privado, así que getPublicUrl daría un enlace que no funciona.
 * Y aunque fuera público, este servicio ve a Supabase por una dirección interna
 * (host.docker.internal en local) que el navegador no puede resolver. El
 * cliente firma la URL con su propia sesión, que además respeta las policies.
 */

/** Tope de una canción propia: un FLAC largo entra; un disco entero, no. */
const PROPIA_MAX_BYTES = 80 * 1024 * 1024

/** El cuerpo crudo, con tope: pasado el límite se corta el pedido y se avisa. */
function readRaw(req: import('node:http').IncomingMessage, max: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (c: Buffer) => {
      total += c.length
      if (total > max) {
        req.destroy()
        reject(new Error('Demasiado grande'))
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function readJson(req: import('node:http').IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}'))
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

server.listen(PORT, () => console.log(`[flora-music] escuchando en :${PORT}`))
