import type { IncomingMessage, ServerResponse } from 'node:http'
import { manejador } from '../src/index.js'

/**
 * El resto del servicio de música, en Vercel.
 *
 * Al lado de `api/index.ts`, que sirve las cinco rutas livianas. Acá vive todo
 * lo demás —búsqueda, portada, álbumes, `/resolve`, `/peaks`, `/aportar`,
 * `/propia`, `/push`— y no hay una línea de lógica propia: importa el
 * manejador de `src/index.ts`, que es el mismo que corre en el contenedor.
 * Puede hacerlo porque Vercel invoca con la firma de Node, que es exactamente
 * la que toma `createServer`.
 *
 * Son dos funciones y no una porque los bundles no se parecen: acá entran
 * youtubei.js y los binarios estáticos de ffmpeg —unos ciento sesenta megas—,
 * y `/img`, que es la ruta de más volumen de la app, no tiene por qué pagar
 * ese arranque en frío. Del otro lado además hay CDN.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  /*
   * La ruta que pidió la app, que el rewrite de `vercel.json` deja en un
   * parámetro. Mismo criterio que `api/index.ts`, y por el mismo motivo: un
   * catch-all matchea un solo segmento y `/resolve/progreso` daría un 404 de
   * plataforma sin llegar hasta acá.
   */
  const url = new URL(req.url ?? '/', `https://${req.headers.host ?? 'localhost'}`)
  const ruta = url.searchParams.get('ruta') ?? url.pathname.replace(/^\/api\/todo(?=\/|$)/, '')

  /* Que el parámetro del ruteo no se le cuele a los handlers, que leen los
     suyos de la misma query. */
  url.searchParams.delete('ruta')

  /* El manejador arma su propia URL con `req.url`, así que alcanza con
     devolvérselo apuntando a donde la app creía estar pidiendo. */
  req.url = `${ruta || '/'}${url.search}`

  return manejador(req, res)
}
