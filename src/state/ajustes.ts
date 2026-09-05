import AsyncStorage from '@react-native-async-storage/async-storage'
import { createStore, useStore } from './store'

/** Preferencias de este dispositivo; sobreviven al cierre de sesión. */
type Ajustes = {
  autoplay: boolean
  soloWifi: boolean
  ayudasCursor: boolean
  novedadesAlAbrir: boolean
  avisosActualizacion: boolean
}
const POR_DEFECTO: Ajustes = {
  autoplay: true,
  soloWifi: true,
  ayudasCursor: true,
  novedadesAlAbrir: true,
  avisosActualizacion: true,
}
const CLAVE = 'ajustes:v1'
const store = createStore<Ajustes>({ ...POR_DEFECTO })
const carga = createStore({ lista: false })
let escritura = Promise.resolve()
const modificados = new Set<keyof Ajustes>()

export async function cargarAjustes() {
  try {
    const crudo = await AsyncStorage.getItem(CLAVE)
    const guardado: unknown = crudo ? JSON.parse(crudo) : null
    if (!guardado || typeof guardado !== 'object') return
    const valores = { ...store.get() }
    for (const clave of Object.keys(POR_DEFECTO) as (keyof Ajustes)[]) {
      const valor = (guardado as Record<string, unknown>)[clave]
      if (!modificados.has(clave) && typeof valor === 'boolean') valores[clave] = valor
    }
    store.set(valores)
  } catch {
    // Una preferencia ilegible no impide escuchar.
  } finally {
    carga.set({ lista: true })
  }
}

export function setPreferencia(clave: keyof Ajustes, valor: boolean) {
  modificados.add(clave)
  store.set({ [clave]: valor })
  const datos = JSON.stringify(store.get())
  // Mantener el orden aunque se cambien varios interruptores rápidamente.
  escritura = escritura.then(() => AsyncStorage.setItem(CLAVE, datos)).catch(() => {})
}
export const setAutoplay = (valor: boolean) => setPreferencia('autoplay', valor)
export const setSoloWifi = (valor: boolean) => setPreferencia('soloWifi', valor)
export const useAjustes = () => useStore(store, (s) => s)
export const usePreferencia = (clave: keyof Ajustes) => useStore(store, (s) => s[clave])
export const useAjustesCargados = () => useStore(carga, (s) => s.lista)
export const leerAjustes = () => store.get()
