import AsyncStorage from '@react-native-async-storage/async-storage'
import { createStore, useStore } from './store'

export type TipoIncidenciaAudio = 'fallo' | 'reintento' | 'recuperado' | 'agotado'
export type EntradaIncidenciaAudio = {
  tipo: TipoIncidenciaAudio
  motivo: string
  enSegundoPlano: boolean
  intento?: number
}
export type IncidenciaAudio = EntradaIncidenciaAudio & { timestamp: number }

type DiagnosticoAudio = { cargado: boolean; incidencias: IncidenciaAudio[]; error: string | null }
const CLAVE = 'diagnostico-audio:v1'
const MAX_INCIDENCIAS = 30
const TIPOS = new Set<TipoIncidenciaAudio>(['fallo', 'reintento', 'recuperado', 'agotado'])
const store = createStore<DiagnosticoAudio>({ cargado: false, incidencias: [], error: null })
let carga: Promise<void> | null = null
let escritura: Promise<void> = Promise.resolve()

/**
 * Nunca persistimos mensajes libres del proveedor: pueden incluir el título,
 * rutas de almacenamiento, nombres de usuario o credenciales en URLs firmadas.
 * Sólo conservamos categorías técnicas y códigos reconocidos. El texto bruto
 * se utiliza durante esta llamada para clasificar y no sale del dispositivo.
 */
export function sanitizarMotivoAudio(motivo: string): string {
  const texto = motivo.slice(0, 12_000)
    .replace(/\b(?:https?|file|content|blob|data):\S+/gi, ' ')
    .replace(/\bBearer\s+\S+/gi, ' ')
    .replace(/\b(?:access[_-]?token|refresh[_-]?token|token|signature|sig|apikey|api[_-]?key|authorization|password)\s*[=:]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, ' ')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, ' ')
  const normal = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const codigoHTTP = texto.match(/\b(?:http(?:\/[\d.]+)?(?:\s+(?:status|error))?|status(?:\s+code)?)\s*[:=]?\s*([45]\d{2})\b/i)?.[1]
  const codigoApple = texto.match(/\b(AVFoundationErrorDomain|NSURLErrorDomain|NSOSStatusErrorDomain)\b\s*(?:[\s:,=-]*code\s*[=:]?\s*)?\s*(-?\d{1,8})\b/i)
  const codigoRed = texto.match(/\b(ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ENETUNREACH|EHOSTUNREACH)\b/)?.[1]
  const codigos = [codigoHTTP ? `HTTP ${codigoHTTP}` : null, codigoApple ? `${codigoApple[1]} ${codigoApple[2]}` : null, codigoRed].filter(Boolean)
  let categoria: string
  if (/buffer-sin-progreso|buffering|stalled|sin (?:avance|progreso)/.test(normal)) categoria = 'Audio sin avance'
  else if (/renovar-fuente|renovacion de la fuente de audio/.test(normal)) categoria = 'Renovación de la fuente de audio'
  else if (/audio[- ]reanudado/.test(normal)) categoria = 'Audio reanudado'
  else if (/reintentos[- ]agotados/.test(normal)) categoria = 'Reintentos agotados'
  else if (/signature|firma|signed|expired|expirad|token|forbidden|unauthori[sz]ed/.test(normal) || codigoHTTP === '401' || codigoHTTP === '403') categoria = 'Acceso o firma del audio rechazados'
  else if (/timed?\s*out|timeout|tiempo de espera|etimedout/.test(normal)) categoria = 'Tiempo de espera agotado'
  else if (/offline|sin (?:red|conexion)|not connected|network.*(?:lost|unavailable)|enetunreach|ehostunreach/.test(normal)) categoria = 'Sin conexión de red'
  else if (/network|internet|connection|conexion|econnreset|econnrefused|enotfound|nsurlerrordomain/.test(normal)) categoria = 'Error de conexión'
  else if (/decod|codec|unsupported|not supported|no compatible|format/.test(normal)) categoria = 'Audio no compatible o no decodificable'
  else if (/not found|no encontrad/.test(normal) || codigoHTTP === '404') categoria = 'Audio no encontrado'
  else if (/interrupted|interrup/.test(normal)) categoria = 'Reproducción interrumpida'
  else if (/load|source|fuente|cargar|playback|reproduc|avfoundation|nsosstatus/.test(normal)) categoria = 'No se pudo reproducir el audio'
  else categoria = 'Incidencia de audio'
  return codigos.length ? `${categoria} (${codigos.join('; ')})` : categoria
}

function entradaValida(valor: unknown): IncidenciaAudio | null {
  if (!valor || typeof valor !== 'object') return null
  const fila = valor as Record<string, unknown>
  if (!TIPOS.has(fila.tipo as TipoIncidenciaAudio) || typeof fila.motivo !== 'string' || typeof fila.enSegundoPlano !== 'boolean'
    || typeof fila.timestamp !== 'number' || !Number.isFinite(fila.timestamp) || fila.timestamp < 0 || fila.timestamp > 8.64e15) return null
  return {
    tipo: fila.tipo as TipoIncidenciaAudio, motivo: sanitizarMotivoAudio(fila.motivo), enSegundoPlano: fila.enSegundoPlano, timestamp: fila.timestamp,
    ...(typeof fila.intento === 'number' && Number.isInteger(fila.intento) && fila.intento >= 0 && fila.intento <= 100 ? { intento: fila.intento } : {}),
  }
}

export function cargarDiagnosticoAudio(): Promise<void> {
  if (!carga) carga = (async () => {
    try {
      const guardado = await AsyncStorage.getItem(CLAVE)
      const datos: unknown = guardado ? JSON.parse(guardado) : []
      if (!Array.isArray(datos)) throw new Error('formato')
      const incidencias = datos.map(entradaValida).filter((fila): fila is IncidenciaAudio => fila !== null).slice(-MAX_INCIDENCIAS)
      store.set({ incidencias, error: null })
      // Retirar también del almacenamiento posibles campos de versiones previas.
      if (guardado && JSON.stringify(incidencias) !== guardado) await AsyncStorage.setItem(CLAVE, JSON.stringify(incidencias))
    } catch {
      store.set({ error: 'No se pudo leer el historial guardado. Los nuevos eventos se mostrarán en esta sesión.' })
    } finally {
      store.set({ cargado: true })
    }
  })()
  return carga
}

/** El motor puede usar `void registrarIncidenciaAudio(...)`: nunca rechaza ni frena la reproducción. */
export function registrarIncidenciaAudio(entrada: EntradaIncidenciaAudio): Promise<void> {
  const fila = entradaValida({ ...entrada, timestamp: Date.now() })
  if (!fila) return Promise.resolve()
  escritura = escritura.then(async () => {
    await cargarDiagnosticoAudio()
    const incidencias = [...store.get().incidencias, fila].slice(-MAX_INCIDENCIAS)
    store.set({ incidencias })
    try {
      await AsyncStorage.setItem(CLAVE, JSON.stringify(incidencias))
      store.set({ error: null })
    } catch {
      store.set({ error: 'No se pudo guardar el historial. Los eventos siguen disponibles mientras la app esté abierta.' })
    }
  }).catch(() => { /* Un diagnóstico nunca interrumpe el motor. */ })
  return escritura
}

/** Se serializa con escrituras y carga: borrar no permite que un evento anterior reaparezca. */
export function limpiarDiagnosticoAudio(): Promise<boolean> {
  const resultado = escritura.then(async () => {
    await cargarDiagnosticoAudio()
    try {
      await AsyncStorage.removeItem(CLAVE)
      store.set({ incidencias: [], error: null })
      return true
    } catch {
      store.set({ error: 'No se pudo borrar el historial del dispositivo. Volvé a intentarlo.' })
      return false
    }
  })
  escritura = resultado.then(() => undefined, () => undefined)
  return resultado.catch(() => false)
}

export const leerDiagnosticoAudio = () => store.get()
export const useDiagnosticoAudio = () => useStore(store, s => s)

export function crearInformeDiagnosticoAudio(): string {
  const lineas = store.get().incidencias.map(fila => [
    new Date(fila.timestamp).toISOString(), fila.tipo, fila.enSegundoPlano ? 'segundo plano' : 'primer plano',
    ...(fila.intento !== undefined ? [`intento ${fila.intento}`] : []), fila.motivo,
  ].join(' | '))
  return ['dnmusic — diagnóstico local de audio', 'Fechas en UTC. Sin títulos, cuentas, URLs ni credenciales.',
    ...(lineas.length ? lineas : ['No hay incidencias registradas.']),
  ].join('\n')
}
