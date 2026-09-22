import type { EstadoVentana } from './ventana-ipc'
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { EstadoActualizacion } from './actualizador'
import type { Aporte } from './resolutor'
import type { ResultadoDescarga } from './descargas'
import type { AudioOffline, ProgresoAudioOffline } from './audio-offline'
import type { ResultadoGoogle } from './oauth-google'
import type { ConfiguracionDiscord, EstadoDiscord, ListeningActivity } from './discord-presence'

/**
 * Lo único que el bundle web puede ver del escritorio.
 *
 * Corre con el sandbox prendido y sin integración de Node, así que esta lista
 * es literalmente toda la superficie: la app no puede leer archivos, abrir
 * procesos ni tocar el actualizador de otra forma que no sea por acá.
 *
 * El tipo se importa con `import type` a propósito — así se borra al compilar
 * y el preload no termina requiriendo electron-updater, que en un contexto
 * sandboxeado no cargaría.
 */
const puente = {
  version: (): Promise<string> => ipcRenderer.invoke('app:version'),
  ventana: {
    controlesPropios: process.platform === 'linux',
    estado: (): Promise<EstadoVentana> => ipcRenderer.invoke('ventana:estado'),
    accion: (accion: 'minimizar' | 'maximizar' | 'cerrar'): Promise<void> => ipcRenderer.invoke('ventana:accion', accion),
    alCambiar: (fn: (estado: EstadoVentana) => void): (() => void) => {
      const listener = (_: IpcRendererEvent, estado: EstadoVentana) => fn(estado)
      ipcRenderer.on('ventana:cambio', listener)
      return () => ipcRenderer.removeListener('ventana:cambio', listener)
    },
  },

  /**
   * Traer la ventana al frente.
   *
   * La usa el click en una notificación del sistema. Desde el renderer,
   * `window.focus()` no alcanza: en Windows y en la mayoría de los escritorios
   * de Linux, una ventana no puede levantarse sola sin pasar por el proceso
   * principal — y una notificación que no te lleva a lo que anuncia no sirve
   * para mucho.
   */
  enfocar: (): void => ipcRenderer.send('ventana:enfocar'),

  /**
   * Resolver una canción con la IP de esta compu y aportarla al bucket común.
   *
   * Es el plan B del /resolve: cuando la IP del servidor está en la reja
   * anti-bot de YouTube, cada escritorio puede bajar el audio con su propia IP
   * residencial y subírselo al servidor, que lo verifica y lo guarda para
   * todos (ver desktop/src/resolutor.ts). Devuelve lo mismo que /resolve.
   */
  resolver: (opciones: {
    videoId: string
    apiBase: string
    token: string
    artworkUrl?: string
    durationMs?: number
  }): Promise<Aporte> => ipcRenderer.invoke('resolver:aportar', opciones),

  /**
   * Bajar una lista entera de canciones a una carpeta del disco.
   *
   * El renderer manda las URLs ya firmadas y el nombre de cada archivo; el
   * proceso principal abre el diálogo de carpeta, baja los bytes y los escribe
   * (ver desktop/src/descargas.ts). `alDescargar` avisa el avance para pintar
   * un «12 de 40» sin bloquear.
   */
  descargas: {
    guardarLista: (opciones: {
      archivos: { url: string; nombre: string }[]
      carpetaSugerida?: string
    }): Promise<ResultadoDescarga> => ipcRenderer.invoke('descarga:lista', opciones),

    alDescargar: (
      escuchar: (avance: { hechos: number; total: number; nombre: string }) => void,
    ): (() => void) => {
      const oyente = (
        _: IpcRendererEvent,
        avance: { hechos: number; total: number; nombre: string },
      ) => escuchar(avance)
      ipcRenderer.on('descarga:progreso', oyente)
      return () => ipcRenderer.removeListener('descarga:progreso', oyente)
    },
  },

  oauthGoogle: {
    preparar: (): Promise<{ id: string; redirectTo: string }> => ipcRenderer.invoke('oauthGoogle:preparar'),
    abrir: (pedido: { id: string; url: string }): Promise<ResultadoGoogle> => ipcRenderer.invoke('oauthGoogle:abrir', pedido),
    abrirVinculacion: (pedido: { id: string; url: string; retorno: string }): Promise<ResultadoGoogle> => ipcRenderer.invoke('oauthGoogle:vincular', pedido),
    cancelar: (id: string): Promise<void> => ipcRenderer.invoke('oauthGoogle:cancelar', id),
  },

  authStorage: {
    getItem: (clave: string): Promise<string | null> => ipcRenderer.invoke('authStorage:get', clave),
    setItem: (clave: string, valor: string): Promise<void> => ipcRenderer.invoke('authStorage:set', clave, valor),
    removeItem: (clave: string): Promise<void> => ipcRenderer.invoke('authStorage:remove', clave),
  },

  discord: {
    estado: (): Promise<EstadoDiscord> => ipcRenderer.invoke('discord:estado'),
    configurar: (value: ConfiguracionDiscord): Promise<EstadoDiscord> => ipcRenderer.invoke('discord:configurar', value),
    publicar: (value: ListeningActivity | null): Promise<EstadoDiscord> => ipcRenderer.invoke('discord:publicar', value),
    alCambiar: (fn: (state: EstadoDiscord) => void): (() => void) => {
      const listener = (_: IpcRendererEvent, state: EstadoDiscord) => fn(state)
      ipcRenderer.on('discord:estado', listener)
      return () => ipcRenderer.removeListener('discord:estado', listener)
    },
  },

  audioOffline: {
    listar: (): Promise<AudioOffline[]> => ipcRenderer.invoke('audioOffline:listar'),
    descargar: (pedido: { key: string; url: string }): Promise<AudioOffline> => ipcRenderer.invoke('audioOffline:descargar', pedido),
    cancelar: (key: string): Promise<void> => ipcRenderer.invoke('audioOffline:cancelar', key),
    quitar: (key: string): Promise<void> => ipcRenderer.invoke('audioOffline:quitar', key),
    alProgreso: (fn: (progreso: ProgresoAudioOffline) => void): (() => void) => {
      const listener = (_: IpcRendererEvent, progreso: ProgresoAudioOffline) => fn(progreso)
      ipcRenderer.on('audioOffline:progreso', listener)
      return () => ipcRenderer.removeListener('audioOffline:progreso', listener)
    },
  },

  /**
   * Los links `dnmusic://` que le llegan al escritorio desde afuera.
   *
   * El proceso principal manda la **ruta** ya resuelta (`/cancion/abc`) y no la
   * URL: quien decide qué es un link nuestro es `desktop/src/enlaces.ts`, del
   * lado privilegiado, y el renderer solo navega adonde le dicen. Devuelve la
   * función para dejar de escuchar, como el resto: es un efecto de React.
   */
  enlaces: {
    alAbrir: (escuchar: (ruta: string) => void): (() => void) => {
      const oyente = (_: IpcRendererEvent, ruta: string) => escuchar(ruta)
      ipcRenderer.on('enlace:abrir', oyente)
      ipcRenderer.send('enlace:listo')
      return () => ipcRenderer.removeListener('enlace:abrir', oyente)
    },
  },

  actualizacion: {
    estado: (): Promise<EstadoActualizacion> => ipcRenderer.invoke('actualizacion:estado'),
    buscar: (): void => ipcRenderer.send('actualizacion:buscar'),
    descargar: (): void => ipcRenderer.send('actualizacion:descargar'),
    /** Solo hace algo cuando el estado es `lista`; si no, se ignora. */
    instalar: (): void => ipcRenderer.send('actualizacion:instalar'),

    /** Devuelve la función para dejar de escuchar: es un efecto de React. */
    alCambiar: (escuchar: (estado: EstadoActualizacion) => void): (() => void) => {
      const oyente = (_: IpcRendererEvent, estado: EstadoActualizacion) => escuchar(estado)
      ipcRenderer.on('actualizacion:estado', oyente)
      return () => ipcRenderer.removeListener('actualizacion:estado', oyente)
    },
  },
}

export type PuenteEscritorio = typeof puente

contextBridge.exposeInMainWorld('dnmusicEscritorio', puente)
