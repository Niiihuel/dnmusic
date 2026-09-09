import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron'
import { GoogleOAuthEscritorio } from './oauth-google'

function permitido(e: IpcMainInvokeEvent, w: WebContents | null) {
  if (!w || w.isDestroyed() || e.sender !== w || e.senderFrame !== w.mainFrame) return false
  try { const u = new URL(e.senderFrame.url); return u.protocol === 'app:' && u.hostname === 'dnmusic' && !u.port && !u.username && !u.password } catch { return false }
}
export function registrarGoogleOAuth(ipc: IpcMain, oauth: GoogleOAuthEscritorio, ventana: () => WebContents | null) {
  const comprobar = (e: IpcMainInvokeEvent) => { if (!permitido(e, ventana())) throw new Error('Emisor OAuth no permitido.') }
  ipc.handle('oauthGoogle:preparar', e => { comprobar(e); return oauth.preparar() })
  ipc.handle('oauthGoogle:abrir', async (e, pedido) => {
    comprobar(e)
    const resultado = await oauth.abrir(pedido)
    comprobar(e)
    return resultado
  })
  ipc.handle('oauthGoogle:vincular', async (e, pedido) => {
    comprobar(e)
    const resultado = await oauth.abrirVinculacion(pedido)
    comprobar(e)
    return resultado
  })
  ipc.handle('oauthGoogle:cancelar', (e, id) => { comprobar(e); if (typeof id !== 'string') throw new Error('Inicio OAuth no válido.'); oauth.cancelar(id) })
}
