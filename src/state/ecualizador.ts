import AsyncStorage from '@react-native-async-storage/async-storage'
import { createStore, useStore } from './store'

export const FRECUENCIAS_EQ = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const
export const GANANCIA_EQ_MIN = -12
export const GANANCIA_EQ_MAX = 12

export const PRESETS_EQ = {
  Plano: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  Graves: [6, 5, 4, 2, 0, -1, -2, -2, -1, 0],
  Agudos: [-2, -2, -1, 0, 1, 2, 3, 4, 5, 6],
  Vocal: [-3, -2, -1, 1, 3, 4, 4, 2, 0, -2],
  Electrónica: [5, 4, 1, 0, -2, -1, 1, 3, 5, 4],
  Rock: [4, 3, 1, -1, -2, 1, 3, 4, 4, 3],
  Acústico: [2, 2, 1, 0, 1, 3, 4, 3, 2, 1],
} as const satisfies Record<string, readonly number[]>

export type PresetEcualizador = keyof typeof PRESETS_EQ | 'Personalizado'
type EstadoEcualizador = {
  cargado: boolean
  activo: boolean
  preset: PresetEcualizador
  ganancias: number[]
}

const CLAVE = 'ecualizador:v1'
const store = createStore<EstadoEcualizador>({ cargado: false, activo: false, preset: 'Plano', ganancias: [...PRESETS_EQ.Plano] })
let carga: Promise<void> | null = null
let escritura = Promise.resolve()
let pendiente: string | null = null
let temporizador: ReturnType<typeof setTimeout> | null = null
let revision = 0

const limitar = (valor: unknown) => Number.isFinite(valor) ? Math.max(GANANCIA_EQ_MIN, Math.min(GANANCIA_EQ_MAX, Number(valor))) : 0
const curvaValida = (valor: unknown): number[] | null => Array.isArray(valor) && valor.length === FRECUENCIAS_EQ.length ? valor.map(limitar) : null

/** Coalesce slider events; never queue one disk write per audio/UI frame. */
function guardar() {
  revision++
  const { activo, preset, ganancias } = store.get()
  pendiente = JSON.stringify({ activo, preset, ganancias })
  if (temporizador) clearTimeout(temporizador)
  temporizador = setTimeout(() => { void guardarEcualizadorAhora() }, 200)
}

export function guardarEcualizadorAhora(): Promise<void> {
  if (temporizador) clearTimeout(temporizador)
  temporizador = null
  if (pendiente === null) return escritura
  const datos = pendiente
  pendiente = null
  escritura = escritura.then(() => AsyncStorage.setItem(CLAVE, datos)).catch(() => {})
  return escritura
}

export function cargarEcualizador(): Promise<void> {
  if (carga) return carga
  const alComenzar = revision
  carga = (async () => {
    try {
      const crudo = await AsyncStorage.getItem(CLAVE)
      const dato = crudo ? JSON.parse(crudo) as Record<string, unknown> : null
      const ganancias = curvaValida(dato?.ganancias)
      if (dato && ganancias && alComenzar === 0 && revision === alComenzar) {
        const preset = reconocerPreset(ganancias)
        store.set({ activo: dato.activo === true, preset, ganancias })
      }
    } catch {
      // Una preferencia corrupta no impide reproducir: el ecualizador queda plano y apagado.
    } finally {
      store.set({ cargado: true })
    }
  })()
  return carga
}

export function setEcualizadorActivo(activo: boolean) {
  if (store.get().activo === activo) return
  store.set({ activo })
  guardar()
  void guardarEcualizadorAhora()
}

export function elegirPresetEcualizador(preset: keyof typeof PRESETS_EQ) {
  if (!Object.hasOwn(PRESETS_EQ, preset)) return
  store.set({ preset, ganancias: [...PRESETS_EQ[preset]] })
  guardar()
  void guardarEcualizadorAhora()
}

export function setGananciaEcualizador(indice: number, ganancia: number) {
  if (!Number.isInteger(indice) || indice < 0 || indice >= FRECUENCIAS_EQ.length || !Number.isFinite(ganancia)) return
  const ganancias = [...store.get().ganancias]
  const valor = Math.round(limitar(ganancia) * 2) / 2
  if (ganancias[indice] === valor) return
  ganancias[indice] = valor
  store.set({ preset: reconocerPreset(ganancias), ganancias })
  guardar()
}

export function restablecerEcualizador() {
  elegirPresetEcualizador('Plano')
}

function reconocerPreset(ganancias: number[]): PresetEcualizador {
  return (Object.keys(PRESETS_EQ) as (keyof typeof PRESETS_EQ)[]).find(
    nombre => PRESETS_EQ[nombre].every((valor, indice) => valor === ganancias[indice]),
  ) ?? 'Personalizado'
}

type SoporteEcualizador = 'desconocido' | 'disponible' | 'no-disponible' | 'error'
const soporte = createStore<{ estado: SoporteEcualizador }>({ estado: 'desconocido' })
export const informarSoporteEcualizador = (estado: SoporteEcualizador) => soporte.set({ estado })
export function reintentarEcualizador() {
  informarSoporteEcualizador('desconocido')
  store.set({ ganancias: [...store.get().ganancias] })
}
export const useSoporteEcualizador = () => useStore(soporte, s => s.estado)
export const useResumenEcualizador = () => useStore(store, s => s.activo ? s.preset : 'Desactivado')

export const useEcualizador = () => useStore(store, estado => estado)
export const leerEcualizador = () => store.get()
