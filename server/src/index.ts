import { createServer } from 'node:http'
import { createClient } from '@supabase/supabase-js'
import {
  getAlbum,
  getArtist,
  getHome,
  getPlaylistInfo,
  resolveAudio,
  peaks,
  search,
  searchArtists,
} from './youtube.js'
import { isLang, translate } from './translate.js'
import { cacheImage } from './artwork.js'

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
 *
 * El audio se guarda en Supabase Storage y la app lo reproduce desde ahí. Así el
 * contacto con YouTube ocurre una vez por canción y no en cada reproducción: es
 * más rápido para quien escucha, y las flores ya enviadas siguen sonando aunque
 * YouTube rompa esto mañana.
 */

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

    if (url.pathname === '/health') return json(200, { ok: true })

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
      const nombre = `${videoId}.m4a`
      const { data: firmada, error: e } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(nombre, 300)
      if (e || !firmada?.signedUrl) return json(404, { error: 'Esa canción no está guardada' })

      return json(200, await peaks(firmada.signedUrl, buckets))
    }

    if (url.pathname === '/img' && req.method === 'GET') {
      const u = url.searchParams.get('u')
      if (!u) return json(400, { error: 'Falta el parámetro u' })
      return proxyImage(res, u, req)
    }

    if (url.pathname === '/home' && req.method === 'GET') {
      return json(200, { sections: await getHome() })
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

    if (url.pathname === '/resolve' && req.method === 'POST') {
      const body = await readJson(req) as { videoId?: string; artworkUrl?: string }
      const videoId = body.videoId
      if (!videoId) return json(400, { error: 'Falta videoId' })
      if (!supabase) return json(500, { error: 'Storage no configurado' })

      /*
       * El nombre canónico es `.m4a`.
       *
       * Lo guardado antes eran `.webm` (Opus): sonaba en el navegador y en el
       * iPhone no sonaba nada, porque iOS no decodifica ese contenedor. Se
       * busca primero el m4a; si solo existe el webm viejo, se vuelve a
       * resolver para reemplazarlo por uno que suene en los dos lados.
       */
      const path = `${videoId}.m4a`

      /*
       * La carátula la manda el cliente, que ya la tiene de la búsqueda.
       *
       * Podría sacarse de `getBasicInfo`, pero eso es un viaje a YouTube — y
       * justamente el camino rápido de acá abajo existe para no hacerlo cuando
       * la canción ya está guardada.
       */
      const artworkPath = await cacheImage(supabase, body.artworkUrl, videoId)

      // Si ya se resolvió antes, no se vuelve a tocar YouTube.
      const { data: existing } = await supabase.storage.from(BUCKET).list('', { search: path })
      if (existing?.some((f) => f.name === path)) {
        return json(200, { path, artworkPath, cached: true })
      }

      const audio = await resolveAudio(videoId)
      // Si YouTube no ofreciera mp4 para este video, se guarda lo que haya con
      // su extensión real: al menos suena en la web.
      const destino = `${videoId}.${audio.ext}`
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(destino, audio.bytes, { contentType: audio.mimeType, upsert: true })
      if (error) return json(500, { error: `No se pudo guardar: ${error.message}` })

      return json(200, {
        // Se devuelve lo que realmente se guardó, no el nombre que se buscó.
        path: destino,
        artworkPath,
        cached: false,
        title: audio.title,
        artist: audio.artist,
        durationMs: audio.durationMs,
        bitrate: audio.bitrate,
        bytes: audio.bytes.length,
      })
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
