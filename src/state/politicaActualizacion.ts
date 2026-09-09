import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState, Platform } from 'react-native'
import { createStore, useStore } from './store'
import { consultarPolitica } from '../services/actualizacionesRemotas'
import { obtenerInstalacion } from '../services/instalacionActual'
import { claveAviso, evaluarPolitica, leerPolitica, type Instalacion, type PoliticaActualizacion } from '../services/politicaActualizacion'

const CACHE = 'dmusic.update-policy.v1'
const DESCARTE = 'dmusic.update-dismissal.v1'
export const INTERVALO_POLITICA_MS = 15 * 60 * 1000
const store = createStore({
  instalacion: null as Instalacion | null,
  politica: null as PoliticaActualizacion | null,
  descartada: null as string | null,
  consultando: false, iniciada: false, error: null as string | null,
})
let enCurso: Promise<void> | null = null
let hidratada = false
// Serializa escrituras para que una respuesta vieja no sobrescriba una revocación.
let escritura = Promise.resolve()
function persistir(key: string, value: string | null) {
  escritura = escritura.then(() => value === null ? AsyncStorage.removeItem(key) : AsyncStorage.setItem(key, value)).catch(() => {})
}
async function leerConPlazo(key: string): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([AsyncStorage.getItem(key), new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 1500) })])
  } finally { clearTimeout(timer) }
}
export function refrescarPolitica(): Promise<void> {
  if (enCurso) return enCurso
  store.set({ consultando: true })
  enCurso = (async () => {
    try {
      const instalacion = store.get().instalacion ?? await obtenerInstalacion()
      store.set({ instalacion })
      if (!hidratada) {
        const [cache, descartada] = await Promise.all([leerConPlazo(CACHE).catch(() => null), leerConPlazo(DESCARTE).catch(() => null)])
        let politica: PoliticaActualizacion | null = null
        try { politica = cache ? leerPolitica(JSON.parse(cache)) : null } catch { /* Caché inválida no impone una política. */ }
        store.set({ politica: politica?.platform === instalacion.platform ? politica : null, descartada })
        hidratada = true
      }
      // La red no prolonga el splash ni desmonta Chrome durante una reconsulta.
      store.set({ iniciada: true })
      const politica = await consultarPolitica(instalacion.platform)
      store.set({ politica, error: null })
      persistir(CACHE, politica ? JSON.stringify(politica) : null)
    } catch (e) {
      // Nunca quitar un bloqueo conocido por timeout, logout o respuesta malformada.
      store.set({ error: e instanceof Error ? e.message : 'No se pudo consultar la política.' })
    } finally {
      store.set({ consultando: false, iniciada: true })
      enCurso = null
    }
  })()
  return enCurso
}
export function descartarPolitica(): void {
  const s = store.get()
  if (evaluarPolitica(s.politica, s.instalacion, s.descartada) !== 'opcional' || !s.politica) return
  const descartada = claveAviso(s.politica)
  store.set({ descartada })
  persistir(DESCARTE, descartada)
}

let consumidores = 0
let detener: (() => void) | undefined
/** Un solo arranque, listener y reloj incluso con StrictMode o múltiples lectores. */
export function iniciarPoliticaActualizacion(): () => void {
  consumidores++
  if (consumidores === 1) {
    void refrescarPolitica()
    const activo = () => Platform.OS === 'web' ? globalThis.document?.visibilityState !== 'hidden' : AppState.currentState === 'active'
    const reanudar = () => { if (activo()) void refrescarPolitica() }
    const timer = setInterval(reanudar, INTERVALO_POLITICA_MS)
    const sub = AppState.addEventListener('change', state => { if (state === 'active') void refrescarPolitica() })
    if (Platform.OS === 'web') {
      globalThis.document?.addEventListener('visibilitychange', reanudar)
      globalThis.addEventListener?.('focus', reanudar)
      globalThis.addEventListener?.('online', reanudar)
    }
    detener = () => {
      clearInterval(timer); sub.remove()
      if (Platform.OS === 'web') {
        globalThis.document?.removeEventListener('visibilitychange', reanudar)
        globalThis.removeEventListener?.('focus', reanudar)
        globalThis.removeEventListener?.('online', reanudar)
      }
    }
  }
  let cerrado = false
  return () => { if (!cerrado) { cerrado = true; if (--consumidores === 0) { detener?.(); detener = undefined } } }
}
export const usePoliticaActualizacion = () => useStore(store, s => s)
