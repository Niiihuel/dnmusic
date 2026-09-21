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

const limitar = (valor: unknown) => Number.isFinite(valor) ? Math.max(GANANCIA_EQ_MIN, Math.min(GANANCIA_EQ_MAX, Number(valor))) : 0
const curvaValida = (valor: unknown): number[] | null => Array.isArray(valor) && valor.length === FRECUENCIAS_EQ.length ? valor.map(limitar) : null

function guardar() {
  const { activo, preset, ganancias } = store.get()
  const datos = JSON.stringify({ activo, preset, ganancias })
  escritura = escritura.then(() => AsyncStorage.setItem(CLAVE, datos)).catch(() => {})
}

export function cargarEcualizador(): Promise<void> {
  if (carga) return carga
  carga = (async () => {
    try {
      const crudo = await AsyncStorage.getItem(CLAVE)
      const dato = crudo ? JSON.parse(crudo) as Record<string, unknown> : null
      const ganancias = curvaValida(dato?.ganancias)
      if (dato && ganancias) {
        const preset = typeof dato.preset === 'string' && (dato.preset in PRESETS_EQ || dato.preset === 'Personalizado')
          ? dato.preset as PresetEcualizador : 'Personalizado'
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
  store.set({ activo })
  guardar()
}

export function elegirPresetEcualizador(preset: keyof typeof PRESETS_EQ) {
  store.set({ preset, ganancias: [...PRESETS_EQ[preset]] })
  guardar()
}

export function setGananciaEcualizador(indice: number, ganancia: number) {
  if (indice < 0 || indice >= FRECUENCIAS_EQ.length) return
  const ganancias = [...store.get().ganancias]
  ganancias[indice] = limitar(ganancia)
  store.set({ preset: 'Personalizado', ganancias })
  guardar()
}

export function restablecerEcualizador() {
  store.set({ preset: 'Plano', ganancias: [...PRESETS_EQ.Plano] })
  guardar()
}

export const useEcualizador = () => useStore(store, estado => estado)
export const leerEcualizador = () => store.get()

