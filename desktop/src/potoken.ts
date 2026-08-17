import { BotGuardClient, getChallenge } from 'bgutils-js/botguard'
import { WebPoMinter } from 'bgutils-js/webpo'
import { buildURL, getHeaders } from 'bgutils-js/utils'
import { JSDOM } from 'jsdom'

/**
 * Generación de PO Tokens (Proof of Origin) — espejo de `server/src/potoken.ts`.
 *
 * YouTube exige uno para servir media más allá de ~1 MB, **también desde una
 * IP residencial**: el primer intento del resolutor de a bordo pedía las URLs
 * de los clientes móviles a secas y googlevideo cortaba con 403 en el segundo
 * rango — exactamente el síntoma documentado en el servidor. Así que esta
 * punta necesita la misma maquinaria completa, no una versión light.
 *
 * Es una copia y no un paquete compartido a propósito: el servidor es ESM con
 * su salida por proxy (`fetchYt`) y esto es CommonJS con el fetch pelado del
 * Electron. Si tocás uno, mirá el otro.
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

type Cached = { minter: WebPoMinter; expiresAt: number }
let cached: Cached | null = null

async function getMinter(): Promise<WebPoMinter> {
  if (cached && Date.now() < cached.expiresAt) return cached.minter

  ensureDom()

  const challenge = await getChallenge({ requestKey: REQUEST_KEY, fetchFunction: fetch })
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

  const res = await fetch(buildURL('GenerateIT', true), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify([REQUEST_KEY, snapshot]),
  })
  const json = (await res.json()) as [string, number]
  const [integrityToken, ttlSecs] = json
  if (!integrityToken) throw new Error('No se obtuvo integrity token')

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
