import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron'
import { DiscoAudioOffline } from './audio-offline'

export function emisorAudioValido(evento: Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>, ventana: WebContents | null): boolean {
  if (!ventana || ventana.isDestroyed() || evento.sender !== ventana || evento.senderFrame !== ventana.mainFrame) return false
  try {
    const url = new URL(evento.senderFrame.url)
    return url.protocol === 'app:' && url.hostname === 'dnmusic' && !url.port && !url.username && !url.password
  } catch { return false }
}

export function registrarAudioOffline(ipc: IpcMain, disco: DiscoAudioOffline, ventana: () => WebContents | null): void {
  const comprobar = (e: IpcMainInvokeEvent) => { if (!emisorAudioValido(e, ventana())) throw Error('Emisor de audio offline no permitido') }
  ipc.handle('audioOffline:listar', e => { comprobar(e); return disco.listar() })
  ipc.handle('audioOffline:descargar', (e, pedido) => {
    comprobar(e)
    return disco.descargar(pedido, progreso => {
      try {
        if (emisorAudioValido(e, ventana())) e.senderFrame?.send('audioOffline:progreso', progreso)
      } catch { /* La ventana pudo cerrarse entre la comprobación y send. */ }
    })
  })
  ipc.handle('audioOffline:cancelar', (e, key) => { comprobar(e); return disco.cancelar(key) })
  ipc.handle('audioOffline:quitar', (e, key) => { comprobar(e); return disco.quitar(key) })
}
