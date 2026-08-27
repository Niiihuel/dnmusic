import { BotGuardClient, getChallenge } from 'bgutils-js/botguard'
import { WebPoMinter } from 'bgutils-js/webpo'
import { buildURL, getHeaders } from 'bgutils-js/utils'
import { JSDOM } from 'jsdom'
import { UA_NAVEGADOR, fetchYt } from './salida.js'

/**
 * Generación de PO Tokens (Proof of Origin).
 *
 * YouTube exige uno para servir media más allá de ~1 MB. Obtenerlo implica
 * ejecutar la VM de BotGuard, que espera un DOM de navegador — de ahí jsdom.
 * Esto es lo que obliga a que exista este servicio: nada de esto puede correr
 * en el cliente.
 *
 * El minter se reutiliza mientras dure el integrity token (~12h). Rehacer el
 * challenge en cada canción sería un desperdicio y llamaría la atención.
 */
const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo'
/** Margen antes del vencimiento real, para no usar un token recién muerto. */
const TTL_MARGIN_MS = 5 * 60_000

let domReady = false

function ensureDom() {
  if (domReady) return
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'https://www.youtube.com/',
    referrer: 'https://www.youtube.com/',
    pretendToBeVisual: true,
    /*
     * Sin esto, `navigator.userAgent` dice `…jsdom/28.1.0`.
     *
     * BotGuard mira el navigator: pedirle que certifique que hay un navegador
     * presentándole una cadena que dice «no soy un navegador» es pedirle que
     * diga que no. Va el mismo UA que después usan InnerTube y googlevideo —
     * las tres puntas tienen que ser el mismo cliente (ver `UA_NAVEGADOR`).
     *
     * Dentro de `resources` y no suelto arriba: en jsdom 28 la opción se mudó
     * ahí, y el `@types/jsdom` 27 que tiene este paquete deja pasar la forma
     * vieja sin chistar — typechequea y no hace absolutamente nada. Lo cazó el
     * escritorio, que tiene los tipos al día.
     */
    resources: { userAgent: UA_NAVEGADOR },
  })
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    location: dom.window.location,
    origin: dom.window.origin,
  })
  // navigator es solo-getter en Node 22: hay que redefinir la propiedad.
  Object.defineProperty(globalThis, 'navigator', {
    value: dom.window.navigator,
    configurable: true,
    writable: true,
  })
  domReady = true
}

/**
 * `fetchYt` con el User-Agent de la casa.
 *
 * `getHeaders()` de bgutils-js pone su propio UA —uno de Mac, sin `Chrome/` ni
 * `Safari/`, así de deliberadamente no-navegador— cuando detecta que no corre
 * en uno, y su detección mira si `window` es un getter nativo: con jsdom nunca
 * lo es. Resultado: la atestación salía diciendo ser un Mac raro mientras el
 * /player y la media decían ser Chrome en Windows. Tres caras para un cliente
 * que tiene que ser uno solo. En zuno esto no hace falta porque ahí `window`
 * es de verdad y bgutils no toca el UA; acá hay que ponerlo a mano.
 */
const fetchAtestacion: typeof fetch = (input, init) => {
  /* `set` sobre un Headers, no un spread del objeto: bgutils manda la clave en
     minúscula y `{ ...h, 'User-Agent': x }` deja las dos, que es un UA
     duplicado en vez de uno reemplazado. */
  const headers = new Headers(init?.headers)
  headers.set('user-agent', UA_NAVEGADOR)
  return fetchYt(input, { ...(init ?? {}), headers })
}

type Cached = { minter: WebPoMinter; expiresAt: number }
let cached: Cached | null = null

/** Si la última atestación fue rechazada con buenos modales; ver `getMinter`. */
let atestacionDegradada = false

/**
 * Si los PO tokens que estamos acuñando son de los que Google no reconoce.
 *
 * Lo consulta el resolve para poder decir *cuál* de las dos rejas frenó la
 * canción, en vez de repetir «no sos un bot» ante las dos.
 */
export function tokensSinRespaldo(): boolean {
  return atestacionDegradada
}

async function getMinter(): Promise<WebPoMinter> {
  if (cached && Date.now() < cached.expiresAt) return cached.minter

  ensureDom()

  // Por la misma salida que el resto del tráfico a Google: la atestación
  // tiene que ver la misma IP que después va a usar la media, o no ata nada.
  const challenge = await getChallenge({ requestKey: REQUEST_KEY, fetchFunction: fetchAtestacion })
  const interpreter = challenge.interpreterJavascript?.privateDoNotAccessOrElseSafeScriptWrappedValue
  if (!interpreter) throw new Error('BotGuard no devolvió intérprete')

  // El intérprete se define a sí mismo en el objeto global bajo challenge.globalName.
  new Function(interpreter)()

  const bg = await BotGuardClient.create({
    program: challenge.program,
    globalName: challenge.globalName,
    globalObject: globalThis,
  })

  const webPoSignalOutput: unknown[] = []
  const snapshot = await bg.snapshot({ webPoSignalOutput: webPoSignalOutput as never })

  /* Por el mismo endpoint que el challenge (`Create` sale a jnn-pa por
     defecto). Antes iba a `youtube.com/api/jnn/v1`: las dos mitades del mismo
     trámite contra hosts distintos, cosa que ningún cliente real hace. */
  const res = await fetchAtestacion(buildURL('GenerateIT'), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify([REQUEST_KEY, snapshot]),
  })
  const json = (await res.json()) as [string?, number?, number?, string?]
  const [integrityToken, ttlSecs, , tokenDeReserva] = json
  if (!integrityToken) throw new Error('No se obtuvo integrity token')

  /*
   * El cuarto elemento es el «no te creo» de Google.
   *
   * Cuando no confía en el runtime igual devuelve un integrity token —que
   * acuña PO tokens de aspecto perfectamente normal, y que después rebotan río
   * abajo— y agrega este token de reserva. Su presencia es la diferencia entre
   * «atestado» y «rechazado con buenos modales», y sin mirarla un fallo de
   * atestación llega a los logs disfrazado de `LOGIN_REQUIRED`: idéntico a la
   * reja de IP, con otra causa y otro arreglo. (Lo mira zuno; nosotros
   * perdimos un día de producción por no mirarlo.)
   */
  atestacionDegradada = Boolean(tokenDeReserva)
  if (atestacionDegradada)
    console.warn('[potoken] BotGuard no confió en este runtime: los PO tokens pueden no valer')

  const minter = await WebPoMinter.create({ integrityToken }, webPoSignalOutput as never)
  cached = {
    minter,
    expiresAt: Date.now() + Math.max(60_000, (ttlSecs ?? 43200) * 1000 - TTL_MARGIN_MS),
  }
  return minter
}

/**
 * Token de sesión, atado al visitorData. Va en la config de Innertube.
 */
export async function mintSessionToken(visitorData: string): Promise<string> {
  return (await getMinter()).mintAsWebsafeString(visitorData)
}

/**
 * Token de media, atado al **video ID**.
 *
 * Esta distinción no es cosmética: con el token de sesión en la URL de media,
 * googlevideo sirve exactamente 1 MB y después responde 403. Tiene que estar
 * atado al id del video que se está pidiendo.
 */
export async function mintVideoToken(videoId: string): Promise<string> {
  return (await getMinter()).mintAsWebsafeString(videoId)
}
