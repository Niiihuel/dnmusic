import { createStore, useStore } from './store'
import type { Borrador } from './vitrinaBorrador'
import { addShowcase, listShowcases, payloadDe, removeShowcase, reorderShowcases, updateShowcase, type Showcase } from '../services/showcases'
import { reconciliarMosaico } from '../ui/mosaicoBorrador'

type Ambito = { parentId: string | null; base: Showcase[]; actual: Showcase[]; cargado: boolean }
type Edicion = { ambitos: Record<string, Ambito>; errores: Record<string, string>; alias: Record<string, string>; altas: Record<string, string>; ocupado: boolean; version: number }
const vacio = (): Edicion => ({ ambitos: {}, errores: {}, alias: {}, altas: {}, ocupado: false, version: 0 })
const stores = new Map<string, ReturnType<typeof createStore<Edicion>>>()
const sinOwner = createStore(vacio())
const clave = (parentId: string | null) => parentId ?? '__raiz'
let secuencia = 0
export const idVitrinaTemporal = () => `borrador:${Date.now()}:${++secuencia}`
export const esVitrinaTemporal = (id: string) => id.startsWith('borrador:')
// El servicio y el editor construyen las mismas piezas con distinto orden de
// claves; sólo el orden de las filas/arrays representa un cambio del mosaico.
function canonico(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonico)
  if (valor && typeof valor === 'object') return Object.fromEntries(Object.entries(valor).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, canonico(value)]))
  return valor
}
/** UUID de fila, estable durante todos los intentos de guardar el mismo borrador. */
function idParaAlta() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.floor(Math.random() * 16)
    return (c === 'x' ? r : (r & 3) | 8).toString(16)
  })
}
const iguales = (a: unknown, b: unknown) => JSON.stringify(canonico(a)) === JSON.stringify(canonico(b))
function storeDe(ownerId: string) {
  let store = stores.get(ownerId)
  if (!store) { store = createStore(vacio()); stores.set(ownerId, store) }
  return store
}
const ambitoVacio = (parentId: string | null): Ambito => ({ parentId, base: [], actual: [], cargado: false })
export const useMosaicosEdicion = (ownerId: string | null) => useStore(ownerId ? storeDe(ownerId) : sinOwner, s => s)
export const leerMosaicosEdicion = (ownerId: string) => storeDe(ownerId).get()
export const resolverIdVitrina = (ownerId: string, id: string) => storeDe(ownerId).get().alias[id] ?? id
export function buscarVitrinaEdicion(ownerId: string, id: string): Showcase | null {
  const real = resolverIdVitrina(ownerId, id)
  return Object.values(storeDe(ownerId).get().ambitos).flatMap(a => a.actual).find(v => v.id === real) ?? null
}
export const mosaicoDeEdicion = (estado: Edicion, parentId: string | null) => estado.ambitos[clave(parentId)]
export const cambioMosaicosEdicion = (estado: Edicion) => Object.keys(estado.errores).length > 0 || Object.values(estado.ambitos).some(a => !iguales(a.base, a.actual))
function padresQuitados(estado: Edicion) {
  const raiz = estado.ambitos.__raiz
  return new Set(raiz?.base.filter(v => v.kind === 'subspace' && !raiz.actual.some(a => a.id === v.id)).map(v => v.id) ?? [])
}
export function validarMosaicosEdicion(ownerId: string) {
  const estado = storeDe(ownerId).get(), quitados = padresQuitados(estado)
  const ocultas = new Set(Object.values(estado.ambitos).filter(a => a.parentId && quitados.has(a.parentId)).flatMap(a => a.actual.map(v => v.id)))
  return Object.entries(estado.errores).find(([id]) => !ocultas.has(id))?.[1] ?? null
}

/** Releer no elimina contenidos, orden, altas ni bajas del borrador global. */
export async function cargarMosaicoEdicion(ownerId: string, parentId: string | null) {
  const store = storeDe(ownerId), inicial = store.get()
  const realParent = parentId ? resolverIdVitrina(ownerId, parentId) : null
  const nuevas = realParent && esVitrinaTemporal(realParent) ? [] : await listShowcases(ownerId, realParent)
  if (stores.get(ownerId) !== store || store.get().ocupado || store.get().version !== inicial.version) return
  store.set(prev => {
    const anterior = prev.ambitos[clave(parentId)] ?? ambitoVacio(parentId)
    // Una lectura iniciada antes de descartar/guardar no puede revivir cambios.
    if (inicial !== prev && !prev.ambitos[clave(parentId)] && inicial.ambitos[clave(parentId)]) return {}
    const conAltas = [...nuevas, ...anterior.actual.filter(v => esVitrinaTemporal(v.id) && !nuevas.some(n => n.id === v.id))]
    const actual = reconciliarMosaico(anterior.base, anterior.actual, conAltas).map(v => {
      const local = anterior.actual.find(l => l.id === v.id), base = anterior.base.find(b => b.id === v.id)
      return local && base && !iguales({ ...local, ancho: base.ancho }, base) ? { ...local, ancho: v.ancho } : v
    })
    return { ambitos: { ...prev.ambitos, [clave(parentId)]: { parentId, base: nuevas, actual, cargado: true } } }
  })
}
export function editarMosaicoEdicion(ownerId: string, parentId: string | null, actualizar: Showcase[] | ((actual: Showcase[]) => Showcase[])) {
  const store = storeDe(ownerId)
  if (store.get().ocupado) return
  store.set(prev => {
    const antes = prev.ambitos[clave(parentId)] ?? ambitoVacio(parentId)
    const actual = typeof actualizar === 'function' ? actualizar(antes.actual) : actualizar
    const errores = { ...prev.errores }, ambitos = { ...prev.ambitos }
    for (const v of antes.actual) if (!actual.some(a => a.id === v.id)) {
      delete errores[v.id]
      if (v.kind === 'subspace' && esVitrinaTemporal(v.id)) {
        for (const hijo of ambitos[clave(v.id)]?.actual ?? []) delete errores[hijo.id]
        delete ambitos[clave(v.id)]
      }
    }
    return { errores, ambitos: { ...ambitos, [clave(parentId)]: { ...antes, actual } } }
  })
}

/** Se llama con cada edición; sólo cambia memoria, también para piezas incompletas. */
export function ponerVitrinaEdicion(ownerId: string, borrador: Borrador, temporal: string, original: Borrador | null, completa: boolean): string {
  const store = storeDe(ownerId), id = resolverIdVitrina(ownerId, borrador.id ?? temporal)
  if (store.get().ocupado) return id
  const parentId = borrador.parentId
  store.set(prev => {
    const antes = prev.ambitos[clave(parentId)] ?? ambitoVacio(parentId)
    const errores = { ...prev.errores }
    if (completa) delete errores[id]
    else errores[id] = 'Completá el contenido de la vitrina antes de guardar el perfil.'
    const base = [...antes.base]
    if (original?.id && original.contenido && !base.some(v => v.id === id)) {
      base.push({ ...original.contenido, id, ancho: original.ancho, estilo: original.estilo } as Showcase)
    }
    let actual = antes.actual
    if (borrador.contenido) {
      const pieza = { ...borrador.contenido, id, ancho: borrador.ancho, estilo: borrador.estilo } as Showcase
      actual = actual.some(v => v.id === id) ? actual.map(v => v.id === id ? pieza : v) : [...actual, pieza]
    }
    return { errores, ambitos: { ...prev.ambitos, [clave(parentId)]: { ...antes, base, actual } } }
  })
  return id
}

/** Restablecer se invoca desde el editor central, nunca desde una subpantalla. */
export function restablecerMosaicosEdicion(ownerId: string) {
  const store = storeDe(ownerId)
  if (store.get().ocupado) return
  store.set(prev => ({ version: prev.version + 1, errores: {}, ambitos: Object.fromEntries(Object.entries(prev.ambitos)
    .filter(([, a]) => !a.parentId || !esVitrinaTemporal(resolverIdVitrina(ownerId, a.parentId)))
    .map(([key, a]) => [key, { ...a, actual: a.base }])) }))
}

/** Cada éxito se reconoce en memoria antes del siguiente await: reintentar no duplica altas confirmadas. */
export async function guardarMosaicosEdicion(ownerId: string) {
  const store = storeDe(ownerId)
  if (store.get().ocupado) throw new Error('El mosaico ya se está guardando.')
  const error = validarMosaicosEdicion(ownerId)
  if (error) throw new Error(error)
  const vigente = () => {
    if (stores.get(ownerId) !== store) throw new Error('La sesión de edición del mosaico terminó.')
  }
  store.set(prev => ({ ocupado: true, version: prev.version + 1 }))
  try {
    const quitados = padresQuitados(store.get())
    const keys = Object.keys(store.get().ambitos).sort((a, b) => a === b ? 0 : a === '__raiz' ? -1 : b === '__raiz' ? 1 : 0)
    for (const key of keys) {
      vigente()
      const ambito = store.get().ambitos[key]
      // Si se quitó el padre, sus contenidos también se descartan con él.
      if (ambito.parentId && quitados.has(ambito.parentId)) {
        store.set(prev => {
          const ambitos = { ...prev.ambitos }, errores = { ...prev.errores }
          delete ambitos[key]
          for (const v of ambito.actual) delete errores[v.id]
          return { ambitos, errores }
        })
        continue
      }
      for (const pieza of [...ambito.actual]) {
        vigente()
        if (esVitrinaTemporal(pieza.id)) {
          const parentId = ambito.parentId ? resolverIdVitrina(ownerId, ambito.parentId) : null
          const reservado = store.get().altas[pieza.id] ?? idParaAlta()
          store.set(prev => ({ altas: { ...prev.altas, [pieza.id]: reservado } }))
          const id = await addShowcase(ownerId, pieza.kind, payloadDe(pieza), pieza.ancho, pieza.estilo, parentId, reservado)
          vigente()
          store.set(prev => {
            const actual = prev.ambitos[key], nueva = { ...pieza, id }
            return { alias: { ...prev.alias, [pieza.id]: id }, ambitos: { ...prev.ambitos,
              [key]: { ...actual, actual: actual.actual.map(v => v.id === pieza.id ? nueva : v), base: [...actual.base, nueva] } } }
          })
        } else {
          const base = store.get().ambitos[key].base.find(v => v.id === pieza.id)
          if (!iguales(base, pieza)) {
            await updateShowcase(pieza.id, { payload: payloadDe(pieza), ancho: pieza.ancho, estilo: pieza.estilo })
            vigente()
            store.set(prev => { const a = prev.ambitos[key]; return { ambitos: { ...prev.ambitos,
              [key]: { ...a, base: a.base.some(v => v.id === pieza.id) ? a.base.map(v => v.id === pieza.id ? pieza : v) : [...a.base, pieza] } } } })
          }
        }
      }
      const despues = store.get().ambitos[key]
      if (!iguales(despues.base.map(v => v.id), despues.actual.map(v => v.id))) await reorderShowcases(despues.actual.map(v => v.id))
      vigente()
      for (const v of despues.base) if (!despues.actual.some(a => a.id === v.id)) {
        vigente()
        await removeShowcase(v.id)
        vigente()
        store.set(prev => { const a = prev.ambitos[key]; return { ambitos: { ...prev.ambitos, [key]: { ...a, base: a.base.filter(b => b.id !== v.id) } } } })
      }
      store.set(prev => { const a = prev.ambitos[key]; return { ambitos: { ...prev.ambitos, [key]: { ...a, base: a.actual } } } })
    }
  } finally { store.set({ ocupado: false }) }
}

export function borradorVitrinaCompleto(b: Borrador): boolean {
  const c = b.contenido
  if (!c) return false
  if (c.kind === 'texto') return !!c.texto.trim()
  if (c.kind === 'encabezado' || c.kind === 'subspace') return !!c.titulo.trim()
  if (c.kind === 'letra') return !!c.letra.texto.trim() && !!(c.letra.title || c.letra.artist)
  return true
}

/** Fin de la sesión: no deja borradores ni suscripciones asociados a la próxima edición. */
export function terminarMosaicosEdicion(ownerId: string) {
  const store = stores.get(ownerId)
  if (!store) return
  store.set({ ...vacio(), version: store.get().version + 1 })
  stores.delete(ownerId)
}
