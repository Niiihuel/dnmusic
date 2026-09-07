import { useCallback, useEffect } from 'react'
import { createStore, useStore } from '../state/store'

export type TipoPiezaDiscord = 'marco' | 'efecto' | 'placa' | 'marcoPerfil'
export type PiezaDiscord = {
  id: string
  tipo: TipoPiezaDiscord
  nombre: string
  coleccionId: string
  coleccion: string
  /** Otras colecciones/promociones donde aparece el mismo SKU. */
  coleccionIds?: string[]
  asset?: string
  preview?: string
  staticPreview?: string
  palette?: string
  videoSrc?: string
  etiqueta?: string
  animationType?: number
  /** false si upstream conserva el SKU pero no sus recursos. */
  disponible?: boolean
  motivoNoDisponible?: string
  efectos?: {
    src: string
    loop: boolean
    /** Todos los tiempos se expresan en milisegundos. */
    duration: number
    start: number
    loopDelay: number
    zIndex: number
    position?: { x: number; y: number }
    width?: number
    height?: number
    randomizedSources?: string[]
  }[]
  reducedMotionSrc?: string
  capas?: { id: string; type: string; order: string; anchor: string; responsive: boolean }[]
  innerWidth?: number
  overflowTop?: number
  overflowBottom?: number
  overflowHorizontal?: number
}
export type PaqueteDiscord = {
  id: string
  nombre: string
  coleccionId: string
  coleccion: string
  piezas: Partial<Record<TipoPiezaDiscord, string>>
  /** Elecciones del mismo tipo; piezas contiene la primera como predeterminada. */
  alternativas?: Partial<Record<TipoPiezaDiscord, string[]>>
  preview?: string
  fondoPreview?: string
  disponible?: boolean
}
export type ColeccionDiscord = { id: string; nombre: string; colores: [string, string]; banner?: string }
export type CatalogoDiscord = {
  version: number
  actualizado: string
  fuente: string
  sha256?: string
  piezas: PiezaDiscord[]
  paquetes: PaqueteDiscord[]
  colecciones: ColeccionDiscord[]
}
const tipos: TipoPiezaDiscord[] = ['marco', 'efecto', 'placa', 'marcoPerfil']
const sku = /^[1-9]\d{16,19}$/
function esSku(id: unknown): id is string {
  return typeof id === 'string' && sku.test(id) && (id.length < 20 || id <= '18446744073709551615')
}
export function esDiscord(id: string | null | undefined): id is string {
  return typeof id === 'string' && id.startsWith('discord:') && esSku(id.slice(8))
}
function exigir(condicion: unknown): asserts condicion {
  if (!condicion) throw new Error('El catálogo Discord contiene datos inválidos.')
}
function esObjeto(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v) }
function esTexto(v: unknown): v is string { return typeof v === 'string' && !!v.trim() }
function esNumero(v: unknown, min = 0): v is number { return typeof v === 'number' && Number.isFinite(v) && v >= min }
function validarUrl(v: unknown) {
  exigir(typeof v === 'string' && v.startsWith('https://') && !/[\s\\]/.test(v))
  const u = new URL(v)
  exigir(['cdn.discordapp.com', 'media.discordapp.net'].includes(u.hostname) && !u.username && !u.password && !u.port && !u.hash)
}
function urls(o: Record<string, unknown>, keys: string[]) { for (const key of keys) if (o[key] !== undefined) validarUrl(o[key]) }

/** Defensa frente a snapshots truncados/incompatibles; se ejecuta una vez al cargar. */
export function validarCatalogoDiscord(valor: unknown): CatalogoDiscord {
  exigir(esObjeto(valor) && valor.version === 1 && typeof valor.actualizado === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor.actualizado))
  exigir(!Number.isNaN(Date.parse(valor.actualizado)) && new Date(valor.actualizado).toISOString().slice(0, 10) === valor.actualizado)
  exigir(valor.fuente === 'https://raw.githubusercontent.com/aamiaa/discord-api-diff/main/collectibles.json')
  exigir(valor.sha256 === undefined || typeof valor.sha256 === 'string' && /^[a-f0-9]{64}$/.test(valor.sha256))
  exigir(Array.isArray(valor.piezas) && valor.piezas.length > 0 && Array.isArray(valor.paquetes) && Array.isArray(valor.colecciones))
  const colecciones = new Map<string, string>(), piezas = new Map<string, PiezaDiscord>(), paquetes = new Set<string>()
  for (const c of valor.colecciones) {
    exigir(esObjeto(c) && typeof c.id === 'string' && esDiscord(c.id) && !colecciones.has(c.id) && esTexto(c.nombre))
    exigir(Array.isArray(c.colores) && c.colores.length === 2 && c.colores.every((v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)))
    urls(c, ['banner'])
    colecciones.set(c.id, c.nombre)
  }
  const validarBase = (p: Record<string, unknown>) => {
    exigir(typeof p.id === 'string' && esDiscord(p.id) && esTexto(p.nombre) && typeof p.coleccionId === 'string' && colecciones.get(p.coleccionId) === p.coleccion)
    exigir(p.disponible === undefined || typeof p.disponible === 'boolean')
  }
  for (const p of valor.piezas) {
    exigir(esObjeto(p))
    validarBase(p)
    exigir(typeof p.id === 'string' && !piezas.has(p.id) && tipos.includes(p.tipo as TipoPiezaDiscord))
    if (p.coleccionIds !== undefined) exigir(Array.isArray(p.coleccionIds) && p.coleccionIds.every((id) => colecciones.has(id)))
    for (const key of ['asset', 'palette', 'etiqueta', 'motivoNoDisponible']) if (p[key] !== undefined) exigir(esTexto(p[key]))
    urls(p, ['preview', 'staticPreview', 'reducedMotionSrc', 'videoSrc'])
    if (p.tipo === 'marco' && p.asset !== undefined) exigir(typeof p.asset === 'string' && /^(?:a_)?[a-f0-9]{32}$/.test(p.asset))
    if (p.tipo === 'placa' && p.asset !== undefined) exigir(typeof p.asset === 'string' && /^nameplates\/(?:[^/\\%?#\s]+\/)+$/.test(p.asset) && !p.asset.split('/').some((s) => s === '.' || s === '..'))
    if (p.animationType !== undefined) exigir(esNumero(p.animationType))
    if (p.efectos !== undefined) {
      exigir(Array.isArray(p.efectos) && p.efectos.length > 0)
      for (const e of p.efectos) {
        exigir(esObjeto(e) && typeof e.loop === 'boolean' && esNumero(e.duration) && esNumero(e.start) && esNumero(e.loopDelay) && esNumero(e.zIndex, -Infinity))
        validarUrl(e.src)
        for (const key of ['width', 'height']) if (e[key] !== undefined) exigir(esNumero(e[key], 1))
        if (e.position !== undefined) exigir(esObjeto(e.position) && esNumero(e.position.x, -Infinity) && esNumero(e.position.y, -Infinity))
        if (e.randomizedSources !== undefined) { exigir(Array.isArray(e.randomizedSources)); e.randomizedSources.forEach(validarUrl) }
      }
    }
    if (p.capas !== undefined) {
      exigir(Array.isArray(p.capas) && p.capas.length > 0)
      const ids = new Set()
      for (const c of p.capas) {
        exigir(esObjeto(c) && esSku(c.id) && !ids.has(c.id) && ['staple', 'border', 'rail'].includes(c.type as string) && ['front', 'back'].includes(c.order as string) && ['top', 'bottom', 'center'].includes(c.anchor as string) && typeof c.responsive === 'boolean')
        ids.add(c.id)
      }
    }
    for (const key of ['innerWidth', 'overflowTop', 'overflowBottom', 'overflowHorizontal']) if (p[key] !== undefined) exigir(esNumero(p[key], key === 'innerWidth' ? 1 : 0))
    if (p.disponible === false) exigir(esTexto(p.motivoNoDisponible))
    else if (p.tipo === 'efecto') exigir(Array.isArray(p.efectos) && p.efectos.length > 0)
    else if (p.tipo === 'marcoPerfil') exigir(Array.isArray(p.capas) && esNumero(p.innerWidth, 1))
    else exigir(esTexto(p.preview))
    piezas.set(p.id, p as unknown as PiezaDiscord)
  }
  for (const p of valor.paquetes) {
    exigir(esObjeto(p))
    validarBase(p)
    exigir(typeof p.id === 'string' && !paquetes.has(p.id) && !piezas.has(p.id) && esObjeto(p.piezas) && Object.keys(p.piezas).length > 0)
    urls(p, ['preview', 'fondoPreview'])
    for (const [tipo, id] of Object.entries(p.piezas)) exigir(tipos.includes(tipo as TipoPiezaDiscord) && typeof id === 'string' && piezas.get(id)?.tipo === tipo)
    if (p.alternativas !== undefined) {
      exigir(esObjeto(p.alternativas))
      for (const [tipo, ids] of Object.entries(p.alternativas)) exigir(Array.isArray(ids) && ids.length > 1 && new Set(ids).size === ids.length && ids.includes(p.piezas[tipo]) && ids.every((id) => piezas.get(id)?.tipo === tipo))
    }
    const incompleto = Object.entries(p.piezas).some(([tipo, id]) => {
      const opciones = (p.alternativas as PaqueteDiscord['alternativas'])?.[tipo as TipoPiezaDiscord] ?? [id as string]
      return opciones.every((opcion) => piezas.get(opcion)?.disponible === false)
    })
    exigir(incompleto === (p.disponible === false))
    paquetes.add(p.id)
  }
  return valor as unknown as CatalogoDiscord
}

const store = createStore<{ catalogo: CatalogoDiscord | null; cargando: boolean; error: string | null }>({ catalogo: null, cargando: false, error: null })
let pendiente: Promise<CatalogoDiscord> | null = null
let indice = new Map<string, PiezaDiscord>()

/** Metadatos locales incluidos con la app. No consulta APIs ni utiliza tokens. */
export function cargarCatalogoDiscord(): Promise<CatalogoDiscord> {
  const actual = store.get().catalogo
  if (actual) return Promise.resolve(actual)
  if (pendiente) return pendiente
  // Se asigna antes de notificar al store para cubrir llamadas reentrantes.
  pendiente = Promise.resolve().then(async () => {
    try {
      const modulo = await import('../data/discord-catalogo.json')
      const catalogo = validarCatalogoDiscord(modulo.default)
      indice = new Map(catalogo.piezas.map((p) => [p.id, p]))
      store.set({ catalogo, cargando: false, error: null })
      return catalogo
    } catch (error) {
      store.set({ cargando: false, error: error instanceof Error ? error.message : 'No se pudo cargar el catálogo Discord.' })
      throw error
    } finally {
      pendiente = null // El rechazo nunca queda cacheado: la siguiente llamada reintenta.
    }
  })
  store.set({ cargando: true, error: null })
  return pendiente
}
export function piezaDiscordDe(id: string | null | undefined): PiezaDiscord | null {
  return esDiscord(id) ? indice.get(id) ?? null : null
}
export function useCatalogoDiscord(activo = true) {
  const estado = useStore(store, (s) => s)
  useEffect(() => {
    if (activo && !store.get().catalogo && !store.get().error) void cargarCatalogoDiscord().catch(() => {})
  }, [activo])
  const reintentar = useCallback(() => {
    if (activo) void cargarCatalogoDiscord().catch(() => {})
  }, [activo])
  return { ...estado, reintentar }
}
export function usePiezaDiscord(id: string | null | undefined): PiezaDiscord | null {
  useCatalogoDiscord(esDiscord(id))
  return piezaDiscordDe(id)
}

/** Devuelve una selección completa o null. La UI debe aplicar el resultado en UN set/update. */
export function seleccionPaqueteDiscord(id: string, alternativas: Partial<Record<TipoPiezaDiscord, string>> = {}): Partial<Record<TipoPiezaDiscord, string>> | null {
  const paquete = store.get().catalogo?.paquetes.find((p) => p.id === id)
  if (!paquete || paquete.disponible === false) return null
  for (const tipo of Object.keys(alternativas)) if (!(tipo in paquete.piezas)) return null
  const seleccion: Partial<Record<TipoPiezaDiscord, string>> = {}
  for (const [tipo, predeterminada] of Object.entries(paquete.piezas)) {
    const key = tipo as TipoPiezaDiscord
    const elegido = alternativas[key] ?? predeterminada
    if (!(paquete.alternativas?.[key] ?? [predeterminada]).includes(elegido)) return null
    const pieza = piezaDiscordDe(elegido)
    if (!pieza || pieza.tipo !== key || pieza.disponible === false) return null
    seleccion[key] = elegido
  }
  return seleccion
}
