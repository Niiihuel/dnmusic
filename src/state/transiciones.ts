import AsyncStorage from '@react-native-async-storage/async-storage'
import { createStore, useStore } from './store'

/** Preferencia de reproducción musical local. Un Mix publicado puede reemplazarla. */
export type ModoTransicionGlobal = 'normal' | 'sin-pausa' | 'crossfade'
export type TransicionesGlobales = {
  cargado: boolean
  modo: ModoTransicionGlobal
  segundos: number
}

const CLAVE = 'transiciones-musica:v1'
const store = createStore<TransicionesGlobales>({ cargado: false, modo: 'normal', segundos: 4 })
let carga: Promise<void> | null = null
let revision = 0
let escritura = Promise.resolve()

const modoValido = (valor: unknown): ModoTransicionGlobal =>
  valor === 'crossfade' || valor === 'sin-pausa' ? valor : 'normal'

const segundosValidos = (valor: unknown) =>
  typeof valor === 'number' && Number.isFinite(valor)
    ? Math.max(1, Math.min(12, Math.round(valor * 2) / 2))
    : 4

export function cargarTransicionesGlobales(): Promise<void> {
  if (carga) return carga
  const alComenzar = revision
  carga = (async () => {
    try {
      const raw = await AsyncStorage.getItem(CLAVE)
      if (raw && revision === alComenzar) {
        const parsed = JSON.parse(raw) as Record<string, unknown>
        store.set({ modo: modoValido(parsed.modo), segundos: segundosValidos(parsed.segundos) })
      }
    } catch {
      // Una preferencia dañada no impide escuchar música.
    } finally {
      store.set({ cargado: true })
    }
  })()
  return carga
}

function guardar() {
  revision++
  const { modo, segundos } = store.get()
  escritura = escritura.then(() => AsyncStorage.setItem(CLAVE, JSON.stringify({ modo, segundos }))).catch(() => {})
}

export function setModoTransicionGlobal(modo: ModoTransicionGlobal) {
  if (store.get().modo === modo) return
  store.set({ modo })
  guardar()
}

export function setSegundosCrossfade(segundos: number) {
  if (!Number.isFinite(segundos)) return
  const valor = segundosValidos(segundos)
  if (store.get().segundos === valor) return
  store.set({ segundos: valor })
  guardar()
}

export const leerTransicionesGlobales = () => store.get()
export const useTransicionesGlobales = () => useStore(store, s => s)
