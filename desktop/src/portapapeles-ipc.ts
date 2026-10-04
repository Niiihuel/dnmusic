import type { Clipboard, IpcMain, IpcMainInvokeEvent, WebContents } from 'electron'

function emisorPermitido(evento: IpcMainInvokeEvent, ventana: WebContents | null): boolean {
  if (!ventana || ventana.isDestroyed() || evento.sender !== ventana || evento.senderFrame !== ventana.mainFrame) return false
  try {
    const url = new URL(evento.senderFrame.url)
    return url.protocol === 'app:' && url.hostname === 'dnmusic' && !url.port && !url.username && !url.password
  } catch {
    return false
  }
}

/** Sólo escribe texto desde la ventana de la app; no expone lecturas del portapapeles. */
export function registrarPortapapeles(
  ipc: IpcMain,
  portapapeles: Pick<Clipboard, 'writeText'>,
  ventana: () => WebContents | null,
): void {
  ipc.handle('portapapeles:copiar', async (evento, texto: unknown): Promise<boolean> => {
    if (!emisorPermitido(evento, ventana())) throw new Error('Emisor de portapapeles no permitido.')
    if (typeof texto !== 'string') throw new Error('El portapapeles requiere texto.')
    // Sin "selection": en Linux pegar con Ctrl+V usa el portapapeles común.
    await portapapeles.writeText(texto)
    return true
  })
}
