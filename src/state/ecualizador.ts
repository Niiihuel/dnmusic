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
export type PresetPersonalEcualizador = { id: string; nombre: string; ganancias: number[] }
type CurvaSeleccionada = { preset: PresetEcualizador; presetPersonalId: string | null; ganancias: number[] }
type ComparacionEcualizador = { seleccion: 'A' | 'B'; origen: CurvaSeleccionada; A: CurvaSeleccionada; B: CurvaSeleccionada }
type EstadoEcualizador = CurvaSeleccionada & {
  cargado: boolean
  activo: boolean
  presetsPersonales: PresetPersonalEcualizador[]
  /** Solo vive en memoria. El motor oye las ganancias del slot seleccionado. */
  comparacion: ComparacionEcualizador | null
}

// El formato existente conserva su clave y sus tres campos para instalaciones anteriores.
const CLAVE = 'ecualizador:v1'
const CLAVE_PRESETS = 'ecualizador:presets:v1'
const MAX_PRESETS = 50
const MAX_NOMBRE = 40
const store = createStore<EstadoEcualizador>({
  cargado: false, activo: false, preset: 'Plano', presetPersonalId: null,
  ganancias: [...PRESETS_EQ.Plano], presetsPersonales: [], comparacion: null,
})
let carga: Promise<void> | null = null
let escritura = Promise.resolve()
let pendiente: string | null = null
let pendientePresets: string | null = null
let temporizador: ReturnType<typeof setTimeout> | null = null
let revision = 0
let revisionPresets = 0

const limitar = (valor: unknown) => Number.isFinite(valor) ? Math.max(GANANCIA_EQ_MIN, Math.min(GANANCIA_EQ_MAX, Number(valor))) : 0
const curvaValida = (valor: unknown): number[] | null => Array.isArray(valor) && valor.length === FRECUENCIAS_EQ.length ? valor.map(limitar) : null
const mismasGanancias = (a: readonly number[], b: readonly number[]) => a.every((valor, indice) => valor === b[indice])

function reconocerPreset(ganancias: number[]): PresetEcualizador {
  return (Object.keys(PRESETS_EQ) as (keyof typeof PRESETS_EQ)[]).find(
    nombre => mismasGanancias(PRESETS_EQ[nombre], ganancias),
  ) ?? 'Personalizado'
}

function curvaActual(): CurvaSeleccionada {
  const { preset, presetPersonalId, ganancias } = store.get()
  return { preset, presetPersonalId, ganancias: [...ganancias] }
}

function aplicarCurva(curva: CurvaSeleccionada) {
  const comparacion = store.get().comparacion
  const copia = { ...curva, ganancias: [...curva.ganancias] }
  if (comparacion) {
    store.set({ ...copia, comparacion: { ...comparacion, [comparacion.seleccion]: copia } })
  } else {
    const personalAnterior = store.get().presetPersonalId
    store.set(copia)
    guardar()
    if (personalAnterior !== copia.presetPersonalId) guardarCatalogo()
  }
}

function programarGuardado() {
  if (temporizador) clearTimeout(temporizador)
  temporizador = setTimeout(() => { void guardarEcualizadorAhora() }, 200)
}

/** Coalesce slider events; never queue one disk write per audio/UI frame. */
function guardar() {
  revision++
  const { activo, preset, ganancias } = store.get()
  pendiente = JSON.stringify({ activo, preset, ganancias })
  programarGuardado()
}

function guardarCatalogo() {
  revisionPresets++
  const { presetPersonalId, presetsPersonales } = store.get()
  pendientePresets = JSON.stringify({ seleccionado: presetPersonalId, presets: presetsPersonales })
  programarGuardado()
}

export function guardarEcualizadorAhora(): Promise<void> {
  if (temporizador) clearTimeout(temporizador)
  temporizador = null
  if (pendiente === null && pendientePresets === null) return escritura
  const datos = pendiente, catalogo = pendientePresets
  pendiente = null
  pendientePresets = null
  escritura = escritura.then(async () => {
    if (datos !== null) await AsyncStorage.setItem(CLAVE, datos)
    if (catalogo !== null) await AsyncStorage.setItem(CLAVE_PRESETS, catalogo)
  }).catch(() => {})
  return escritura
}

function leerCatalogo(crudo: string | null): { presets: PresetPersonalEcualizador[]; seleccionado: string | null } {
  if (!crudo) return { presets: [], seleccionado: null }
  const dato = JSON.parse(crudo) as Record<string, unknown>
  const vistosId = new Set<string>(), vistosNombre = new Set<string>()
  const presets: PresetPersonalEcualizador[] = []
  if (Array.isArray(dato.presets)) for (const item of dato.presets) {
    if (!item || typeof item !== 'object') continue
    const entrada = item as Record<string, unknown>
    const id = typeof entrada.id === 'string' ? entrada.id : ''
    const nombre = typeof entrada.nombre === 'string' ? entrada.nombre.trim() : ''
    const ganancias = curvaValida(entrada.ganancias)
    const clave = nombre.toLocaleLowerCase()
    if (!id || !nombre || nombre.length > MAX_NOMBRE || !ganancias || vistosId.has(id) || vistosNombre.has(clave)) continue
    vistosId.add(id); vistosNombre.add(clave)
    presets.push({ id, nombre, ganancias })
    if (presets.length === MAX_PRESETS) break
  }
  return { presets, seleccionado: typeof dato.seleccionado === 'string' ? dato.seleccionado : null }
}

export function cargarEcualizador(): Promise<void> {
  if (carga) return carga
  const alComenzar = revision, catalogoAlComenzar = revisionPresets
  carga = (async () => {
    const [curvaGuardada, catalogoGuardado] = await Promise.allSettled([
      AsyncStorage.getItem(CLAVE), AsyncStorage.getItem(CLAVE_PRESETS),
    ])
    if (curvaGuardada.status === 'fulfilled') {
      try {
        const dato = curvaGuardada.value ? JSON.parse(curvaGuardada.value) as Record<string, unknown> : null
        const ganancias = curvaValida(dato?.ganancias)
        if (dato && ganancias && alComenzar === revision) {
          store.set({ activo: dato.activo === true, preset: reconocerPreset(ganancias), ganancias })
        }
      } catch { /* Una preferencia corrupta no impide reproducir. */ }
    }
    if (catalogoGuardado.status === 'fulfilled' && catalogoAlComenzar === revisionPresets) {
      try {
        const { presets, seleccionado } = leerCatalogo(catalogoGuardado.value)
        const personal = presets.find(item => item.id === seleccionado)
        const seleccionadoValido = alComenzar === revision && personal && mismasGanancias(personal.ganancias, store.get().ganancias)
        store.set({ presetsPersonales: presets, presetPersonalId: seleccionadoValido ? personal.id : null })
      } catch { /* Un catálogo corrupto se ignora sin afectar la curva activa. */ }
    }
    store.set({ cargado: true })
  })()
  return carga
}

export function setEcualizadorActivo(activo: boolean) {
  if (store.get().activo === activo) return
  if (store.get().comparacion) cancelarComparacionEcualizador()
  store.set({ activo })
  guardar()
  void guardarEcualizadorAhora()
}

export function elegirPresetEcualizador(preset: keyof typeof PRESETS_EQ) {
  if (!Object.hasOwn(PRESETS_EQ, preset)) return
  aplicarCurva({ preset, presetPersonalId: null, ganancias: [...PRESETS_EQ[preset]] })
  if (!store.get().comparacion) void guardarEcualizadorAhora()
}

export function elegirPresetPersonalEcualizador(id: string) {
  const personal = store.get().presetsPersonales.find(item => item.id === id)
  if (!personal) return
  aplicarCurva({ preset: 'Personalizado', presetPersonalId: id, ganancias: personal.ganancias })
  if (!store.get().comparacion) void guardarEcualizadorAhora()
}

export function setGananciaEcualizador(indice: number, ganancia: number) {
  if (!Number.isInteger(indice) || indice < 0 || indice >= FRECUENCIAS_EQ.length || !Number.isFinite(ganancia)) return
  const ganancias = [...store.get().ganancias]
  const valor = Math.round(limitar(ganancia) * 2) / 2
  if (ganancias[indice] === valor) return
  ganancias[indice] = valor
  const personalId = store.get().presetPersonalId
  const personal = store.get().presetsPersonales.find(item => item.id === personalId)
  aplicarCurva({ preset: reconocerPreset(ganancias), presetPersonalId: personal && mismasGanancias(personal.ganancias, ganancias) ? personal.id : null, ganancias })
}

export function restablecerEcualizador() { elegirPresetEcualizador('Plano') }

function validarNombre(nombre: string, exceptoId?: string): string | null {
  const limpio = nombre.trim()
  if (!limpio) return 'Escribí un nombre.'
  if (limpio.length > MAX_NOMBRE) return `Usá hasta ${MAX_NOMBRE} caracteres.`
  const clave = limpio.toLocaleLowerCase()
  if ([...Object.keys(PRESETS_EQ), 'Personalizado'].some(item => item.toLocaleLowerCase() === clave) ||
    store.get().presetsPersonales.some(item => item.id !== exceptoId && item.nombre.toLocaleLowerCase() === clave)) {
    return 'Ya existe un preajuste con ese nombre.'
  }
  return null
}

/** Devuelve un mensaje cuando el nombre no puede guardarse; null al completar. */
export function crearPresetPersonalEcualizador(nombre: string): string | null {
  if (store.get().comparacion) return 'Terminá la comparación antes de guardar.'
  const error = validarNombre(nombre)
  if (error) return error
  if (store.get().presetsPersonales.length >= MAX_PRESETS) return `Podés guardar hasta ${MAX_PRESETS} preajustes.`
  const id = `eq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
  const nuevo = { id, nombre: nombre.trim(), ganancias: [...store.get().ganancias] }
  store.set({ presetsPersonales: [...store.get().presetsPersonales, nuevo], presetPersonalId: id })
  guardarCatalogo()
  void guardarEcualizadorAhora()
  return null
}

export function renombrarPresetPersonalEcualizador(id: string, nombre: string): string | null {
  if (store.get().comparacion) return 'Terminá la comparación antes de renombrar.'
  if (!store.get().presetsPersonales.some(item => item.id === id)) return 'El preajuste ya no existe.'
  const error = validarNombre(nombre, id)
  if (error) return error
  store.set({ presetsPersonales: store.get().presetsPersonales.map(item => item.id === id ? { ...item, nombre: nombre.trim() } : item) })
  guardarCatalogo()
  void guardarEcualizadorAhora()
  return null
}

export function eliminarPresetPersonalEcualizador(id: string) {
  if (store.get().comparacion) return
  const { presetsPersonales, presetPersonalId, ganancias } = store.get()
  if (!presetsPersonales.some(item => item.id === id)) return
  const seleccionado = presetPersonalId === id
  store.set({
    presetsPersonales: presetsPersonales.filter(item => item.id !== id),
    ...(seleccionado ? { presetPersonalId: null, preset: reconocerPreset(ganancias) } : {}),
  })
  guardarCatalogo()
  if (seleccionado) guardar()
  void guardarEcualizadorAhora()
}

export function iniciarComparacionEcualizador() {
  if (!store.get().cargado || !store.get().activo || store.get().comparacion) return
  void guardarEcualizadorAhora()
  const original = curvaActual()
  store.set({ comparacion: {
    seleccion: 'B', origen: original,
    A: { ...original, ganancias: [...original.ganancias] },
    B: { ...original, ganancias: [...original.ganancias] },
  } })
}

export function seleccionarComparacionEcualizador(seleccion: 'A' | 'B') {
  const comparacion = store.get().comparacion
  if (!comparacion || comparacion.seleccion === seleccion) return
  const curva = comparacion[seleccion]
  store.set({ ...curva, ganancias: [...curva.ganancias], comparacion: { ...comparacion, seleccion } })
}

export function usarComparacionEcualizador() {
  const comparacion = store.get().comparacion
  if (!comparacion) return
  const { presetPersonalId } = store.get()
  store.set({ comparacion: null })
  guardar()
  if (presetPersonalId !== comparacion.origen.presetPersonalId) guardarCatalogo()
  void guardarEcualizadorAhora()
}

export function cancelarComparacionEcualizador() {
  const comparacion = store.get().comparacion
  if (!comparacion) return
  store.set({ ...comparacion.origen, ganancias: [...comparacion.origen.ganancias], comparacion: null })
}

export function nombrePresetEcualizador(estado: EstadoEcualizador): string {
  return estado.presetsPersonales.find(item => item.id === estado.presetPersonalId)?.nombre ?? estado.preset
}

type SoporteEcualizador = 'desconocido' | 'disponible' | 'no-disponible' | 'error'
const soporte = createStore<{ estado: SoporteEcualizador }>({ estado: 'desconocido' })
export const informarSoporteEcualizador = (estado: SoporteEcualizador) => soporte.set({ estado })
export function reintentarEcualizador() {
  informarSoporteEcualizador('desconocido')
  store.set({ ganancias: [...store.get().ganancias] })
}
export const useSoporteEcualizador = () => useStore(soporte, s => s.estado)
export const useResumenEcualizador = () => useStore(store, s => s.activo ? nombrePresetEcualizador(s) : 'Desactivado')

export const useEcualizador = () => useStore(store, estado => estado)
export const leerEcualizador = () => store.get()
