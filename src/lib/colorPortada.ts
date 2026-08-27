import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { proxiedImage } from '../services/music'

/**
 * El color que tiñe la cabecera de una colección, sacado de su portada.
 *
 * Es el recurso de Spotify: el degradado de arriba no es un gris fijo sino el
 * color de la tapa, así cada lista «se siente» distinta antes de leer una sola
 * canción. El color no vive en `docs/DESIGN.md` —el sistema es acromático— y
 * justamente por eso está permitido: **sale de la carátula**, que es la única
 * fuente de color que el diseño reserva. El resto de la app sigue en grises.
 *
 * De dónde salen los píxeles cambia por plataforma, pero el resultado es el
 * mismo hexadecimal:
 *
 * - **Web/escritorio**: se dibuja la tapa chica en un canvas y se lee. Cero
 *   dependencias; anda siempre.
 * - **iOS**: `react-native-image-colors` (UIImageColors por dentro). El módulo
 *   es **opcional** y el `require` es perezoso, como el de `expo-screen-capture`
 *   en `AvisoCaptura`: si el binario no lo trae, no hay tinte y nada se rompe.
 *
 * Sin color —tapa oscura, error de red, módulo ausente— la cabecera queda como
 * estaba. El tinte es un lujo, nunca un requisito.
 */

/** Caché por URI: una tapa da siempre el mismo color, y leerlo cuesta. */
const cache = new Map<string, string>()

/** `#rrggbb` con alfa, para armar las paradas del degradado sin encandilar. */
export function conAlfa(hex: string, alfa: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!m) return `rgba(31,31,31,${alfa})`
  const r = parseInt(m[1], 16)
  const g = parseInt(m[2], 16)
  const b = parseInt(m[3], 16)
  return `rgba(${r}, ${g}, ${b}, ${alfa})`
}

function aHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

/**
 * Acota la luminancia para que el tinte se lea sobre el fondo sin lavar la
 * cabecera: sube las tapas casi negras a un mínimo visible y baja las casi
 * blancas, dejando el medio intacto.
 */
function acotarLuz(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b)
  if (max < 64) {
    const k = 64 / Math.max(max, 1)
    return [r * k, g * k, b * k]
  }
  if (max > 205) {
    const k = 205 / max
    return [r * k, g * k, b * k]
  }
  return [r, g, b]
}

/**
 * Elige el color que manda en un mapa de píxeles: agrupa por tono y se queda
 * con el grupo de más peso, contando doble los colores vivos —una foto con
 * mucho gris y un toque de rojo debe tintar de rojo, no de gris—.
 */
function dominante(data: Uint8ClampedArray): string | null {
  const bins = new Map<string, { r: number; g: number; b: number; n: number; peso: number }>()
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 125) continue
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const sat = max === 0 ? 0 : (max - min) / max
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`
    const cur = bins.get(key) ?? { r: 0, g: 0, b: 0, n: 0, peso: 0 }
    cur.r += r
    cur.g += g
    cur.b += b
    cur.n += 1
    cur.peso += 1 + sat * 3
    bins.set(key, cur)
  }
  let mejor: { r: number; g: number; b: number; n: number; peso: number } | null = null
  for (const v of bins.values()) if (!mejor || v.peso > mejor.peso) mejor = v
  if (!mejor) return null
  const [r, g, b] = acotarLuz(mejor.r / mejor.n, mejor.g / mejor.n, mejor.b / mejor.n)
  return aHex(r, g, b)
}

/** Las tapas de Google no mandan CORS: van por el proxy o el canvas se «mancha». */
function conCors(url: string): string {
  return /googleusercontent\.com|ggpht\.com|ytimg\.com/.test(url) ? proxiedImage(url) : url
}

function colorWeb(uri: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const S = 24
        const canvas = document.createElement('canvas')
        canvas.width = S
        canvas.height = S
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return resolve(null)
        ctx.drawImage(img, 0, 0, S, S)
        resolve(dominante(ctx.getImageData(0, 0, S, S).data))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = conCors(uri)
  })
}

async function colorNativo(uri: string): Promise<string | null> {
  try {
    /* Perezoso: si el binario no trae el módulo nativo, el import de arriba
       reventaría la app al arrancar. Acá falla adentro y simplemente no hay
       tinte. Mismo trato que `expo-screen-capture` en `AvisoCaptura`. */
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-image-colors') as {
      getColors: (uri: string, opts?: Record<string, unknown>) => Promise<Record<string, string>>
    }
    const res = await mod.getColors(uri, { fallback: '#1F1F1F', cache: true, key: uri, quality: 'low' })
    const c =
      res.platform === 'ios'
        ? res.background ?? res.primary ?? res.detail
        : res.vibrant ?? res.dominant
    return c ?? null
  } catch {
    return null
  }
}

/**
 * El color de una portada, o `null` mientras se calcula o si no hay ninguno.
 *
 * Arranca del caché sincrónico —volver a una lista que ya se miró no parpadea—
 * y si no está, lo calcula una vez. Una respuesta que llega tarde no pisa una
 * portada nueva: se descarta si la URI ya cambió.
 */
export function useColorPortada(uri: string | null): string | null {
  /*
   * El color se lee del caché **en el render**, no desde un `setState` dentro
   * del efecto: volver a una tapa ya vista no dispara un renglón de cascada.
   * El efecto solo calcula lo que falta, y cuando llega —ya en un callback
   * asíncrono— pide un redibujo. Un intento fallido se guarda como cadena vacía
   * para no reintentar en cada montaje. Mismo cuidado que los selectores del
   * store con `useSyncExternalStore`.
   */
  const [, redibujar] = useState(0)

  useEffect(() => {
    if (!uri || cache.has(uri)) return
    let vivo = true
    const p = Platform.OS === 'web' ? colorWeb(uri) : colorNativo(uri)
    void p.then((c) => {
      if (!vivo) return
      cache.set(uri, c ?? '')
      redibujar((n) => n + 1)
    })
    return () => {
      vivo = false
    }
  }, [uri])

  return uri ? cache.get(uri) || null : null
}
