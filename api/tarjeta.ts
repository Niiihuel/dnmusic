import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Metadatos públicos por enlace: los crawlers no ejecutan el ruteo del SPA.
 * Sirve shell, iframe, PNG social y oEmbed con la misma lectura pública.
 * El renderizador de imágenes se carga sólo para `modo=imagen`.
 */

const SITIO = (process.env.SITE_URL?.trim() || 'https://dnmusic-production-c3f4.up.railway.app').replace(/\/$/, '')
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
 * Cachea el shell por instancia. En despliegues serverless se obtiene por HTTP
 * para evitar empaquetar un dist/index.html ausente o viejo durante el build.
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
 * tarjeta_enlace usa la anon key y devuelve sólo presentación de recursos
 * compartibles. La autorización vive en el RPC; no requiere service_role.
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

/** Storage depende del entorno: acepta bucket/camino o una URL absoluta del CDN. */
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
 * Iframe liviano sin bundle, scripts ni audio público.
 * El enlace abre la app; comparte la composición visual de su tarjeta.
 */
function paginaEmbed(t: Tarjeta | null, que: string, id: string): string {
  const destino = `${SITIO}/${que}/${encodeURIComponent(id)}`
  const titulo = t ? escapar(t.titulo) : 'Esto ya no está disponible'
  const bajada = t ? escapar(t.subtitulo) : 'El link puede haber quedado viejo.'
  const tapa = t?.tapa ? escapar(t.tapa) : ''
  const musical = que === 'cancion' || que === 'lista'
  return `<!DOCTYPE html>
<html lang="es-AR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${metaDeTarjeta(t, que, id)}
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: transparent; color: #fff;
         font: 15px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  a.tarjeta { position: relative; display: flex; align-items: center; gap: 16px;
              height: 152px; padding: 20px; overflow: hidden; isolation: isolate;
              background: #181818; border-radius: 20px; text-decoration: none; color: inherit; }
  a.tarjeta:focus-visible { outline: 2px solid #fff; outline-offset: -3px; }
  .fondo { position: absolute; inset: -50%; width: 200%; height: 200%; z-index: -2;
           object-fit: cover; opacity: .65; filter: blur(40px) saturate(1.3); pointer-events: none; }
  .velo { position: absolute; inset: 0; z-index: -1; pointer-events: none;
          background: linear-gradient(180deg, rgba(0,0,0,.65), rgba(0,0,0,.8)); }
  .arte { position: relative; display: flex; align-items: center; width: ${musical ? '136' : '112'}px;
          height: 112px; flex: none; }
  .tapa { position: relative; z-index: 1; width: 112px; height: 112px;
          border-radius: ${que === 'perfil' || que === 'jam' ? '50%' : '10px'}; flex: none;
          background: #292929; object-fit: cover; box-shadow: 0 6px 16px rgba(0,0,0,.4);
          transition: transform .3s ease; }
  .sin-tapa { display: flex; align-items: center; justify-content: center;
              color: #b3b3b3; font-size: 38px; }
  .vinilo { position: absolute; left: 46px; width: 90px; height: 90px; border-radius: 50%;
            background: repeating-radial-gradient(circle, #101010 0 2px, #282828 3px, #101010 4px);
            box-shadow: 0 3px 12px rgba(0,0,0,.45); transition: transform .3s ease; }
  .vinilo::after { content: ''; position: absolute; inset: 35%; border-radius: 50%;
                   background: #aaa; box-shadow: inset 0 0 0 8px #333; }
  a.tarjeta:hover .tapa, a.tarjeta:focus-visible .tapa { transform: translateX(-2px); }
  a.tarjeta:hover .vinilo, a.tarjeta:focus-visible .vinilo { transform: translateX(4px); }
  .texto { display: flex; flex-direction: column; justify-content: space-between;
           align-self: stretch; min-width: 0; flex: 1; text-align: right; }
  .titulo { font-weight: 600; font-size: 17px; letter-spacing: -.23px; margin: 0 0 3px;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sub { color: #d0cbd0; font-size: 13px; margin: 0;
         overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .marca { display: flex; align-items: center; justify-content: flex-end; gap: 6px;
           color: #d6d1d4; font-size: 12px; font-weight: 600; margin: 0; }
  .marca svg { width: 15px; height: 15px; }
  .abrir { color: #e0dde0; font-size: 11px; margin: 6px 0 0; }
  @media (max-width: 360px) {
    a.tarjeta { padding: 16px; gap: 12px; }
    .arte { width: ${musical ? '108' : '92'}px; height: 92px; }
    .tapa { width: 92px; height: 92px; }
    .vinilo { width: 74px; height: 74px; left: 34px; }
    .titulo { font-size: 15px; }
  }
  @media (prefers-reduced-motion: reduce) { .tapa, .vinilo { transition: none; } }
</style>
</head>
<body>
<a class="tarjeta" href="${escapar(destino)}" target="_blank" rel="noopener noreferrer" aria-label="${escapar(`Abrir ${t?.titulo ?? 'el enlace'} en dnmusic`)}">
  ${tapa ? `<img class="fondo" src="${tapa}" alt="" aria-hidden="true" />` : ''}
  <div class="velo" aria-hidden="true"></div>
  <div class="arte">
    ${musical ? '<div class="vinilo" aria-hidden="true"></div>' : ''}
    ${tapa ? `<img class="tapa" src="${tapa}" alt="Portada" />` : '<div class="tapa sin-tapa" aria-hidden="true">♪</div>'}
  </div>
  <div class="texto">
    <p class="marca"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M2 10v4M6 6v12M10 3v18M14 8v8M18 5v14M22 10v4" /></svg>dnmusic</p>
    <div>
      <p class="titulo">${titulo}</p>
      <p class="sub">${bajada}</p>
      <p class="abrir">Abrir en dnmusic ↗</p>
    </div>
  </div>
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
    /* El iframe sigue sin scripts ni storage. La pestaña que abre el link
       necesita salir del sandbox para que arranque la app completa. */
    res.setHeader(
      'Content-Security-Policy',
      "frame-ancestors *; sandbox allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation",
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
