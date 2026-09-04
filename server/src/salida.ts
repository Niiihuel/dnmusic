import { createHash } from 'node:crypto'
import { ProxyAgent, type Dispatcher } from 'undici'

/**
 * Por dónde sale el tráfico hacia YouTube, y con qué cara.
 *
 * El anti-bot de YouTube es una reja de **reputación de IP**: a la IP de un
 * datacenter le contesta `LOGIN_REQUIRED — Sign in to confirm you're not a
 * bot` a todos los clientes, con o sin PO token — está medido y documentado en
 * `youtube.ts`. Medido en Railway primero y en Vercel después, con los siete
 * clientes rebotando en las dos: no es de un proveedor, es del vecindario. Las apps que no lo sufren (zuno, cualquier
 * reproductor de escritorio) no lo esquivan con código: sus pedidos salen de
 * la IP residencial de quien las usa.
 *
 * Este módulo hace las dos cosas que sí están de nuestro lado:
 *
 *   1. **Por dónde.** Con `YT_PROXY_URL` puesta (un proxy residencial/ISP
 *      estático, `http://user:pass@host:puerto`), todo lo que habla con
 *      Google —InnerTube, BotGuard y googlevideo— sale por ahí y el resolve ve
 *      el mundo desde una IP de hogar. Sin la variable, sale directo.
 *   2. **Con qué cara.** Un pedido de YouTube Music que llega a
 *      `www.youtube.com` con `Origin: https://www.youtube.com` y la firma
 *      atada a ese origen no se parece a ningún cliente real: el de verdad
 *      habla con `music.youtube.com` de punta a punta. youtubei.js manda todo
 *      a www porque le alcanza para una IP limpia; a una IP marcada, cada
 *      diferencia cuenta. Acá se corrige (ver `comoClienteDeMusica`).
 *
 * Va por acá y no por `HTTP_PROXY` global a propósito: Storage, el push de
 * Expo y la traducción no tienen por qué gastar el ancho de banda del proxy —
 * la única reja que hay que cruzar es la de YouTube.
 */
const YT_PROXY_URL = process.env.YT_PROXY_URL

const dispatcher: Dispatcher | null = YT_PROXY_URL ? new ProxyAgent(YT_PROXY_URL) : null

if (dispatcher) console.log('[salida] tráfico a YouTube vía proxy')

/**
 * Un único navegador para todo el proceso.
 *
 * youtubei.js sortea un User-Agent **por sesión** de una lista que mezcla
 * Chrome, Edge, Opera y Safari, y BotGuard corría con el de jsdom
 * (`…jsdom/28.1.0`, que no es ningún navegador). O sea: la atestación decía
 * ser una cosa, el /player otra y la media una tercera. Un cliente real es
 * siempre el mismo, y ese es el punto entero de la atestación — de ahí que
 * zuno use el UA del WebView en las tres puntas.
 *
 * Fijo y no sorteado: la sesión de un reproductor de escritorio no cambia de
 * navegador entre canciones. Windows + Chrome porque es lo que dice el
 * contexto que arma youtubei.js cuando lo genera local, y que digan lo mismo
 * es justamente lo que se busca.
 */
export const UA_NAVEGADOR =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

/** Id de cliente de YouTube Music (`WEB_REMIX`) en la cabecera de InnerTube. */
const CLIENTE_MUSICA = '67'

/**
 * Deja un pedido de InnerTube con la pinta del cliente que dice ser.
 *
 * Dos arreglos, los dos tomados de zuno:
 *
 *   · **El host.** youtubei.js manda *todo* a `www.youtube.com/youtubei/`,
 *     incluido `WEB_REMIX`. El cliente real de YouTube Music habla con
 *     `music.youtube.com`, y el `Origin`/`Referer` que van con él tienen que
 *     ser los del host al que efectivamente se va.
 *   · **La firma.** Con una sesión iniciada, youtubei.js arma el
 *     `SAPISIDHASH` contra `https://www.youtube.com` — está escrito a mano en
 *     su código. El hash va **atado al origen**, así que mover el host sin
 *     rehacerlo deja una firma que no vale para donde se manda: YouTube
 *     contesta 200 con la versión deslogueada, que es peor que un error.
 *
 * Devuelve `null` si no hay nada que tocar: cualquier cosa que no sea una
 * llamada de InnerTube —la media de googlevideo, el challenge de BotGuard—
 * pasa exactamente como antes.
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

/** `fetch` para todo lo que hable con YouTube/Google. Directo si no hay proxy. */
export const fetchYt: typeof fetch = (input, init) => {
  const salida = (entrada: RequestInfo | URL, opciones?: RequestInit) =>
    dispatcher
      ? fetch(entrada, { ...(opciones ?? {}), dispatcher } as RequestInit)
      : fetch(entrada, opciones)

  const crudo =
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const url = new URL(crudo)
  /* Barato y primero: la enorme mayoría de los pedidos —cada rango de media—
     no es InnerTube, y no vale la pena copiarles las cabeceras para nada. */
  if (!url.pathname.startsWith('/youtubei/')) return salida(input, init)

  /* youtubei.js llama `fetch(request, { body, headers, redirect, credentials })`:
     lo de `init` manda sobre lo del `Request`, así que es lo que hay que mirar
     y lo que hay que reenviar. */
  const pedido = input instanceof Request ? input : null
  const headers = new Headers(init?.headers ?? pedido?.headers)
  const destino = comoClienteDeMusica(url, headers)
  if (!destino) return salida(input, init)

  return salida(destino, {
    ...(init ?? {}),
    method: init?.method ?? pedido?.method ?? 'GET',
    headers,
    body: init?.body ?? undefined,
    redirect: init?.redirect ?? pedido?.redirect ?? 'follow',
  })
}
