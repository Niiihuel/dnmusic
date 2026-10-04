import AsyncStorage from '@react-native-async-storage/async-storage'
import { iniciarDiscordRemoto } from './discordRemoto'
import type { CambioDiscordLocal } from '../services/controlDiscordRemoto'
import { useEffect } from 'react'
import { actividadParaCompartir, type ListeningActivity } from '../services/actividadEscucha'
import { leerEscuchaParaIntegraciones, suscribirActividadParaIntegraciones } from './escucha'
import { subscribePlayback } from './playback'
import { getSession, useUser } from './session'
import { createStore, useStore } from './store'

export type EstadoDiscord = {
  enabled: boolean
  applicationId: string
  status: 'disabled' | 'unconfigured' | 'disconnected' | 'connecting' | 'ready' | 'published' | 'error'
  error?: string
  account?: string
}
type ConfiguracionDiscord = { enabled: boolean; applicationId: string }
type PuenteDiscord = {
  estado(): Promise<EstadoDiscord>
  configurar(config: ConfiguracionDiscord): Promise<EstadoDiscord>
  publicar(activity: ListeningActivity | null): Promise<EstadoDiscord>
  alCambiar(fn: (estado: EstadoDiscord) => void): () => void
}
const puente = () => (globalThis as { dnmusicEscritorio?: { discord?: PuenteDiscord } }).dnmusicEscritorio?.discord
export const HAY_DISCORD = !!puente()
// Identificador público de la aplicación DMusic; no habilita compartir por sí solo.
export const DISCORD_APPLICATION_ID = '1548502947623739552'
const inicial: EstadoDiscord = { enabled: false, applicationId: DISCORD_APPLICATION_ID, status: 'disabled' }
const store = createStore({ estado: inicial, cargado: false, guardando: false, error: null as string | null })
let cuenta: string | null = null
let version = 0
let intencion = 0
let configuracion: ConfiguracionDiscord = { enabled: false, applicationId: '' }
let escritura = Promise.resolve()
// La intención más reciente sobrevive al cambio de cuenta y a fallos de disco.
const preferenciasDeSesion = new Map<string, ConfiguracionDiscord>()
let publicarActual: (() => void) | null = null
const clave = (id: string) => `discord-presence:v1:${id}`

/** El permiso es por cuenta y dispositivo, separado de mostrar escucha en el perfil. */
export function configurarDiscord(config: ConfiguracionDiscord) { return aplicarConfiguracionDiscord(config) }

async function aplicarConfiguracionDiscord(config: ConfiguracionDiscord, revocar = false, provisional = false): Promise<boolean> {
  const p = puente(), id = cuenta, v = version
  if (!p || !id || !store.get().cargado || (store.get().guardando && !revocar)) return false
  const applicationId = config.applicationId.trim()
  if ((config.enabled || applicationId) && !/^[1-9]\d{16,19}$/.test(applicationId)) {
    store.set({ error: 'Ingresá el Application ID numérico de Discord.' }); return false
  }
  const operacion = ++intencion
  store.set({ guardando: true, error: null })
  // Revocar localmente antes de esperar el IPC impide otro latido autorizado.
  configuracion = { enabled: false, applicationId }
  const solicitada = { enabled: config.enabled, applicationId }
  // Un alta remota es provisional hasta confirmar: cerrar/reabrir la PC no
  // debe reactivar una solicitud vencida que nunca terminó en el teléfono.
  const guardada = provisional ? { ...solicitada, enabled: false } : solicitada
  preferenciasDeSesion.set(id, guardada)
  // Persistir antes del ACK: salir durante la operación no pierde una revocación.
  escritura = escritura.catch(() => {}).then(() => AsyncStorage.setItem(clave(id), JSON.stringify(guardada)))
  const guardado = escritura.then(() => true, () => false)
  try {
    const estado = await p.configurar(solicitada)
    if (v !== version || cuenta !== id || operacion !== intencion) return false
    configuracion = { enabled: estado.enabled, applicationId: estado.applicationId }
    store.set({ estado })
    publicarActual?.()
    // La conexión y el disco son resultados distintos: fallar al persistir no
    // puede dejar un READY con la publicación local deshabilitada en silencio.
    const persistido = await guardado
    if (v !== version || cuenta !== id || operacion !== intencion) return false
    if (!persistido) store.set({ error: 'El cambio se aplicó en esta sesión, pero no se pudo guardar para la próxima vez. Volvé a intentar.' })
    return persistido
  } catch {
    if (v === version && operacion === intencion) store.set({ error: 'No se pudo comunicar el cambio a Discord. Volvé a intentar.' })
    return false
  } finally {
    if (v === version && operacion === intencion) store.set({ guardando: false })
  }
}

/** Un cancel remoto sólo revoca su propia intención; jamás una elección local posterior. */
function cambiarDiscordDesdeDispositivo(enabled: boolean): CambioDiscordLocal {
  const v = version, id = cuenta, anterior = intencion
  const terminado = aplicarConfiguracionDiscord({ enabled, applicationId: DISCORD_APPLICATION_ID }, false, enabled)
  const operacion = intencion
  return { terminado, confirmar: () => {
    if (!enabled || operacion === anterior || v !== version || cuenta !== id || operacion !== intencion || !id) return
    const guardada = { enabled: true, applicationId: DISCORD_APPLICATION_ID }
    preferenciasDeSesion.set(id, guardada)
    escritura = escritura.catch(() => {}).then(() => AsyncStorage.setItem(clave(id), JSON.stringify(guardada)))
    void escritura.catch(() => {
      if (v === version && operacion === intencion) store.set({ error: 'Discord está conectado, pero no se pudo guardar la preferencia para la próxima vez.' })
    })
  }, cancelar: () => {
    if (!enabled || operacion === anterior || v !== version || cuenta !== id || operacion !== intencion) return
    // La revocación persiste y llega al IPC aun si el ACK del alta está pendiente.
    void aplicarConfiguracionDiscord({ enabled: false, applicationId: DISCORD_APPLICATION_ID }, true)
  } }
}

export function iniciarDiscord(id: string) {
  const p = puente()
  if (!p) return iniciarDiscordRemoto(id)
  const v = ++version
  cuenta = id
  configuracion = { enabled: false, applicationId: '' }
  store.set({ estado: inicial, cargado: false, guardando: false, error: null })
  const cerrarRemoto = iniciarDiscordRemoto(id, { leer: store.get, suscribir: store.subscribe, cambiar: cambiarDiscordDesdeDispositivo })
  let ultimoVacio = false, envio = 0
  let cerrado = false, timer: ReturnType<typeof setTimeout> | undefined
  const vigente = () => !cerrado && v === version && cuenta === id
  const recibir = (estado: EstadoDiscord) => { if (vigente()) store.set({ estado }) }
  const offEstado = p.alCambiar(recibir)
  const enviar = () => {
    clearTimeout(timer); timer = undefined
    if (!vigente()) return
    const session = getSession()
    const permitida = configuracion.enabled && session.user?.id === id && session.access?.status === 'approved'
    const escucha = permitida ? leerEscuchaParaIntegraciones() : null
    const activity = escucha ? actividadParaCompartir({ ...escucha, autorizada: permitida }) : null
    if (!activity && ultimoVacio) return
    ultimoVacio = activity === null
    const secuencia = ++envio
    void p.publicar(activity).then(estado => { if (secuencia === envio) recibir(estado) }).catch(() => {
      if (secuencia !== envio || !vigente()) return
      ultimoVacio = false
      store.set({ estado: { ...store.get().estado, status: 'error', error: 'No se pudo comunicar con Discord.' } })
    })
  }
  const actualizar = () => {
    if (!vigente()) return
    if (!configuracion.enabled || !leerEscuchaParaIntegraciones()) { enviar(); return }
    // Posición cambia varias veces por segundo. Un solo envío agrupa esos cambios;
    // pausa y revocación, en cambio, limpian la presencia inmediatamente.
    if (!timer) timer = setTimeout(() => { timer = undefined; enviar() }, 1000)
  }
  publicarActual = enviar
  const offEscucha = suscribirActividadParaIntegraciones(actualizar)
  const offPlayback = subscribePlayback(actualizar)
  const latido = setInterval(enviar, 10_000)
  void (async () => {
    try {
      await p.configurar({ enabled: false, applicationId: '' })
      if (!vigente()) return
      await escritura.catch(() => {})
      if (!vigente()) return
      const recordada = preferenciasDeSesion.get(id)
      const raw = recordada ? JSON.stringify(recordada) : await AsyncStorage.getItem(clave(id))
      if (!vigente()) return
      let config: ConfiguracionDiscord = { enabled: false, applicationId: DISCORD_APPLICATION_ID }
      try {
        const dato: unknown = raw ? JSON.parse(raw) : null
        if (dato && typeof dato === 'object') {
          const d = dato as Partial<ConfiguracionDiscord>
          if (typeof d.applicationId === 'string' && /^[1-9]\d{16,19}$/.test(d.applicationId)) config = { applicationId: d.applicationId, enabled: d.enabled === true }
        }
      } catch { /* Una preferencia corrupta nunca habilita compartir. */ }
      const estado = await p.configurar(config)
      if (!vigente()) return
      configuracion = { enabled: estado.enabled, applicationId: estado.applicationId }
      store.set({ estado, cargado: true })
      enviar()
    } catch {
      if (vigente()) store.set({ cargado: true, error: 'No se pudo cargar la configuración de Discord.' })
    }
  })()
  return () => {
    cerrarRemoto()
    cerrado = true
    clearTimeout(timer); clearInterval(latido)
    offEscucha(); offPlayback(); offEstado()
    if (v === version) {
      version++; cuenta = null; publicarActual = null
      configuracion = { enabled: false, applicationId: '' }
      store.set({ estado: inicial, cargado: false, guardando: false })
      void p.configurar({ enabled: false, applicationId: '' }).catch(() => {})
    }
  }
}

export function usePresenciaDiscord() {
  const user = useUser()
  useEffect(() => user?.id ? iniciarDiscord(user.id) : undefined, [user?.id])
}
export const useDiscord = () => useStore(store, s => s)
