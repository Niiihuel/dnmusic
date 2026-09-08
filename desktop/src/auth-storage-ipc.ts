import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron'
import type { AlmacenAuth } from './auth-storage'

function permitido(e: IpcMainInvokeEvent, w: WebContents | null): boolean {
  if (!w || w.isDestroyed() || e.sender !== w || e.senderFrame !== w.mainFrame) return false
  try {
    const u = new URL(e.senderFrame.url)
    return u.protocol === 'app:' && u.hostname === 'dnmusic' && !u.port && !u.username && !u.password
  } catch {
    return false
  }
}

export function registrarAlmacenAuth(
  ipc: IpcMain,
  almacen: AlmacenAuth,
  ventana: () => WebContents | null,
): void {
  const comprobar = (e: IpcMainInvokeEvent) => {
    if (!permitido(e, ventana())) throw new Error('Emisor de sesión no permitido.')
  }
  ipc.handle('authStorage:get', (e, clave) => { comprobar(e); return almacen.getItem(clave) })
  ipc.handle('authStorage:set', (e, clave, valor) => { comprobar(e); return almacen.setItem(clave, valor) })
  ipc.handle('authStorage:remove', (e, clave) => { comprobar(e); return almacen.removeItem(clave) })
}
