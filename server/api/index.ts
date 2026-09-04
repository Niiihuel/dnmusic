import type { IncomingMessage, ServerResponse } from 'node:http'
import { RUTAS_LIVIANAS, manejarLiviana } from '../src/livianas.js'
import { comoRequest, volcar } from '../src/puente.js'

/**
 * La punta de Vercel del servicio de música.
 *
 * Sirve **solo** las rutas de `src/livianas.ts` — las que no hablan con
 * YouTube. Todo lo demás (`/search`, `/home`, `/album`, `/resolve`, `/peaks`,
 * `/aportar`, `/propia`, `/push`) sigue en el contenedor de Railway, y el
 * cliente sabe a cuál de los dos le habla: ver `EXPO_PUBLIC_MUSIC_LIVIANO` en
 * `src/services/music.ts`. El porqué del corte está escrito en `livianas.ts`.
 *
 * Es **una** función para las cinco rutas y no una por ruta, así comparten
 * instancia de Fluid y con ella la caché de traducción y el cliente de
 * Supabase. Una función por ruta sería un proceso por ruta.
 *
 * Importa el fuente y no el compilado a propósito: `dist/` está gitignoreado,
 * así que no viaja en el despliegue ni existe cuando el typecheck de la raíz
 * mira este archivo. Vercel compila el TypeScript él mismo.
 *
 * La firma es la de Node y no la web —que sería la natural para devolver una
 * `Response`— porque es la que Vercel usa acá: probado contra el despliegue,
 * llega un `IncomingMessage` con `req.url` **relativo**. De ahí que se arme la
 * URL contra el `host`, y que la conversión vaya por `puente.ts`, el mismo que
 * usa `index.ts` para exactamente lo mismo.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', `https://${req.headers.host ?? 'localhost'}`)

  /*
   * Qué ruta pidió la app.
   *
   * Viene en un parámetro que pone el rewrite de `vercel.json`, y no de mirar
   * el path, porque el path no alcanza: esto es **una sola** función sin
   * segmento dinámico, y a `/spotify/canciones` hay que poder distinguirla de
   * `/spotify`. Un `api/[...ruta].ts` sería lo natural, pero acá el catch-all
   * matchea un solo segmento y `/spotify/canciones` daba 404 de plataforma sin
   * llegar nunca a este archivo — está probado contra el despliegue.
   *
   * El fallback al path es para pegarle directo a `/api/img`, que es lo que
   * sirve para probar sin depender del rewrite.
   */
  const ruta = url.searchParams.get('ruta') ?? url.pathname.replace(/^\/api(?=\/|$)/, '') ?? '/'

  /* Que el parámetro del ruteo no se le cuele a los handlers, que leen los
     suyos de la misma query. */
  url.searchParams.delete('ruta')

  if (RUTAS_LIVIANAS.has(ruta)) {
    const respuesta = await manejarLiviana(await comoRequest(req, url), ruta)
    if (respuesta) return volcar(res, respuesta)
  }

  /*
   * Una ruta que este despliegue no atiende. El 404 dice dónde vive para que un
   * cliente mal configurado se diagnostique solo en vez de parecer caído.
   */
  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(
    JSON.stringify({
      error: 'Esta ruta no vive acá',
      ruta,
      detalle: 'Acá solo viven las rutas livianas; el resto sigue en el servicio de Railway.',
    }),
  )
}
