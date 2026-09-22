import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * La tarjeta de un link compartido: lo que se ve **antes** de entrar.
 *
 * Existe porque el sitio es una sola `index.html` con ruteo en cliente
 * (`web.output: "single"`, y el catch-all de `vercel.json`), y un SPA no puede
 * tener meta tags distintos por URL: el crawler de WhatsApp no ejecuta
 * JavaScript, lee el HTML que llega y se va. Sin esto, un link de una canción
 * se previsualiza igual que la portada de la app — el ícono y «dnmusic»— y
 * quien lo recibe no tiene forma de saber qué le mandaron.
 *
 * Sirve el shell, el iframe, el PNG social y oEmbed con la misma lectura
 * pública. El renderizador de imágenes se carga sólo para `modo=imagen`.
 *
 *   `/cancion/<id>`        → la misma `index.html` de siempre, con la tarjeta
 *                            puesta en el head. La app arranca igual y
 *                            `app/cancion/[id]` dibuja lo suyo.
 *   `/embed/cancion/<id>`  → una tarjeta suelta de unos pocos KB, para meter en
 *                            un `<iframe>` ajeno. No trae el bundle: 5 MB de
 *                            app adentro del iframe de un blog no es un embed.
 *
 * La firma es la de Node y no la web porque es la que Vercel usa en este
 * proyecto —igual que en `server/api/index.ts`, donde está medido—: llega un
 * `IncomingMessage` con `req.url` **relativo**, de ahí que la URL se arme
 * contra el `host`.
 */

const SITIO = (process.env.SITE_URL ?? 'https://dnmusic-production-c3f4.up.railway.app').replace(/\/$/, '')
const TITULO = 'dnmusic'
const DESCRIPCION =
  'Escuchá tu música, armá tus listas y ponete en Jam: la misma canción, al mismo tiempo, con quien quieras.'
/** Los mismos cuatro de `src/lib/compartir.ts`. Si cambia allá, cambia acá. */
const COMPARTIBLES = new Set(['cancion', 'lista', 'jam', 'perfil'])
/** Lo que `scripts/inject-pwa.mjs` deja marcado para que esto lo reemplace. */
const ABRE = '<!-- dany:tarjeta -->'
const CIERRA = '<!-- /dany:tarjeta -->'

type Tarjeta = { titulo: string; subtitulo: string; tapa: string | null }

/**
 * El shell del SPA, pedido una vez por instancia.
 *
 * Se **pide** en vez de leerse del disco a propósito: `dist/index.html` lo
 * escribe el build, y hacer que el empaquetado de la función dependa de un
 * archivo que otro paso del mismo build genera es una carrera que se pierde en
 * silencio —la función saldría con un shell viejo, o sin ninguno—. Pedirlo por
 * HTTP siempre devuelve el de **este** deploy. `/index.html` es un archivo
 * real, así que lo sirve el CDN sin volver a pasar por acá.
 */
let shellCacheado: string | null = null

async function shell(origen: string): Promise<string> {
  if (shellCacheado) return shellCacheado
  if (process.env.WEB_DIST_DIR) {
    shellCacheado = await readFile(join(process.env.WEB_DIST_DIR, 'index.html'), 'utf8')
    return shellCacheado
  }
  const res = await fetch(`${origen}/index.html`)
  if (!res.ok) throw new Error(`shell ${res.status}`)
  shellCacheado = await res.text()
  return shellCacheado
}

/**
 * La tarjeta, del único RPC que contesta sin sesión.
 *
 * Ver `supabase/migrations/20260920000000_tarjetas_de_enlace.sql`: es
 * `security definer`, tiene su excepción en `check_app_access` y devuelve cinco
 * campos de presentación de cosas que ya eran compartibles. Acá se usa la anon
 * key, la misma que viaja embebida en el bundle: esta función no tiene ni
 * necesita la service_role.
 */
async function pedirTarjeta(que: string, id: string): Promise<Tarjeta | null> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  const res = await fetch(`${url}/rest/v1/rpc/tarjeta_enlace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({ p_tipo: que, p_id: id }),
  })
  if (!res.ok) return null
  const fila = (await res.json()) as Record<string, unknown> | null
  if (!fila || typeof fila.titulo !== 'string') return null
  return {
    titulo: fila.titulo,
    subtitulo: typeof fila.subtitulo === 'string' ? fila.subtitulo : '',
    tapa: tapaAbsoluta(fila.tapa, url),
  }
}

/**
 * La tapa viene como `bucket/camino` o como una URL absoluta del CDN. Se
 * compone acá y no en la base porque local, preview y producción no comparten
 * el origen de Storage. Es la misma función que `services/compartidos`, del
 * otro lado del cable.
 */
function tapaAbsoluta(valor: unknown, origen: string): string | null {
  if (typeof valor !== 'string' || !valor) return null
  if (/^https:\/\//i.test(valor)) return valor
  return `${origen}/storage/v1/object/public/${valor}`
}

/** Nada de lo que sale de la base entra en el HTML sin pasar por acá. */
function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function metaDeTarjeta(t: Tarjeta | null, que: string, id: string): string {
  const titulo = t ? t.titulo : TITULO
  const bajada = t
    ? [t.subtitulo, que === 'cancion' ? 'Escuchalo en dnmusic' : 'Abrilo en dnmusic']
        .filter(Boolean)
        .join(' · ')
    : DESCRIPCION
  const imagen = t ? `${SITIO}/api/tarjeta?modo=imagen&que=${que}&id=${encodeURIComponent(id)}` : `${SITIO}/icons/icon-512.png`
  const canonica = `${SITIO}/${que}/${encodeURIComponent(id)}`
  /* Sin tarjeta el título es el de siempre y no «dnmusic — dnmusic»: acá caen
     también las rutas de adentro que tienen la misma forma que un link
     compartido —`/lista/nueva`, `/jam/opciones`— cuando alguien las recarga. */
  return `${ABRE}
    <title>${t ? `${escapar(titulo)} — ${TITULO}` : TITULO}</title>
    <meta name="description" content="${escapar(bajada)}" />
    <meta property="og:type" content="${que === 'cancion' ? 'music.song' : 'website'}" />
    <meta property="og:site_name" content="${TITULO}" />
    <meta property="og:title" content="${escapar(titulo)}" />
    <meta property="og:description" content="${escapar(bajada)}" />
    <meta property="og:url" content="${escapar(canonica)}" />
    <meta property="og:image" content="${escapar(imagen)}" />
    <meta property="og:image:alt" content="${escapar(t ? `${titulo} · ${t.subtitulo}` : TITULO)}" />
    ${t ? '<meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" /><meta property="og:image:type" content="image/png" />' : ''}
    ${t ? `<link rel="alternate" type="application/json+oembed" href="${SITIO}/api/tarjeta?modo=oembed&amp;que=${que}&amp;id=${encodeURIComponent(id)}" title="${escapar(titulo)}" />` : ''}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapar(titulo)}" />
    <meta name="twitter:description" content="${escapar(bajada)}" />
    <meta name="twitter:image" content="${escapar(imagen)}" />
    <link rel="canonical" href="${escapar(canonica)}" />
    ${CIERRA}`
}

/**
 * La tarjeta suelta del `<iframe>`.
 *
 * Hecha a mano y no con el sistema de componentes de la app por una razón que
 * no tiene vuelta: eso es React Native Web y viaja con el bundle. Acá el punto
 * es **no** traer el bundle. Así que los mismos tokens de `docs/DESIGN.md`
 * escritos a mano: `#121212` de fondo, `#181818` la superficie, blanco el
 * acento, y las superficies separadas por luminancia y no por bordes.
 *
 * El botón no reproduce: lleva a la app. Un embed que le sirviera el audio a
 * cualquiera convertiría esto en un servicio público de música, que es
 * exactamente lo que no es.
 */
function paginaEmbed(t: Tarjeta | null, que: string, id: string): string {
  const destino = `${SITIO}/${que}/${encodeURIComponent(id)}`
  const titulo = t ? escapar(t.titulo) : 'Esto ya no está disponible'
  const bajada = t ? escapar(t.subtitulo) : 'El link puede haber quedado viejo.'
  const tapa = t?.tapa ? escapar(t.tapa) : ''
  return `<!DOCTYPE html>
<html lang="es-AR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${metaDeTarjeta(t, que, id)}
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #121212; color: #fff;
         font: 15px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  a.tarjeta { display: flex; align-items: center; gap: 14px; padding: 12px;
              background: #181818; border-radius: 16px; text-decoration: none; color: inherit; }
  a.tarjeta:hover { background: #1F1F1F; }
  .tapa { width: 104px; height: 104px; border-radius: 8px; flex: none;
          background: #1F1F1F; object-fit: cover; }
  .texto { min-width: 0; flex: 1; }
  .titulo { font-weight: 600; font-size: 17px; margin: 0 0 2px;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sub { color: #B3B3B3; font-size: 13px; margin: 0;
         overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .marca { color: #B3B3B3; font-size: 11px; letter-spacing: 1.2px;
           text-transform: uppercase; margin: 8px 0 0; }
  .boton { flex: none; background: #fff; color: #121212; font-weight: 600; font-size: 14px;
           padding: 10px 18px; border-radius: 999px; }
</style>
</head>
<body>
<a class="tarjeta" href="${escapar(destino)}" target="_blank" rel="noopener">
  ${tapa ? `<img class="tapa" src="${tapa}" alt="Portada" />` : '<div class="tapa" aria-hidden="true"></div>'}
  <div class="texto">
    <p class="titulo">${titulo}</p>
    <p class="sub">${bajada}</p>
    <p class="marca">dnmusic</p>
  </div>
  <span class="boton">Abrir</span>
</a>
</body>
</html>`
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const origen = `https://${req.headers.host ?? 'localhost'}`
  const url = new URL(req.url ?? '/', origen)
  const que = url.searchParams.get('que') ?? ''
  const id = url.searchParams.get('id') ?? ''
  const modo = url.searchParams.get('modo') ?? ''
  const embed = modo === 'embed'

  if (!COMPARTIBLES.has(que) || !id || id.length > 200) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('No es un link de dnmusic.')
    return
  }

  let tarjeta: Tarjeta | null = null
  try {
    tarjeta = await pedirTarjeta(que, id)
  } catch {
    /* La base puede estar caída y el link tiene que abrir igual: sin tarjeta se
       sirve la app con los meta de siempre, que es exactamente lo que pasaba
       antes de que esto existiera. */
  }

  /*
   * Una tarjeta que ya se armó se puede reusar un rato, pero no para siempre:
   * una lista que vuelve a privada tiene que dejar de previsualizarse. El CDN
   * sólo conserva cinco minutos, sin servir versiones
   * vencidas. Un fallo o una tarjeta aún sin publicar no se cachean.
   */
  res.setHeader('Cache-Control', tarjeta ? 'public, max-age=0, s-maxage=300' : 'no-store')
  res.setHeader('Content-Type', 'text/html; charset=utf-8')

  if (modo === 'imagen' || modo === 'oembed') {
    if (!tarjeta) {
      res.statusCode = 404
      res.end('Tarjeta no disponible.')
      return
    }
    if (modo === 'oembed') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ version: '1.0', type: 'rich', title: tarjeta.titulo,
        author_name: tarjeta.subtitulo, provider_name: TITULO, provider_url: SITIO,
        thumbnail_url: `${SITIO}/api/tarjeta?modo=imagen&que=${que}&id=${encodeURIComponent(id)}`,
        thumbnail_width: 1200, thumbnail_height: 630, width: 560, height: 152,
        html: `<iframe src="${SITIO}/embed/${que}/${encodeURIComponent(id)}" width="560" height="152" frameborder="0" loading="lazy" title="${escapar(tarjeta.titulo)}"></iframe>`,
      }))
      return
    }
    try {
      const { crearImagenTarjeta } = await import('../src/server/imagenTarjeta')
      const imagen = await crearImagenTarjeta(tarjeta, que)
      res.setHeader('Content-Type', 'image/png')
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.end(imagen)
    } catch {
      res.statusCode = 503
      res.setHeader('Cache-Control', 'no-store')
      res.end('No se pudo generar la imagen.')
    }
    return
  }

  if (embed) {
    /* Un embed que no se puede meter en un iframe no es un embed. Es la única
       respuesta de este dominio que lo permite, y solo permite eso. */
    res.setHeader(
      'Content-Security-Policy',
      "frame-ancestors *; sandbox allow-popups allow-top-navigation-by-user-activation",
    )
    res.end(paginaEmbed(tarjeta, que, id))
    return
  }

  try {
    const html = await shell(origen)
    const desde = html.indexOf(ABRE)
    const hasta = html.indexOf(CIERRA)
    if (desde < 0 || hasta < 0) {
      /* El shell salió sin marcadores: `scripts/inject-pwa.mjs` no corrió o
         cambió. Se sirve tal cual —la app funciona, el preview queda genérico—
         antes que romper el link. */
      res.end(html)
      return
    }
    res.end(html.slice(0, desde) + metaDeTarjeta(tarjeta, que, id) + html.slice(hasta + CIERRA.length))
  } catch {
    res.statusCode = 302
    res.setHeader('Location', `/embed/${que}/${encodeURIComponent(id)}`)
    res.end()
  }
}
