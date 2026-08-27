/**
 * Con qué cara sale el tráfico a YouTube desde el teléfono.
 *
 * Espejo de `server/src/salida.ts` y `desktop/src/salida.ts`, con una
 * diferencia que importa: acá el User-Agent **no es una constante**, es el del
 * WebView que atestigua. Ese es el punto entero del motor de a bordo — BotGuard
 * certifica al navegador que ve, y si después el `/player` y la descarga dicen
 * ser otro cliente, la atestación no ata nada. En el servidor lo fijamos a
 * mano porque no hay ningún navegador de verdad al que copiarle; acá sí lo hay,
 * así que se le pregunta (ver `fijarUA`).
 *
 * Sin proxy ni cookies: el teléfono resuelve anónimo y con su propia IP, que es
 * justamente lo que lo hace valer.
 */

/** Id de cliente de YouTube Music (`WEB_REMIX`) en la cabecera de InnerTube. */
const CLIENTE_MUSICA = '67'

/**
 * Hasta que el motor arranque, el UA de un Safari de iPhone.
 *
 * Es solo para los pedidos que puedan salir antes de que el WebView termine de
 * cargar. Apenas el motor está listo lo reemplaza por el suyo, que es el único
 * que coincide con lo que BotGuard vio.
 */
let ua =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

/** Lo llama el motor cuando el WebView le dice cuál es su `navigator.userAgent`. */
export function fijarUA(nuevo: string): void {
  if (nuevo) ua = nuevo
}

export function uaActual(): string {
  return ua
}

/** Cabeceras de un pedido de media hecho por el reproductor, no por un script. */
export function cabecerasMedia(): Record<string, string> {
  return {
    'User-Agent': ua,
    Origin: 'https://music.youtube.com',
    Referer: 'https://music.youtube.com/',
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
  }
}

/**
 * `fetch` para todo lo que hable con YouTube desde el teléfono.
 *
 * Es el `fetch` **nativo** de React Native, que no tiene CORS: eso es lo que
 * permite que el WebView se dedique solo a atestiguar y a evaluar, y que toda
 * la red salga por acá. Un navegador no podría hacer estas llamadas; una app
 * nativa sí.
 *
 * Lo único que corrige es lo mismo que en las otras dos puntas: youtubei.js
 * manda las llamadas de YouTube Music a `www.youtube.com`, y el cliente real
 * habla con `music.youtube.com`.
 */
export const fetchYt: typeof fetch = (input, init) => {
  const crudo =
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const url = new URL(crudo)
  /* Barato y primero: la mayoría de los pedidos —cada rango de media— no es
     InnerTube y no vale la pena copiarle las cabeceras para nada. */
  if (!url.pathname.startsWith('/youtubei/')) return fetch(input, init)

  const pedido = input instanceof Request ? input : null
  const headers = new Headers(init?.headers ?? pedido?.headers)
  if (headers.get('x-youtube-client-name') !== CLIENTE_MUSICA) return fetch(input, init)

  const destino = new URL(url)
  destino.hostname = 'music.youtube.com'
  headers.set('Origin', destino.origin)
  headers.set('X-Origin', destino.origin)
  headers.set('Referer', `${destino.origin}/`)
  /* En React Native no hay navegador que lo ponga: el shim de youtubei.js para
     esta plataforma declara `server: false` y no estampa User-Agent. */
  headers.set('User-Agent', ua)

  return fetch(destino, {
    ...(init ?? {}),
    method: init?.method ?? pedido?.method ?? 'GET',
    headers,
    body: init?.body ?? undefined,
    redirect: init?.redirect ?? pedido?.redirect ?? 'follow',
  })
}
