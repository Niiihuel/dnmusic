/**
 * Geometría y reloj independientes de React para compartir un único temporizador.
 * Fuente de datos: https://github.com/aamiaa/discord-api-diff/blob/main/collectibles.json
 * CDN y geometría contrastados con el cliente público (2026-09-06):
 * https://discord.com/assets/web.f803cc09a978437c.js (getCollectiblesItemAssetUrl)
 * https://discord.com/assets/315513.2247ef69ab89c325.css (profileFrameLayer)
 * YABDP4Nitro/src/ui/ProfileFrames.tsx usa el runtime de Discord; no se importa.
 */
export type EfectoDiscord = {
  src: string; loop: boolean; duration: number; start: number; loopDelay: number
  zIndex: number; position?: { x: number; y: number }; width?: number; height?: number
  randomizedSources?: string[]
}
export type CapaDiscord = { id: string; type: string; order: string; anchor: string; responsive: boolean }
export type MedidasMarco = { innerWidth?: number; overflowTop?: number; overflowBottom?: number; overflowHorizontal?: number }
export type FaseDiscord = { index: number; ciclo: number }
const numero = (n: number | undefined, fallback = 0) => Number.isFinite(n) ? n! : fallback

/** Sólo rutas públicas conocidas: no convertir IDs arbitrarios en endpoints inventados. */
export function urlCapaDiscord(id: string, capaId: string) {
  const sku = /^discord:(\d+)$/.exec(id)?.[1]
  return sku && /^\d+$/.test(capaId)
    ? `https://cdn.discordapp.com/media/v1/collectibles-shop/${sku}/${capaId}/static`
    : undefined
}
export function urlsAvatarDiscord(asset: string | undefined, size: number) {
  if (!asset || !/^(a_)?[a-f\d]{32}$/.test(asset)) return null
  const resolution = Math.min(1024, 2 ** Math.ceil(Math.log2(Math.max(16, size * 2))))
  const base = `https://cdn.discordapp.com/avatar-decoration-presets/${asset}.png?size=${resolution}`
  return { animada: base, estatica: `${base}&passthrough=false` }
}
export function urlsPlacaDiscord(asset: string | undefined) {
  if (!asset || !/^nameplates\/[a-zA-Z\d_./ -]+\/$/.test(asset) || asset.split('/').includes('..')) return null
  const base = `https://cdn.discordapp.com/assets/collectibles/${asset.split('/').map(encodeURIComponent).join('/')}`
  return { animada: `${base}asset.webm`, estatica: `${base}static.png` }
}

/** Los tiempos del catálogo son milisegundos, absolutos desde la entrada al perfil. */
export function fasesDiscord(efectos: readonly EfectoDiscord[], tiempo: number) {
  const visibles: FaseDiscord[] = []
  let siguiente = Infinity
  efectos.forEach((e, index) => {
    const inicio = Math.max(0, numero(e.start))
    const duracion = Math.max(0, numero(e.duration))
    if (!duracion) return
    if (tiempo < inicio) { siguiente = Math.min(siguiente, inicio); return }
    const relativo = tiempo - inicio
    if (!e.loop) {
      if (relativo < duracion) {
        visibles.push({ index, ciclo: 0 })
        siguiente = Math.min(siguiente, inicio + duracion)
      }
      return
    }
    const periodo = duracion + Math.max(0, numero(e.loopDelay))
    const ciclo = Math.floor(relativo / periodo)
    const posicion = relativo - ciclo * periodo
    const comienzo = inicio + ciclo * periodo
    if (posicion < duracion) {
      visibles.push({ index, ciclo })
      siguiente = Math.min(siguiente, comienzo + duracion)
    } else siguiente = Math.min(siguiente, comienzo + periodo)
  })
  return { visibles, siguiente }
}

/** Un timeout para todos los perfiles activos, solamente en los cambios de fase. */
export function crearRelojDiscord(
  ahora = () => Date.now(),
  programar: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms),
  cancelar: (handle: unknown) => void = handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
) {
  const entradas = new Set<{ efectos: readonly EfectoDiscord[]; inicio: number; firma: string; emitir: (fases: FaseDiscord[]) => void }>()
  let timer: unknown
  function cancelarTimer() { if (timer !== undefined) cancelar(timer); timer = undefined }
  function actualizar() {
    cancelarTimer()
    const tiempo = ahora()
    let proximo = Infinity
    for (const entrada of entradas) {
      const fases = fasesDiscord(entrada.efectos, tiempo - entrada.inicio)
      const firma = fases.visibles.map(f => `${f.index}:${f.ciclo}`).join(',')
      if (entrada.firma !== firma) { entrada.firma = firma; entrada.emitir(fases.visibles) }
      proximo = Math.min(proximo, entrada.inicio + fases.siguiente)
    }
    if (Number.isFinite(proximo)) timer = programar(actualizar, Math.max(1, proximo - ahora()))
  }
  return {
    suscribir(efectos: readonly EfectoDiscord[], emitir: (fases: FaseDiscord[]) => void) {
      const entrada = { efectos, inicio: ahora(), firma: '\0', emitir }
      entradas.add(entrada)
      actualizar()
      return () => { entradas.delete(entrada); actualizar() }
    },
  }
}

export function geometriaCapaDiscord(
  marco: MedidasMarco, capa: CapaDiscord, ancho: number, alto: number,
  imagen: { width: number; height: number },
) {
  if (!(ancho > 0 && alto > 0 && imagen.width > 0 && imagen.height > 0 && (marco.innerWidth ?? 0) > 0)) return null
  if (!['staple', 'rail', 'border'].includes(capa.type)) return null
  // La regla responsive del cliente oculta los rails en tarjetas cortas (<1.6× ancho).
  if (capa.type === 'rail' && capa.responsive && alto <= ancho * 480 / 300) return null
  const escala = ancho / marco.innerWidth!
  const horizontal = Math.max(0, numero(marco.overflowHorizontal)) * escala
  const width = ancho + horizontal * 2
  const height = width * imagen.height / imagen.width
  const top = capa.type === 'staple'
    ? capa.anchor === 'bottom' ? alto + Math.max(0, numero(marco.overflowBottom)) * escala - height
      : capa.anchor === 'center' ? (alto - height) / 2 : -Math.max(0, numero(marco.overflowTop)) * escala
    : capa.type === 'rail' ? capa.anchor === 'bottom' ? alto - height : capa.anchor === 'center' ? (alto - height) / 2 : 0
      : 0
  return { left: -horizontal, top, width, height, repetir: capa.type === 'border' ? Math.ceil(alto / height) + 1 : 1, recortar: capa.type !== 'staple' }
}

/** Se escala uniformemente el lienzo del efecto, sin deformar sus capas por separado. */
export function lienzoEfectosDiscord(efectos: readonly EfectoDiscord[], ancho: number) {
  const width = Math.max(1, ...efectos.map(e => Math.max(0, numero(e.position?.x)) + Math.max(1, numero(e.width, 450))))
  return ancho / width
}

// Colores darkBackground del cliente público, módulo 641886. El perfil de
// DMusic usa tema oscuro; la colocación de perfil lleva alfa 1A → 66 (351952).
const PALETAS_PLACA: Readonly<Record<string, string>> = {
  crimson: '#900007', berry: '#893A99', sky: '#0080B7', teal: '#086460', forest: '#2D5401',
  bubble_gum: '#DC3E97', violet: '#730BC8', cobalt: '#0131C2', clover: '#047B20',
  lemon: '#F6CD12', white: '#FFFFFF', black: '#000000',
}
export function gradientePlacaDiscord(palette?: string): [string, string] | undefined {
  const color = palette ? PALETAS_PLACA[palette] : undefined
  return color ? [`${color}1A`, `${color}66`] : undefined
}

/** Escala exterior que reserva las puntas sin cambiar la proporción del asset. */
export function margenesMarcoDiscord(marco: MedidasMarco, anchoExterior: number) {
  const escala = marco.innerWidth! > 0 && anchoExterior > 0
    ? anchoExterior / (marco.innerWidth! + 2 * Math.max(0, numero(marco.overflowHorizontal))) : 0
  return {
    paddingHorizontal: Math.max(0, numero(marco.overflowHorizontal)) * escala,
    paddingTop: Math.max(0, numero(marco.overflowTop)) * escala,
    paddingBottom: Math.max(0, numero(marco.overflowBottom)) * escala,
  }
}

/** Un único cover para el lienzo entero: conserva offsets y proporción de todas las capas. */
export function encuadreEfectosDiscord(efectos: readonly EfectoDiscord[], ancho: number, alto: number, ajuste: 'ancho' | 'cover') {
  const w = Math.max(1, ...efectos.map(e => Math.max(0, numero(e.position?.x)) + Math.max(1, numero(e.width, 450))))
  const h = Math.max(1, ...efectos.map(e => Math.max(0, numero(e.position?.y)) + Math.max(1, numero(e.height, 880))))
  const escala = ajuste === 'cover' ? Math.max(ancho / w, alto / h) : ancho / w
  return { escala, left: (ancho - w * escala) / 2, top: 0, width: w * escala, height: h * escala }
}
