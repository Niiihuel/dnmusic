import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { EstadoActualizacion } from './actualizador'
import type { Aporte } from './resolutor'

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

  actualizacion: {
    estado: (): Promise<EstadoActualizacion> => ipcRenderer.invoke('actualizacion:estado'),
    buscar: (): void => ipcRenderer.send('actualizacion:buscar'),
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
