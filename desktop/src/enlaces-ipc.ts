import type { IpcMain, WebContents } from 'electron'
import type { EntregaDeEnlaces } from './enlaces'

/** No consumir el enlace de arranque hasta que el router tenga un oyente. */
export function registrarEnlaces(ipc: IpcMain, enlaces: EntregaDeEnlaces, ventana: () => WebContents | null): void {
  ipc.on('enlace:listo', e => {
    const w = ventana()
    if (!w || w.isDestroyed() || e.sender !== w || e.senderFrame !== w.mainFrame) return
    try {
      const u = new URL(e.senderFrame.url)
      if (u.protocol !== 'app:' || u.hostname !== 'dnmusic' || u.port || u.username || u.password) return
    } catch { return }
    enlaces.conectar(ruta => { if (!w.isDestroyed()) w.send('enlace:abrir', ruta) })
  })
}
