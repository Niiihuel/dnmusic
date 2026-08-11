import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Copia de carátulas y fotos de artista a Storage.
 *
 * El CDN de Google limita los pedidos: con el user-agent de un navegador
 * devuelve 429 y una página HTML, y el navegador la descarta sin dibujar nada
 * (ver la migración 20260809180000). Desde acá, sin ese user-agent, responde
 * normalmente — así que la imagen se baja una vez del lado del servidor y la
 * app la lee siempre desde Storage.
 *
 * Efecto secundario que importa: un mensaje viejo sigue mostrando su carátula
 * aunque Google cambie la URL o la borre, igual que pasa con el audio.
 */
const BUCKET = 'artwork'
/** Lo que se guarda: suficiente para el disco en pantalla grande y a 2x. */
const STORE_PX = 720

const WIDTH_HEIGHT = /=w(\d+)-h(\d+)(?=-|$)/
const SQUARE_SIZE = /=s\d+(?=-|$)/

/**
 * Pide la versión grande al CDN antes de guardarla.
 *
 * Las URLs de los resultados de búsqueda vienen en 60 o 120 px; guardar eso
 * daría un disco borroso. Solo se reescribe el tamaño, que conserva el
 * identificador y los parámetros de recorte del proveedor — agregar un sufijo
 * a una URL que no lo tiene devuelve 400.
 *
 * **La proporción se respeta.** Antes esto pedía siempre `=w720-h720`, y para
 * una foto de artista —que viene apaisada, por ejemplo 2776×1156— eso le pedía
 * a Google un recorte cuadrado. Como el cliente después la dibuja con su
 * proporción real, la imagen aparecía ampliada y cortada. Se escala el lado
 * más largo a STORE_PX y el otro en proporción.
 */
function atStoreSize(url: string): string {
  const wh = WIDTH_HEIGHT.exec(url)
  if (wh) {
    const w = Number(wh[1])
    const h = Number(wh[2])
    if (w > 0 && h > 0) {
      const scale = STORE_PX / Math.max(w, h)
      const nw = Math.max(1, Math.round(w * scale))
      const nh = Math.max(1, Math.round(h * scale))
      return url.replace(WIDTH_HEIGHT, `=w${nw}-h${nh}`)
    }
  }
  if (SQUARE_SIZE.test(url)) return url.replace(SQUARE_SIZE, `=s${STORE_PX}`)
  return url
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/**
 * Deja la imagen en Storage y devuelve su ruta, o null si no se pudo.
 *
 * Nunca tira: una carátula que no se pudo copiar no puede impedir que se mande
 * la canción. Quien llama se queda con la URL original como respaldo.
 */
export async function cacheImage(
  supabase: SupabaseClient,
  url: string | undefined | null,
  key: string,
): Promise<string | null> {
  if (!url) return null

  try {
    // La extensión no se sabe hasta descargar, así que primero se busca
    // cualquier archivo que empiece con la clave.
    const { data: existing } = await supabase.storage.from(BUCKET).list('', { search: key })
    const hit = existing?.find((f) => f.name.startsWith(`${key}.`))
    if (hit) return hit.name

    const res = await fetch(atStoreSize(url))
    if (!res.ok) return null

    const type = (res.headers.get('content-type') ?? '').split(';')[0]
    const ext = EXT[type]
    // Si no vino un tipo de imagen conocido, lo más probable es que sea la
    // página de error del 429: guardarla sería peor que no tener nada.
    if (!ext) return null

    const bytes = Buffer.from(await res.arrayBuffer())
    if (!bytes.length) return null

    const path = `${key}.${ext}`
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: type, upsert: true })
    return error ? null : path
  } catch {
    return null
  }
}
