/**
 * La letra sincronizada: el archivo LRC, y qué línea le toca a cada momento.
 *
 * **Acá no se estima nada.** Hubo una versión que encendía la letra palabra por
 * palabra repartiendo cada verso por sílabas, porque LRCLIB da el momento en que
 * *empieza* cada línea y no el de cada palabra. Andaba, pero se notaba: adentro
 * de un verso el encendido a veces iba rápido y a veces lento, según cómo
 * hubiera cantado esa frase el que la cantó. Una letra que va apenas fuera de
 * tiempo es peor que una que va por verso y va bien.
 *
 * Así que la unidad es el verso, y todo lo que se dibuja sale de un dato que
 * está en el archivo. Para volver al karaoke hace falta el tiempo de cada
 * palabra de verdad: o el LRC «mejorado» —que casi nadie publica— o medirlo
 * contra el audio.
 */

export type LyricLine = {
  /** Momento de la línea, en ms desde el inicio de la canción. */
  atMs: number
  text: string
}

/**
 * `[mm:ss.xx] texto` → `{ atMs, text }`. Ignora metadatos y líneas vacías.
 *
 * `[offset:±ms]` corre la letra entera, y hay que respetarlo: es lo que usa
 * quien marcó los tiempos para corregir su propia demora. Positivo adelanta,
 * que es al revés de lo que uno leería — así lo dice el formato y así lo
 * entienden los reproductores que lo escriben.
 *
 * Las marcas por palabra del LRC «mejorado» (`<mm:ss.xx>` delante de cada una)
 * se sacan del texto: no las usamos, y sin sacarlas se dibujaban tal cual, con
 * los corchetes angulares a la vista.
 */
export function parseLrc(lrc: string): LyricLine[] {
  const LINE = /^\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]\s?(.*)$/
  const PALABRA = /<\d{1,2}:\d{2}(?:[.:]\d{1,3})?>/g
  const lines: LyricLine[] = []
  const corrimiento = Number(/^\[offset:\s*([+-]?\d+)\s*\]/im.exec(lrc)?.[1] ?? 0)

  for (const raw of lrc.split('\n')) {
    const m = LINE.exec(raw.trim())
    if (!m) continue
    const [, mm, ss, frac, crudo] = m
    const text = crudo.replace(PALABRA, '').replace(/\s+/g, ' ').trim()
    if (!text) continue

    // La fracción puede venir en centésimas (`.85`) o en milésimas (`.850`).
    const fracMs = frac ? Number(frac.padEnd(3, '0')) : 0
    lines.push({ atMs: Number(mm) * 60_000 + Number(ss) * 1000 + fracMs - corrimiento, text })
  }

  return lines.sort((a, b) => a.atMs - b.atMs)
}

/** Índice de la línea que corresponde a `atMs`, o -1 si todavía no arrancó. */
export function activeLyricIndex(lines: LyricLine[], atMs: number): number {
  let lo = 0
  let hi = lines.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].atMs <= atMs) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found
}

/**
 * Desde qué hueco vale la pena adelantarse a la próxima línea. Por debajo de
 * esto, la que viene llega sola enseguida y moverse antes sería cortar el verso
 * que todavía se está cantando.
 */
const HUECO_LARGO_MS = 7000
/** Cuánto antes se pone en su lugar la próxima línea, apagada, esperando. */
const PREPARACION_MS = 2500

/**
 * Qué línea mira la pantalla: casi siempre la que suena, y en los instrumentales
 * largos la que **viene**.
 *
 * Es lo que hace Apple Music: terminado el verso, la letra sube y deja la
 * próxima puesta y apagada esperando su turno, en vez de dejarte diez segundos
 * mirando una línea que ya pasó.
 *
 * La cuenta se hace **desde la línea que viene y no desde la que terminó**, y
 * ahí está la diferencia: cuándo dejó de cantarse un verso no lo sabe nadie
 * —habría que estimarlo, y estimar es lo que se sacó de acá—, pero cuándo
 * empieza el que sigue está en el archivo. Así que la próxima línea se acomoda
 * dos segundos y medio antes de que se cante, y solo cuando el hueco es largo
 * de verdad: con versos pegados no cambia nada.
 */
export function enfoque(lines: LyricLine[], sonando: number, atMs: number): number {
  const proxima = lines[sonando + 1]
  if (!proxima || sonando < 0) return sonando
  const hueco = proxima.atMs - lines[sonando].atMs
  if (hueco < HUECO_LARGO_MS) return sonando
  return atMs >= proxima.atMs - PREPARACION_MS ? sonando + 1 : sonando
}
