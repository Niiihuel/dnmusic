import { search } from './youtube.js'
import type { YtTrack } from './youtube.js'

/**
 * De un nombre de Spotify a una canción de YouTube Music.
 *
 * Este módulo es el corazón del import: Spotify no da audio y nunca lo va a
 * dar, así que la lista no se copia — se **recrea** buscando cada tema por
 * nombre. Que el import se sienta bien o se sienta roto depende enteramente de
 * lo que decide acá.
 *
 * La trampa del problema es que buscar «artista título» casi siempre devuelve
 * *algo*, y ese algo puede ser el remaster, la versión en vivo, un cover de
 * karaoke o el tema equivocado del mismo disco. Un import que mete 100 canciones
 * de las cuales 8 están mal es peor que uno que mete 92 y pregunta por 8: el
 * error silencioso se descubre semanas después, escuchando.
 *
 * De ahí las dos decisiones de diseño:
 *
 * 1. **La duración manda.** Es el único dato duro que da Spotify y el que más
 *    barato separa una versión de otra: dos temas homónimos pueden confundir a
 *    cualquier comparador de texto, pero un vivo dura veinte segundos más.
 * 2. **Dudar es una respuesta válida.** No hay un umbral único que decida sí o
 *    no; hay tres salidas —segura, dudosa, sin resultado— y las dudosas van a
 *    una pantalla donde una persona elige en dos segundos.
 */

// ── Normalización ──────────────────────────────────────────────────────────

/**
 * Paréntesis y sufijos que **no** cambian la canción.
 *
 * Sacarlos es lo que hace que «Blitzkrieg Bop - 2016 Remaster» empareje con
 * «Blitzkrieg Bop». Son etiquetas de edición o de video, no de contenido.
 */
const RUIDO =
  /\b(remaster(ed|izado)?(\s*\d{4})?|\d{4}\s*remaster|official\s*(music\s*)?video|official\s*audio|official\s*lyric\s*video|lyrics?\s*video|lyrics?|video\s*oficial|audio\s*oficial|con\s*letra|hd|hq|4k|explicit|clean|single\s*version|album\s*version|radio\s*edit|bonus\s*track|deluxe|mono|stereo|anniversary\s*edition)\b/g

/**
 * Palabras que **sí** cambian la canción.
 *
 * Un vivo, un acústico y un remix son grabaciones distintas: si Spotify pide
 * una y el candidato es otra, no es el mismo tema aunque el título coincida
 * letra por letra. Se detectan en los dos lados y se comparan como un conjunto.
 */
const VARIANTES: Record<string, RegExp> = {
  vivo: /\b(live|en\s*vivo|en\s*directo|directo|unplugged|session|sessions|concert|tour)\b/,
  acustico: /\b(acoustic|acústic[oa]|ac[uú]stico)\b/,
  remix: /\b(remix|rmx|bootleg|flip|edit\s*by|vip\s*mix)\b/,
  instrumental: /\b(instrumental|karaoke|backing\s*track)\b/,
  demo: /\b(demo|maqueta)\b/,
  version: /\b(sped\s*up|slowed|reverb|nightcore|8d)\b/,
}

/**
 * Candidatos que casi nunca son lo que se buscaba.
 *
 * Los covers y los karaokes copian el título exacto del original, así que el
 * comparador de texto los adora. Se los castiga salvo que el tema de Spotify
 * pida justamente eso.
 */
const IMPOSTOR = /\b(karaoke|tribute|tributo|cover|covered\s*by|made\s*famous\s*by|as\s*made\s*popular)\b/

/** Sin acentos, sin puntuación, en minúscula y con los espacios colapsados. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // marcas de acento sueltas que deja NFD
    .toLowerCase()
    .replace(/[’'`´]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * El título partido en lo que importa y lo que sobra.
 *
 * `feat.` sale del título y entra a la lista de artistas: Spotify lo escribe
 * dentro del título («Yonaguni (feat. X)») y YouTube Music lo pone como
 * artista, así que dejarlo donde estaba hacía fallar las dos comparaciones a la
 * vez — sobraba una palabra en el título y faltaba un nombre en el artista.
 */
export function partirTitulo(crudo: string): {
  titulo: string
  invitados: string[]
  variantes: Set<string>
} {
  let texto = ` ${crudo} `

  const invitados: string[] = []
  texto = texto.replace(
    /[([]?\s*\b(?:feat|ft|featuring|con|with)\b\.?\s+([^)\]]+?)\s*[)\]]?(?=\s*[-(\[]|\s*$)/gi,
    (_, nombres: string) => {
      invitados.push(...nombres.split(/\s*(?:,|&|\band\b|\by\b|\bx\b)\s*/i).filter(Boolean))
      return ' '
    },
  )

  // Las variantes se leen del título completo, antes de limpiarlo: si se
  // borrara «- Live» como ruido, se perdería justo la señal que las distingue.
  const paraVariantes = normalizar(texto)
  const variantes = new Set<string>()
  for (const [nombre, patron] of Object.entries(VARIANTES)) {
    if (patron.test(paraVariantes)) variantes.add(nombre)
  }

  const limpio = normalizar(texto).replace(RUIDO, ' ').replace(/\s+/g, ' ').trim()

  return {
    // Si limpiar dejó el título vacío —un tema que se llama «Live», por
    // ejemplo— se prefiere el original a no tener nada que comparar.
    titulo: limpio || normalizar(crudo),
    invitados: invitados.map(normalizar).filter(Boolean),
    variantes,
  }
}

/** Los artistas de una fila, que vienen como «A, B & C», en piezas sueltas. */
export function partirArtistas(crudo: string): string[] {
  return crudo
    .split(/\s*(?:,|&|\/|\band\b|\by\b|\bfeat\.?\b|\bft\.?\b|\bwith\b|\bcon\b)\s*/i)
    .map(normalizar)
    .filter(Boolean)
}

// ── Similitud ──────────────────────────────────────────────────────────────

/**
 * Coeficiente de Dice sobre bigramas de caracteres.
 *
 * Se eligió sobre comparar palabra por palabra porque aguanta lo que de verdad
 * pasa en estos títulos: una palabra de más, el orden cambiado, una tilde que
 * sobrevivió, un plural. «the less i know the better» contra «less i know the
 * better» da 0.93 en vez del 0.8 que daría contar palabras enteras.
 */
export function similitud(a: string, b: string): number {
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0

  const bigramas = (s: string) => {
    const mapa = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) {
      const par = s.slice(i, i + 2)
      mapa.set(par, (mapa.get(par) ?? 0) + 1)
    }
    return mapa
  }

  const ma = bigramas(a)
  const mb = bigramas(b)
  let comunes = 0
  for (const [par, veces] of ma) comunes += Math.min(veces, mb.get(par) ?? 0)

  return (2 * comunes) / (a.length - 1 + (b.length - 1))
}

/**
 * Cuánto se parecen dos duraciones.
 *
 * Los escalones no son lineales a propósito: hasta un par de segundos es la
 * misma grabación medida por dos catálogos distintos (Spotify y YouTube cortan
 * el silencio final diferente); pasando los diez ya es otra versión. Cuando
 * alguno de los dos lados no sabe la duración —la búsqueda de YouTube devuelve
 * 0 en algunos casos, ver `trackFrom`— se devuelve un valor neutro: no se
 * premia ni se castiga por un dato que no existe.
 */
export function parecidoDeDuracion(a: number, b: number): number {
  if (!a || !b) return 0.5
  const diferencia = Math.abs(a - b) / 1000
  if (diferencia <= 2) return 1
  if (diferencia <= 5) return 0.85
  if (diferencia <= 10) return 0.55
  if (diferencia <= 20) return 0.2
  return 0
}

// ── Puntaje ────────────────────────────────────────────────────────────────

export type Confianza = 'segura' | 'dudosa' | 'sin_resultado'

export type Candidato = {
  track: YtTrack
  puntaje: number
  /** Por qué ese puntaje, en palabras. Se muestra en la pantalla de revisión. */
  motivo: string
}

export type PistaAEmparejar = {
  titulo: string
  artista: string
  durationMs: number
}

export type Emparejado = {
  confianza: Confianza
  /** El mejor candidato, o null si no hubo ninguno aceptable. */
  elegido: YtTrack | null
  /** Los mejores, para que la pantalla de revisión ofrezca alternativas. */
  candidatos: Candidato[]
}

/**
 * Qué tan bien un resultado de YouTube responde a un tema de Spotify.
 *
 * Los pesos salen de qué tan seguido cada señal se equivoca. El título pesa más
 * que nada porque es lo que se buscó; la duración va segunda porque es la que
 * atrapa las versiones equivocadas, que es el error caro. El artista pesa menos
 * de lo que uno esperaría porque los dos catálogos lo escriben distinto —«Tyler,
 * The Creator» contra «Tyler The Creator», el sello en vez del artista— y
 * castigarlo fuerte mandaba a revisión temas que estaban perfectos.
 */
export function puntuar(pista: PistaAEmparejar, candidato: YtTrack): Candidato {
  const origen = partirTitulo(pista.titulo)
  const destino = partirTitulo(candidato.title)

  const artistasOrigen = new Set([...partirArtistas(pista.artista), ...origen.invitados])
  const artistasDestino = new Set([...partirArtistas(candidato.artist), ...destino.invitados])

  const puntajeTitulo = similitud(origen.titulo, destino.titulo)

  /*
   * El artista se mide como «cuántos de los que pedí aparecen», y no como
   * parecido de la cadena entera: un tema con tres invitados en Spotify y solo
   * el principal en YouTube es el mismo tema, y comparar «bad bunny jhay
   * cortez» contra «bad bunny» daría un parecido pobre por una diferencia que
   * no importa.
   */
  let encontrados = 0
  for (const uno of artistasOrigen) {
    for (const otro of artistasDestino) {
      if (similitud(uno, otro) >= 0.8) {
        encontrados++
        break
      }
    }
  }
  const puntajeArtista = artistasOrigen.size ? encontrados / artistasOrigen.size : 0.5

  const puntajeDuracion = parecidoDeDuracion(pista.durationMs, candidato.durationMs)

  let puntaje = puntajeTitulo * 0.45 + puntajeDuracion * 0.35 + puntajeArtista * 0.2

  const razones: string[] = []

  /*
   * Las variantes se comparan como conjuntos, en los dos sentidos.
   *
   * Pedir el estudio y recibir el vivo está mal, y pedir el vivo y recibir el
   * estudio también. Cada diferencia se castiga fuerte porque es exactamente el
   * error que el import no puede cometer en silencio.
   */
  const sobran = [...destino.variantes].filter((v) => !origen.variantes.has(v))
  const faltan = [...origen.variantes].filter((v) => !destino.variantes.has(v))
  if (sobran.length) {
    puntaje -= 0.3 * sobran.length
    razones.push(`el candidato es ${sobran.join(' y ')} y el original no`)
  }
  if (faltan.length) {
    puntaje -= 0.3 * faltan.length
    razones.push(`falta ${faltan.join(' y ')}`)
  }

  // Karaokes y covers: castigo severo salvo que se hayan pedido.
  if (IMPOSTOR.test(normalizar(`${candidato.title} ${candidato.artist}`)) &&
      !IMPOSTOR.test(normalizar(`${pista.titulo} ${pista.artista}`))) {
    puntaje -= 0.45
    razones.push('parece un cover o un karaoke')
  }

  if (!razones.length) {
    if (puntajeDuracion === 1) razones.push('la duración coincide')
    else if (puntajeDuracion <= 0.2 && pista.durationMs && candidato.durationMs) {
      const delta = Math.round(Math.abs(pista.durationMs - candidato.durationMs) / 1000)
      razones.push(`dura ${delta}s de diferencia`)
    }
    if (puntajeArtista < 0.5) razones.push('el artista no coincide')
  }

  return {
    track: candidato,
    puntaje: Math.max(0, Math.min(1, puntaje)),
    motivo: razones.join('; '),
  }
}

/**
 * La consulta con la que se busca.
 *
 * Va el artista adelante porque YouTube Music pondera el principio de la
 * consulta, y el artista es lo que menos ambigüedad tiene: hay mil canciones
 * llamadas «Alone», pero pocas de Marshmello. El título va limpio de ruido
 * —«- 2016 Remaster» adentro de la consulta trae el video del remaster o nada—
 * pero **conserva las variantes**: si el tema es el vivo, hay que pedir el vivo.
 */
function consulta(pista: PistaAEmparejar): string {
  const { titulo, variantes } = partirTitulo(pista.titulo)
  const artista = partirArtistas(pista.artista)[0] ?? ''
  return [artista, titulo, ...variantes].filter(Boolean).join(' ').trim()
}

/** A partir de acá se acepta sin preguntar. */
const UMBRAL_SEGURA = 0.82
/** Por debajo de acá no se ofrece ni como alternativa. */
const UMBRAL_MINIMO = 0.45

/**
 * Empareja un tema. Hace una búsqueda, y una segunda solo si hace falta.
 *
 * El segundo intento —título y artista sin adornos— existe porque el primero
 * falla de una forma reconocible: cuando el título de Spotify trae una coletilla
 * larga que YouTube no usa, la consulta entera no encuentra nada bueno. Es una
 * búsqueda de más sobre un puñado de temas, no sobre todos, y eso importa: cada
 * búsqueda es un viaje a YouTube y el anti-bot cuenta viajes.
 */
export async function emparejar(pista: PistaAEmparejar): Promise<Emparejado> {
  const intentos = [consulta(pista)]

  let mejores: Candidato[] = []
  for (const termino of intentos) {
    if (!termino) continue
    const resultados = await search(termino, 8)
    const puntuados = resultados
      .map((r) => puntuar(pista, r))
      .sort((a, b) => b.puntaje - a.puntaje)

    // Se acumulan los de todos los intentos, sin repetir video.
    for (const candidato of puntuados) {
      if (!mejores.some((m) => m.track.videoId === candidato.track.videoId)) {
        mejores.push(candidato)
      }
    }
    mejores.sort((a, b) => b.puntaje - a.puntaje)

    if (mejores[0]?.puntaje >= UMBRAL_SEGURA) break

    // Segundo intento: lo mínimo indispensable, por si la consulta larga fue el
    // problema. Solo se agrega si el primero no alcanzó.
    if (intentos.length === 1) {
      const { titulo } = partirTitulo(pista.titulo)
      const simple = `${partirArtistas(pista.artista)[0] ?? ''} ${titulo}`.trim()
      if (simple && simple !== termino) intentos.push(simple)
    }
  }

  mejores = mejores.filter((c) => c.puntaje >= UMBRAL_MINIMO).slice(0, 4)

  const mejor = mejores[0]
  if (!mejor) return { confianza: 'sin_resultado', elegido: null, candidatos: [] }

  /*
   * Dos candidatos casi iguales son una duda, aunque el primero puntúe alto.
   *
   * Es el caso del tema que está en un disco y en su reedición, o el del single
   * y la versión del álbum: las dos entradas son legítimas y el puntaje no
   * puede distinguirlas. Preguntar cuesta un toque; elegir mal cuesta una
   * canción equivocada para siempre en la lista.
   */
  const segundo = mejores[1]
  const empatado = segundo !== undefined && mejor.puntaje - segundo.puntaje < 0.05

  const confianza: Confianza =
    mejor.puntaje >= UMBRAL_SEGURA && !empatado ? 'segura' : 'dudosa'

  return { confianza, elegido: mejor.track, candidatos: mejores }
}

/**
 * Un lote de temas, de a poco.
 *
 * La concurrencia es baja **a propósito**. Cada emparejado es una búsqueda
 * contra YouTube Music, y el anti-bot de YouTube es una reja de reputación que
 * mira volumen desde una IP (ver `salida.ts`). Importar una lista de 100 con
 * concurrencia alta es exactamente la forma de quemar la sesión que le costó
 * tanto a este proyecto mantener viva. Con tres en paralelo un lote de diez
 * tarda un par de segundos y no llama la atención de nadie.
 */
export async function emparejarLote(
  pistas: PistaAEmparejar[],
  concurrencia = 3,
): Promise<(Emparejado & { indice: number })[]> {
  const salida: (Emparejado & { indice: number })[] = []
  let siguiente = 0

  const obrero = async () => {
    for (;;) {
      const indice = siguiente++
      if (indice >= pistas.length) return
      try {
        salida.push({ ...(await emparejar(pistas[indice])), indice })
      } catch {
        /*
         * Un tema que explota no puede llevarse el import puesto.
         *
         * Se devuelve como «sin resultado», que es una salida que la pantalla
         * ya sabe mostrar y que la persona puede resolver a mano. Reintentar
         * acá sería sumar viajes a YouTube justo cuando algo ya salió mal.
         */
        salida.push({ confianza: 'sin_resultado', elegido: null, candidatos: [], indice })
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrencia, pistas.length) }, obrero))
  return salida.sort((a, b) => a.indice - b.indice)
}
