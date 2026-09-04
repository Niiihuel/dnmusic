/**
 * El tema de una vitrina: de qué es la tarjeta y, en consecuencia, de qué
 * color va lo que tiene escrito encima.
 *
 * Es la parte de Airbuds que hace que dos perfiles no se vean iguales: cada
 * pieza del mosaico se puede vestir, y el perfil entero tiene un tema que las
 * piezas heredan mientras no elijan otro. Por defecto no hay ninguno y la
 * tarjeta es el vidrio de siempre.
 *
 * Es un **catálogo propio**, no una librería: un tema es un color base, a
 * veces un degradado de dos paradas, a veces una textura dibujada encima, y
 * una regla de contraste. Cuatro familias —básicos, lisos, degradados, con
 * textura— más «de la tapa» y «personalizar». Corto a propósito: Steam vive
 * con seis temas y Discord con una paleta y un color a mano; más de ocho por
 * fila ya no es una elección, es un catálogo de mayorista.
 *
 * **La regla que sostiene todo el catálogo: ningún fondo vive en la banda del
 * medio.** Un color con luminancia relativa entre ~0,18 y ~0,45 se lee mal
 * con blanco y regular con negro. Los presets se toman de la escala de
 * Tailwind v4 —definida en OKLCH, así todos los 300 son igual de claros y
 * todos los 800 igual de oscuros— y solo de los tonos 200/300 (texto negro,
 * ≥10:1) y 800/900 (texto blanco, ≥7:1). Es la regla de Material 3 dicha al
 * revés: dos tonos a 50 de distancia garantizan 4,5:1. Los degradados
 * cumplen lo mismo con las **dos paradas del mismo lado**: uno que cruce de
 * claro a oscuro no tiene ningún texto posible.
 *
 * Sobre el color y `docs/DESIGN.md`: la **interfaz** sigue acromática —las
 * hojas, los botones y las barras de este editor están en grises—. Lo que se
 * pinta acá es el perfil de cada quien, que es contenido suyo como su foto o
 * su fondo. Es la misma regla por la que la tapa de una lista tiñe su
 * cabecera: el color no lo pone la app, lo pone lo que la persona eligió
 * mostrar. Y por eso dos de los temas son justamente «de la tapa».
 *
 * En la base un tema es JSON laxo: `{ id }` para un preset, `{ id: 'color',
 * color }` para uno a mano, `{ id: 'degradado', paradas }` para un degradado
 * a mano, y `patron` opcional en los dos últimos. Un id que el cliente no
 * conozca se dibuja como ninguno: un perfil editado por una versión más
 * nueva de la app no rompe a la vieja — mismo criterio que el marco.
 */
export type Patron = 'rayas' | 'puntos' | 'halo'

export type Familia = 'basico' | 'solido' | 'degradado' | 'tapa' | 'patron'

/** Lo guardado. Laxo a propósito: es jsonb y lo escriben varias versiones. */
export type Tema = {
  id: string
  /** Solo con `id: 'color'`. */
  color?: string
  /** Solo con `id: 'degradado'`. */
  paradas?: [string, string]
  /** Una textura encima, en `color` y `degradado`. */
  patron?: Patron
}

export type PresetTema = {
  id: string
  nombre: string
  familia: Familia
  /** El color base. `null` en la familia tapa, que lo saca de la carátula. */
  fondo: string | null
  paradas?: [string, string]
  /** Grados, como en CSS: 135 es la diagonal de arriba-izquierda a abajo-derecha. */
  angulo?: number
  patron?: Patron
  /** Solo en la familia tapa: el color tal cual, o fundido hacia la noche. */
  modo?: 'solido' | 'noche'
}

/**
 * Los temas con nombre, en el orden en que se ofrecen.
 *
 * Primero los básicos y los de la tapa, que respetan la paleta de la app tal
 * cual; después los lisos —cuatro claros, cuatro oscuros—; los degradados,
 * siempre con las dos paradas del mismo lado; y tres con textura, que es la
 * familia que ningún referente ofrece y por eso vale tenerla: cuesta cero
 * (se dibuja con SVG) y se lee distinta de lejos.
 *
 * Los hex son los tonos 200/300 y 800/900 de Tailwind v4, elegidos por la
 * regla del encabezado. Los nombres son cortos y de acá.
 */
export const TEMAS: PresetTema[] = [
  { id: 'blanco', nombre: 'Blanco', familia: 'basico', fondo: '#FFFFFF' },
  { id: 'negro', nombre: 'Negro', familia: 'basico', fondo: '#0A0A0A' },
  { id: 'tapa', nombre: 'De la tapa', familia: 'tapa', fondo: null, modo: 'solido' },
  { id: 'tapa-noche', nombre: 'Tapa de noche', familia: 'tapa', fondo: null, modo: 'noche' },

  { id: 'cielo', nombre: 'Cielo', familia: 'solido', fondo: '#74D4FF' },
  { id: 'agua', nombre: 'Agua', familia: 'solido', fondo: '#46ECD5' },
  { id: 'menta', nombre: 'Menta', familia: 'solido', fondo: '#A4F4CF' },
  { id: 'arena', nombre: 'Arena', familia: 'solido', fondo: '#FEE685' },
  { id: 'rosa', nombre: 'Rosa', familia: 'solido', fondo: '#FDA5D5' },
  { id: 'lila', nombre: 'Lila', familia: 'solido', fondo: '#C4B4FF' },
  { id: 'durazno', nombre: 'Durazno', familia: 'solido', fondo: '#FFB86A' },
  { id: 'hueso', nombre: 'Hueso', familia: 'solido', fondo: '#E7E5E4' },
  { id: 'noche', nombre: 'Noche', familia: 'solido', fondo: '#1E1A4D' },
  { id: 'uva', nombre: 'Uva', familia: 'solido', fondo: '#4D179A' },
  { id: 'vino', nombre: 'Vino', familia: 'solido', fondo: '#861043' },
  { id: 'bosque', nombre: 'Bosque', familia: 'solido', fondo: '#004F3B' },
  { id: 'petroleo', nombre: 'Petróleo', familia: 'solido', fondo: '#024A70' },
  { id: 'ladrillo', nombre: 'Ladrillo', familia: 'solido', fondo: '#82181A' },
  { id: 'musgo', nombre: 'Musgo', familia: 'solido', fondo: '#35530E' },
  { id: 'carbon', nombre: 'Carbón', familia: 'solido', fondo: '#292524' },

  { id: 'amanecer', nombre: 'Amanecer', familia: 'degradado', fondo: '#FEE685', paradas: ['#FEE685', '#FFCCD3'] },
  { id: 'lavanda', nombre: 'Lavanda', familia: 'degradado', fondo: '#DDD6FF', paradas: ['#DDD6FF', '#B8E6FE'] },
  { id: 'pradera', nombre: 'Pradera', familia: 'degradado', fondo: '#A4F4CF', paradas: ['#A4F4CF', '#D8F999'] },
  { id: 'crema', nombre: 'Crema', familia: 'degradado', fondo: '#FFD6A7', paradas: ['#FFD6A7', '#FCCEE8'] },
  { id: 'ocaso', nombre: 'Ocaso', familia: 'degradado', fondo: '#7E2A0C', paradas: ['#7E2A0C', '#4D0218'], angulo: 180 },
  { id: 'abismo', nombre: 'Abismo', familia: 'degradado', fondo: '#052F4A', paradas: ['#052F4A', '#1E1A4D'] },
  { id: 'selva', nombre: 'Selva', familia: 'degradado', fondo: '#002C22', paradas: ['#002C22', '#192E03'] },
  { id: 'neon', nombre: 'Neón', familia: 'degradado', fondo: '#2F0D68', paradas: ['#2F0D68', '#A800B7'] },
  { id: 'acero', nombre: 'Acero', familia: 'degradado', fondo: '#314158', paradas: ['#314158', '#020618'], angulo: 180 },

  { id: 'rayado', nombre: 'Rayado', familia: 'patron', fondo: '#292524', patron: 'rayas' },
  { id: 'punteado', nombre: 'Punteado', familia: 'patron', fondo: '#B8E6FE', patron: 'puntos' },
  { id: 'halo', nombre: 'Halo', familia: 'patron', fondo: '#1E1A4D', patron: 'halo', paradas: ['#7008E7', '#1E1A4D'] },
]

/** Las familias en el orden de la hoja, con su rótulo. */
export const FAMILIAS: { titulo: string; familias: Familia[] }[] = [
  { titulo: 'Básicos', familias: ['basico', 'tapa'] },
  { titulo: 'Lisos', familias: ['solido'] },
  { titulo: 'Degradados', familias: ['degradado'] },
  { titulo: 'Con textura', familias: ['patron'] },
]

/**
 * La paleta de «Personalizar»: doce matices, cada uno en claro y en oscuro.
 *
 * Son los tonos 300 y 800 de Tailwind v4, y nada del medio: la primera fila
 * va siempre con texto negro (≥9,8:1) y la segunda siempre con blanco
 * (≥7,1:1). La paleta anterior tenía seis casillas del tono 400 que
 * recibían blanco con 2,5:1 — se leían mal y no se notaba hasta medirlo.
 *
 * Doce y no una rueda: elegir el color de una tarjeta no pide un gesto
 * continuo, y una rueda de verdad es una librería más. Las dos filas
 * comparten el orden de matices, así «degradado» puede emparejar cada color
 * con su vecino de fila y quedar del mismo lado de luminancia por
 * construcción.
 */
export const PALETA: string[] = [
  '#FFA2A2', '#FFB86A', '#FFD230', '#BBF451', '#5EE9B5', '#46ECD5',
  '#74D4FF', '#8EC5FF', '#C4B4FF', '#F4A8FF', '#FDA5D5', '#D6D3D1',
  '#9F0712', '#9F2D00', '#973C00', '#3C6300', '#006045', '#005F5A',
  '#00598A', '#193CB8', '#5D0EC0', '#8A0194', '#A3004C', '#292524',
]

/** Cuántos matices por fila de la paleta. */
export const MATICES = 12

/** Un degradado listo para `expo-linear-gradient`. */
export type Degradado = {
  colores: [string, string]
  start: { x: number; y: number }
  end: { x: number; y: number }
}

/** Lo que una tarjeta necesita saber para dibujarse con su tema puesto. */
export type ColoresVitrina = {
  /** El fondo de la tarjeta. `null` es el vidrio de siempre. */
  fondo: string | null
  texto: string
  secundario: string
  /** El fondo es claro: los íconos y las superficies internas se invierten. */
  claro: boolean
  /** Una capa encima del fondo, si el tema la pide. Quien no la conoce, la ignora. */
  degradado?: Degradado | null
  /** Una textura en el color del texto, con el alfa ya puesto. */
  patron?: { tipo: Patron; color: string } | null
}

/** Sin tema: el vidrio, con los colores de texto del sistema. */
export const VIDRIO: ColoresVitrina = {
  fondo: null,
  texto: '#FFFFFF',
  secundario: '#B3B3B3',
  claro: false,
}

const HEX = /^#([0-9a-f]{6})$/i
const PATRONES: Patron[] = ['rayas', 'puntos', 'halo']

export function esColorHex(v: unknown): v is string {
  return typeof v === 'string' && HEX.test(v)
}

function esParadas(v: unknown): v is [string, string] {
  return Array.isArray(v) && v.length === 2 && esColorHex(v[0]) && esColorHex(v[1])
}

function esPatron(v: unknown): v is Patron {
  return typeof v === 'string' && (PATRONES as string[]).includes(v)
}

/** Un tema del JSON de la base, o `null` si no se entiende. */
export function temaDe(v: unknown): Tema | null {
  const r = v as Record<string, unknown> | null
  if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id) return null
  const patron = esPatron(r.patron) ? { patron: r.patron } : {}
  if (r.id === 'color') return esColorHex(r.color) ? { id: 'color', color: r.color, ...patron } : null
  if (r.id === 'degradado') {
    return esParadas(r.paradas) ? { id: 'degradado', paradas: r.paradas, ...patron } : null
  }
  return { id: r.id }
}

function canales(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function aHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

/**
 * Luminancia relativa (la de WCAG), para decidir si el texto va negro o
 * blanco encima de un color.
 */
function luminancia(hex: string): number {
  const canal = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = canales(hex)
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
}

/** El contraste WCAG entre dos luminancias. */
function contraste(a: number, b: number): number {
  const [alto, bajo] = a > b ? [a, b] : [b, a]
  return (alto + 0.05) / (bajo + 0.05)
}

const Y_NEGRO = luminancia('#121212')

/** Un color entre otros dos, en sRGB. Alcanza para una parada intermedia. */
export function mezclar(a: string, b: string, t: number): string {
  const [ar, ag, ab] = canales(a)
  const [br, bg, bb] = canales(b)
  return aHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t)
}

/** `#rrggbb` con alfa. */
function conAlfa(hex: string, alfa: number): string {
  const [r, g, b] = canales(hex)
  return `rgba(${r},${g},${b},${alfa})`
}

const SOBRE_CLARO = { texto: '#121212', secundario: 'rgba(18,18,18,0.62)', claro: true } as const
const SOBRE_OSCURO = { texto: '#FFFFFF', secundario: 'rgba(255,255,255,0.68)', claro: false } as const

/**
 * Los colores de texto que se leen sobre ese fondo.
 *
 * El corte va en 0,36 y no en el 0,4 de antes ni en el ~0,19 donde WCAG
 * empata: entre 0,36 y 0,45 el negro gana en la fórmula y el blanco en la
 * percepción (Myndex pone el corte perceptual en ~0,38), y sobre 0,36 el
 * negro `#121212` ya da 6,9:1, que es seguro. Para los presets no importa —no
 * hay ninguno en esa banda—; importa para la tapa y para lo guardado por
 * versiones viejas.
 */
export function sobreFondo(fondo: string): ColoresVitrina {
  return { fondo, ...(luminancia(fondo) > 0.36 ? SOBRE_CLARO : SOBRE_OSCURO) }
}

/**
 * El texto sobre un degradado: el que gana en la **peor parada**, no en el
 * promedio. Un promedio elige bien en el medio y mal en la punta; medido en
 * cinco puntos, lo que se elige es lo que se lee en toda la tarjeta.
 */
function sobreParadas(paradas: [string, string]): ColoresVitrina {
  const ys = [0, 0.25, 0.5, 0.75, 1].map((t) => luminancia(mezclar(paradas[0], paradas[1], t)))
  const minBlanco = Math.min(...ys.map((y) => contraste(y, 1)))
  const minNegro = Math.min(...ys.map((y) => contraste(y, Y_NEGRO)))
  return { fondo: paradas[0], ...(minNegro >= minBlanco ? SOBRE_CLARO : SOBRE_OSCURO) }
}

/** Le pone el degradado a unos colores, con el ángulo en grados de CSS. */
function conDegradado(c: ColoresVitrina, paradas: [string, string], angulo = 135): ColoresVitrina {
  const r = ((angulo - 90) * Math.PI) / 180
  const dx = Math.cos(r) / 2
  const dy = Math.sin(r) / 2
  return {
    ...c,
    degradado: {
      colores: paradas,
      start: { x: 0.5 - dx, y: 0.5 - dy },
      end: { x: 0.5 + dx, y: 0.5 + dy },
    },
  }
}

/**
 * Le pone una textura a unos colores.
 *
 * La textura va **en el color del texto con alfa baja**, no en un color
 * propio: así se adapta sola a claro y oscuro y a cualquier base. El halo es
 * la excepción —es una luz, no una trama— y toma el color que le den.
 */
function conPatron(c: ColoresVitrina, tipo: Patron, luz?: string): ColoresVitrina {
  const alfa = tipo === 'halo' ? 0.55 : c.claro ? 0.1 : 0.12
  return { ...c, patron: { tipo, color: conAlfa(tipo === 'halo' ? (luz ?? c.texto) : c.texto, alfa) } }
}

/**
 * Los colores con los que se dibuja una vitrina.
 *
 * `colorTapa` es lo que sacó `useColorPortada` de la carátula, si la vitrina
 * tiene una; los temas de la tapa lo usan y, mientras no llegó —o la vitrina
 * no tiene tapa—, caen al vidrio. Todo lo que no se entienda cae al vidrio
 * también: una tarjeta sin tema es mejor que una tarjeta de un color que
 * nadie eligió.
 */
export function coloresDe(tema: Tema | null, colorTapa: string | null = null): ColoresVitrina {
  if (!tema) return VIDRIO

  if (tema.id === 'color') {
    if (!esColorHex(tema.color)) return VIDRIO
    const c = sobreFondo(tema.color)
    return tema.patron ? conPatron(c, tema.patron) : c
  }

  if (tema.id === 'degradado') {
    if (!esParadas(tema.paradas)) return VIDRIO
    const c = conDegradado(sobreParadas(tema.paradas), tema.paradas)
    return tema.patron ? conPatron(c, tema.patron) : c
  }

  const preset = TEMAS.find((t) => t.id === tema.id)
  if (!preset) return VIDRIO

  if (preset.familia === 'tapa') {
    if (!colorTapa) return VIDRIO
    if (preset.modo === 'noche') {
      /* Lo de Spotify: la tapa fundida hacia el fondo de la app. Las dos
         paradas quedan oscuras siempre, así el texto blanco está garantizado
         sea cual sea la tapa. */
      const paradas: [string, string] = [
        mezclar(colorTapa, '#121212', 0.55),
        mezclar(colorTapa, '#121212', 0.85),
      ]
      return conDegradado(sobreParadas(paradas), paradas, 180)
    }
    return sobreFondo(colorTapa)
  }

  let c =
    preset.familia === 'degradado' && preset.paradas
      ? conDegradado(sobreParadas(preset.paradas), preset.paradas, preset.angulo)
      : sobreFondo(preset.fondo ?? '#0A0A0A')
  if (preset.patron) c = conPatron(c, preset.patron, preset.paradas?.[0])
  return c
}

/**
 * El tema que manda en una vitrina: el suyo si tiene, si no el del perfil.
 *
 * Es la herencia de Airbuds: elegir un tema desde la barra del editor viste al
 * mosaico entero, y cada pieza puede después salirse de la fila. `ninguno` en
 * una pieza no la deja en vidrio — la deja *sin opinión*, y entonces hereda.
 */
export function temaEfectivo(propio: Tema | null, global: Tema | null): Tema | null {
  return propio ?? global
}

/** Cómo se llama un tema, para las filas del editor. */
export function nombreDeTema(tema: Tema | null): string | null {
  if (!tema) return null
  if (tema.id === 'color' || tema.id === 'degradado') return 'Personalizado'
  return TEMAS.find((t) => t.id === tema.id)?.nombre ?? null
}

/** Dos temas son el mismo. Para marcar el elegido en la hoja. */
export function mismoTema(a: Tema | null, b: Tema | null): boolean {
  if (!a || !b) return a === b
  if (a.id !== b.id || a.patron !== b.patron) return false
  if (a.id === 'color') return a.color === b.color
  if (a.id === 'degradado') return a.paradas?.[0] === b.paradas?.[0] && a.paradas?.[1] === b.paradas?.[1]
  return true
}

/**
 * Qué se guarda al tocar un color de la paleta con un acabado elegido.
 *
 * «Degradado» empareja el color con su vecino de fila, que por construcción
 * está del mismo lado de luminancia: el degradado nunca cruza la banda.
 */
export function temaAMano(hex: string, acabado: 'liso' | 'degradado' | Patron): Tema {
  if (acabado === 'degradado') {
    const i = Math.max(0, PALETA.indexOf(hex))
    const fila = Math.floor(i / MATICES) * MATICES
    const vecino = PALETA[fila + ((i % MATICES) + 1) % MATICES]
    return { id: 'degradado', paradas: [hex, vecino] }
  }
  return acabado === 'liso' ? { id: 'color', color: hex } : { id: 'color', color: hex, patron: acabado }
}
