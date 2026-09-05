import { createHash } from 'node:crypto'

/**
 * Con qué cara sale el tráfico a YouTube desde esta compu — espejo de
 * `server/src/salida.ts`, sin la mitad del proxy.
 *
 * Allá el módulo hace dos cosas: por dónde sale (un proxy residencial, para
 * escapar de la IP de datacenter) y con qué cara sale. Acá la primera no tiene
 * sentido —el resolutor de a bordo existe justamente porque *esta* IP es la
 * buena— pero la segunda vale igual: un pedido de YouTube Music que llega a
 * `www.youtube.com` con el origen de www no se parece a ningún cliente real,
 * y el que baja los bytes no debería tener cara de script.
 *
 * Es una copia y no un paquete compartido, por lo mismo que `potoken.ts`: el
 * servidor es ESM y esto es CommonJS. Si tocás uno, mirá el otro.
 */

/**
 * Un único navegador para todo el proceso: la atestación de BotGuard, las
 * llamadas de InnerTube y la media tienen que ser el mismo cliente. Ver el
 * comentario largo en el servidor.
 */
export const UA_NAVEGADOR =
  process.env.DNMUSIC_YT_USER_AGENT ??
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

/** Id de cliente de YouTube Music (`WEB_REMIX`) en la cabecera de InnerTube. */
const CLIENTE_MUSICA = '67'

/** Cabeceras de un pedido de media hecho por el reproductor, no por un script. */
export const CABECERAS_MEDIA: Record<string, string> = {
  'User-Agent': UA_NAVEGADOR,
  Origin: 'https://music.youtube.com',
  Referer: 'https://music.youtube.com/',
  Accept: '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'cross-site',
}

/**
 * Manda las llamadas de YouTube Music a `music.youtube.com` con el origen y la
 * firma de ese host. youtubei.js manda todo a www y firma el `SAPISIDHASH`
 * contra www —lo tiene escrito a mano—, y el hash va atado al origen: mover el
 * host sin rehacerlo deja una firma que no vale para donde se manda.
 *
 * `null` si no hay nada que tocar; todo lo demás pasa como antes.
 */
function comoClienteDeMusica(url: URL, headers: Headers): URL | null {
  if (!url.pathname.startsWith('/youtubei/')) return null
  if (headers.get('x-youtube-client-name') !== CLIENTE_MUSICA) return null

  const destino = new URL(url)
  destino.hostname = 'music.youtube.com'
  const origen = destino.origin

  headers.set('Origin', origen)
  headers.set('X-Origin', origen)
  headers.set('Referer', `${origen}/`)

  const cookie = headers.get('Cookie')
  const sapisid = cookie ? leerCookie(cookie, 'SAPISID') : null
  if (sapisid) {
    const ahora = Math.floor(Date.now() / 1000)
    const hash = createHash('sha1').update(`${ahora} ${sapisid} ${origen}`).digest('hex')
    headers.set('Authorization', `SAPISIDHASH ${ahora}_${hash}`)
    headers.set('X-Goog-Request-Time', String(ahora))
  }

  return destino
}

/** El `SAPISID` de una cabecera `cookie`, con los nombres alternativos de Google. */
function leerCookie(cookie: string, nombre: string): string | null {
  for (const parte of cookie.split(';')) {
    const [clave, ...valor] = parte.trim().split('=')
    if (clave === nombre) return valor.join('=')
  }
  if (nombre === 'SAPISID') {
    return leerCookie(cookie, '__Secure-1PAPISID') ?? leerCookie(cookie, '__Secure-3PAPISID')
  }
  return null
}

/** `fetch` para todo lo que hable con YouTube/Google desde esta compu. */
export const fetchYt: typeof fetch = (input, init) => {
  const crudo =
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const url = new URL(crudo)
  /* Barato y primero: la mayoría de los pedidos —cada rango de media— no es
     InnerTube, y no vale la pena copiarles las cabeceras para nada. */
  if (!url.pathname.startsWith('/youtubei/')) return fetch(input, init)

  /* youtubei.js llama `fetch(request, { body, headers, redirect, credentials })`:
     lo de `init` manda sobre lo del `Request`. */
  const pedido = input instanceof Request ? input : null
  const headers = new Headers(init?.headers ?? pedido?.headers)
  const destino = comoClienteDeMusica(url, headers)
  if (!destino) return fetch(input, init)

  return fetch(destino, {
    ...(init ?? {}),
    method: init?.method ?? pedido?.method ?? 'GET',
    headers,
    body: init?.body ?? undefined,
    redirect: init?.redirect ?? pedido?.redirect ?? 'follow',
  })
}
