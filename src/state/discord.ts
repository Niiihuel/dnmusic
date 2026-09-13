import AsyncStorage from '@react-native-async-storage/async-storage'
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
let configuracion: ConfiguracionDiscord = { enabled: false, applicationId: '' }
let escritura = Promise.resolve()
// La intención más reciente sobrevive al cambio de cuenta y a fallos de disco.
const preferenciasDeSesion = new Map<string, ConfiguracionDiscord>()
let publicarActual: (() => void) | null = null
const clave = (id: string) => `discord-presence:v1:${id}`

/** El permiso es por cuenta y dispositivo, separado de mostrar escucha en el perfil. */
export async function configurarDiscord(config: ConfiguracionDiscord) {
  const p = puente(), id = cuenta, v = version
  if (!p || !id || !store.get().cargado || store.get().guardando) return
  const applicationId = config.applicationId.trim()
  if ((config.enabled || applicationId) && !/^[1-9]\d{16,19}$/.test(applicationId)) {
    store.set({ error: 'Ingresá el Application ID numérico de Discord.' }); return
  }
  store.set({ guardando: true, error: null })
  // Revocar localmente antes de esperar el IPC impide otro latido autorizado.
  configuracion = { enabled: false, applicationId }
  const solicitada = { enabled: config.enabled, applicationId }
  preferenciasDeSesion.set(id, solicitada)
  // Persistir antes del ACK: salir durante la operación no pierde una revocación.
  escritura = escritura.catch(() => {}).then(() => AsyncStorage.setItem(clave(id), JSON.stringify(solicitada)))
  const guardado = escritura
  try {
    const [estado] = await Promise.all([p.configurar(solicitada), guardado])
    if (v !== version || cuenta !== id) return
    configuracion = { enabled: estado.enabled, applicationId: estado.applicationId }
    store.set({ estado })
    publicarActual?.()
  } catch {
    if (v === version) store.set({ error: 'No se pudo guardar la configuración de Discord. Volvé a intentar.' })
  } finally {
    if (v === version) store.set({ guardando: false })
  }
}

export function iniciarDiscord(id: string) {
  const p = puente()
  if (!p) return () => {}
  const v = ++version
  cuenta = id
  configuracion = { enabled: false, applicationId: '' }
  store.set({ estado: inicial, cargado: false, guardando: false, error: null })
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
