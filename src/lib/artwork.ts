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
 * La copia de una carátula en Storage, sin mirar el teléfono.
 *
 * La usa el descargador para saber **qué bajar**. `artworkSource` no sirve para
 * eso: consulta primero lo que ya está en el teléfono y devolvería el archivo
 * local, que es justamente lo que todavía no existe.
 */
export function artworkRemoto(path: string): string | null {
  const { data } = getSupabase().storage.from(ARTWORK_BUCKET).getPublicUrl(path)
  return data.publicUrl || null
}

/*
 * Dónde preguntar si una carátula ya está en el teléfono.
 *
 * Es el mismo puente que usan `registerEngine` y `registerRelleno`, y por la
 * misma razón: quien sabe la respuesta es `state/descargas`, y este archivo está
 * una capa más abajo —`lib` no puede importar `state`— así que la dependencia se
 * invierte y la registra el que sí puede.
 *
 * Sin registrar, `artworkSource` se comporta exactamente como antes.
 */
let arteLocal: ((path: string) => string | null) | null = null

export function registerArteLocal(fn: ((path: string) => string | null) | null) {
  arteLocal = fn
}

/**
 * De dónde sacar una imagen: del teléfono si está bajada, de nuestra copia si
 * existe, si no del CDN.
 *
 * La copia es la buena. El CDN de Google responde 429 cada tanto y el navegador
 * descarta esa respuesta sin dibujar nada (ver la migración del bucket
 * `artwork`), así que la URL original queda solo como respaldo para lo que se
 * guardó antes de que existiera el caché.
 *
 * El archivo del teléfono va **antes que todo**: es el único que se puede
 * dibujar sin conexión, que es el punto entero de haberlo bajado. Sin él, una
 * lista descargada sonaba pero se veía con todos los cuadros vacíos.
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
    const local = arteLocal?.(path)
    if (local) return local
    const remoto = artworkRemoto(path)
    if (remoto) return remoto
  }
  return fallbackUrl ? artworkUrlAtSize(fallbackUrl, requestedPx) : null
}
