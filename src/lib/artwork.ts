import { getSupabase } from './supabase'

/**
 * Pide al CDN de YouTube/Google la carátula en el tamaño adecuado al lugar
 * donde se va a dibujar.
 *
 * YouTube Music devuelve URLs como `...=w60-h60-l90-rj`. La imagen original
 * tiene mucha más resolución, pero si esa URL se guarda tal cual y después se
 * estira en el panel de detalle se ve pixelada. Cambiar solo w/h conserva el
 * identificador y los parámetros de recorte del proveedor.
 */
const ARTWORK_BUCKET = 'artwork'
const GOOGLE_ARTWORK_HOST =
  /^https:\/\/(?:yt3|lh3)\.(?:googleusercontent\.com|ggpht\.com)\//
const WIDTH_HEIGHT = /=w\d+-h\d+(?=-|$)/
const SQUARE_SIZE = /=s\d+(?=-|$)/

export function artworkUrlAtSize(url: string, requestedPx: number): string {
  if (!url || !GOOGLE_ARTWORK_HOST.test(url)) return url

  // Evita tamaños accidentales absurdos y mantiene URLs estables/cacheables.
  const px = Math.max(32, Math.min(1200, Math.round(requestedPx)))
  if (WIDTH_HEIGHT.test(url)) return url.replace(WIDTH_HEIGHT, `=w${px}-h${px}`)
  if (SQUARE_SIZE.test(url)) return url.replace(SQUARE_SIZE, `=s${px}`)
  return url
}

/**
 * De dónde sacar una imagen: de nuestra copia si existe, si no del CDN.
 *
 * La copia es la buena. El CDN de Google responde 429 cada tanto y el navegador
 * descarta esa respuesta sin dibujar nada (ver la migración del bucket
 * `artwork`), así que la URL original queda solo como respaldo para lo que se
 * guardó antes de que existiera el caché.
 *
 * `path` no lleva reescritura de tamaño: lo que guardamos ya viene en una
 * medida que sirve para todos los usos, y Storage no tiene un redimensionador.
 */
export function artworkSource(
  path: string | null | undefined,
  fallbackUrl: string | null | undefined,
  requestedPx: number,
): string | null {
  if (path) {
    const { data } = getSupabase().storage.from(ARTWORK_BUCKET).getPublicUrl(path)
    if (data.publicUrl) return data.publicUrl
  }
  return fallbackUrl ? artworkUrlAtSize(fallbackUrl, requestedPx) : null
}
