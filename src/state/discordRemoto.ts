import { crearControlDiscordRemoto, type AdaptadorDiscordLocal, type EstadoControlDiscord } from '../services/controlDiscordRemoto'
import { anunciarDiscordEnDispositivos, leerConexionDiscord, mandarControlDiscord, suscribirActividadParaIntegraciones, suscribirControlDiscord } from './escucha'
import { getSession } from './session'
import { createStore, useStore } from './store'

const inicial: EstadoControlDiscord = { dispositivos: [], conexion: 'desconectado', pendiente: null, error: null }
const store = createStore(inicial)
let actual: ReturnType<typeof crearControlDiscordRemoto> | null = null
let limpiarAnterior: (() => void) | null = null

/** Se inicia con la sesión de la app, también en dispositivos sin IPC de Discord. */
export function iniciarDiscordRemoto(userId: string, local?: AdaptadorDiscordLocal & { suscribir: (fn: () => void) => () => void }) {
  limpiarAnterior?.()
  store.set(inicial)
  const control = crearControlDiscordRemoto({ userId, local,
    permitido: () => { const s = getSession(); return s.user?.id === userId && s.access?.status === 'approved' },
    conexion: leerConexionDiscord, enviar: mandarControlDiscord,
    anunciar: estado => anunciarDiscordEnDispositivos(userId, estado),
    notificar: estado => { if (actual === control) store.set(estado) },
  })
  actual = control
  const offMensajes = suscribirControlDiscord(control.recibir)
  const offConexion = suscribirActividadParaIntegraciones(control.actualizar)
  const offLocal = local?.suscribir(control.actualizar)
  control.actualizar()
  // También vigila revocaciones que precedan al cleanup del efecto React.
  const latido = setInterval(control.actualizar, 1000)
  let cerrado = false
  const cerrar = () => {
    if (cerrado) return
    cerrado = true
    offMensajes(); offConexion(); offLocal?.(); clearInterval(latido)
    control.cerrar()
    if (actual === control) { actual = null; limpiarAnterior = null; store.set(inicial) }
  }
  limpiarAnterior = cerrar
  return cerrar
}
export const useDiscordRemoto = () => useStore(store, s => s)
export function configurarDiscordRemoto(deviceId: string, enabled: boolean): Promise<void> {
  if (actual) return actual.configurar(deviceId, enabled)
  store.set({ error: 'Conectate para controlar Discord en tu PC.' })
  return Promise.resolve()
}
export function cancelarDiscordRemoto() { actual?.cancelar() }
