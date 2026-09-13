import type { IpcMain, WebContents } from 'electron'
import { emisorAudioValido } from './audio-offline-ipc'
import { DiscordPresence } from './discord-presence'

export function registrarDiscord(ipc: IpcMain, discord: DiscordPresence, ventana: () => WebContents | null): void {
  for (const method of ['estado', 'configurar', 'publicar'] as const) {
    ipc.handle(`discord:${method}`, (event, value) => {
      if (!emisorAudioValido(event, ventana())) throw Error('Emisor de Discord no permitido')
      if (method === 'estado') return discord.estado()
      return discord[method](value)
    })
  }
}
