import { ProxyAgent, type Dispatcher } from 'undici'

/**
 * Por dónde sale el tráfico hacia YouTube.
 *
 * El anti-bot de YouTube es una reja de **reputación de IP**: a la IP de un
 * datacenter (Railway) le contesta `LOGIN_REQUIRED — Sign in to confirm
 * you're not a bot` a todos los clientes, con o sin PO token — está medido y
 * documentado en `youtube.ts`. Las apps que no lo sufren (zuno, cualquier
 * reproductor de escritorio) no lo esquivan con código: sus pedidos salen de
 * la IP residencial de quien las usa.
 *
 * Este módulo es la versión servidor de esa idea: con `YT_PROXY_URL` puesta
 * (un proxy residencial/ISP estático, `http://user:pass@host:puerto`), todo
 * lo que habla con Google —InnerTube, BotGuard y googlevideo— sale por ahí y
 * el resolve ve el mundo desde una IP de hogar. Sin la variable, sale directo,
 * que es lo de siempre.
 *
 * Va por acá y no por `HTTP_PROXY` global a propósito: Storage, el push de
 * Expo y la traducción no tienen por qué gastar el ancho de banda del proxy —
 * la única reja que hay que cruzar es la de YouTube.
 */
const YT_PROXY_URL = process.env.YT_PROXY_URL

const dispatcher: Dispatcher | null = YT_PROXY_URL ? new ProxyAgent(YT_PROXY_URL) : null

if (dispatcher) console.log('[salida] tráfico a YouTube vía proxy')

/** `fetch` para todo lo que hable con YouTube/Google. Directo si no hay proxy. */
export const fetchYt: typeof fetch = (input, init) =>
  dispatcher
    ? fetch(input, { ...(init ?? {}), dispatcher } as RequestInit)
    : fetch(input, init)
