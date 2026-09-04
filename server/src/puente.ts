import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * El puente entre `node:http` y `Request`/`Response`.
 *
 * `livianas.ts` está escrito contra la interfaz web porque es la que se lee
 * mejor y la que no ata el router a un servidor concreto. Los dos lugares donde
 * corre, en cambio, hablan `node:http`: el `createServer` de `index.ts` y —esto
 * sorprende— también la función de Vercel, que invoca con la firma de Node
 * (`req.url` llega **relativo**, y el parámetro del catch-all viene pegado en la
 * query). Estas dos funciones son la traducción, y son las mismas para ambos.
 */

/**
 * El pedido de Node como `Request`.
 *
 * El cuerpo se junta entero antes de armarlo, a propósito. Sería más elegante
 * pasarlo en streaming, pero un `Request` con cuerpo de stream obliga a
 * `duplex: 'half'` y no todos los runtimes lo tratan igual; los cuerpos que
 * pasan por acá son un JSON de unos pocos kB —nunca el audio, que va por
 * `/aportar` y no pasa por este camino—, así que juntarlo no cuesta nada.
 */
export async function comoRequest(req: IncomingMessage, url: URL): Promise<Request> {
  const cabeceras = new Headers()
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') cabeceras.set(k, v)
    else if (Array.isArray(v)) for (const uno of v) cabeceras.append(k, uno)
  }

  const metodo = req.method ?? 'GET'
  const sinCuerpo = metodo === 'GET' || metodo === 'HEAD' || metodo === 'OPTIONS'
  if (sinCuerpo) return new Request(url, { method: metodo, headers: cabeceras })

  const trozos: Buffer[] = []
  for await (const trozo of req) trozos.push(trozo as Buffer)
  return new Request(url, { method: metodo, headers: cabeceras, body: Buffer.concat(trozos) })
}

/** Vuelca una `Response` en la respuesta de Node, sin juntarla en memoria. */
export function volcar(res: ServerResponse, r: Response): void {
  const cabeceras: Record<string, string> = {}
  r.headers.forEach((valor, clave) => {
    cabeceras[clave] = valor
  })
  res.writeHead(r.status, cabeceras)
  if (!r.body) {
    res.end()
    return
  }
  Readable.fromWeb(r.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res)
}
