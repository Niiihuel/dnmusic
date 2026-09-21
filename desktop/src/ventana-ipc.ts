import type { BrowserWindow, IpcMain } from 'electron'
import { emisorAudioValido } from './audio-offline-ipc'

export type EstadoVentana = { maximizada: boolean; pantallaCompleta: boolean }

/** Controles de la ventana principal; ningún iframe ni origen externo puede operarlos. */
export function registrarVentana(ipc: IpcMain, ventana: BrowserWindow): void {
  const estado = (): EstadoVentana => ({ maximizada: ventana.isMaximized(), pantallaCompleta: ventana.isFullScreen() })
  ipc.handle('ventana:estado', e => {
    if (!emisorAudioValido(e, ventana.webContents)) throw Error('Emisor de ventana no permitido')
    return estado()
  })
  ipc.handle('ventana:accion', (e, accion: unknown) => {
    if (!emisorAudioValido(e, ventana.webContents)) throw Error('Emisor de ventana no permitido')
    if (accion === 'minimizar') ventana.minimize()
    else if (accion === 'maximizar') {
      if (ventana.isMaximized()) ventana.unmaximize()
      else ventana.maximize()
    } else if (accion === 'cerrar') ventana.close()
    else throw Error('Acción de ventana no permitida')
  })
  const publicar = () => {
    if (ventana.isDestroyed() || ventana.webContents.isDestroyed()) return
    // Sólo se envía geometría pública; la acción sigue validando el mainFrame.
    ventana.webContents.send('ventana:cambio', estado())
  }
  ventana.on('maximize', publicar)
  ventana.on('unmaximize', publicar)
  ventana.on('enter-full-screen', publicar)
  ventana.on('leave-full-screen', publicar)
  ventana.once('closed', () => {
    ventana.removeListener('maximize', publicar)
    ventana.removeListener('unmaximize', publicar)
    ventana.removeListener('enter-full-screen', publicar)
    ventana.removeListener('leave-full-screen', publicar)
    ipc.removeHandler('ventana:estado')
    ipc.removeHandler('ventana:accion')
  })
}
