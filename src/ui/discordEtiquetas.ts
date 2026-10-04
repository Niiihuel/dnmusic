import type { EstadoDiscord } from '../state/discord'

export const ESTADOS_DISCORD: Record<EstadoDiscord['status'], string> = {
  disabled: 'No conectado', unconfigured: 'Conexión sin configurar',
  disconnected: 'Discord no está disponible', connecting: 'Buscando Discord…',
  ready: 'Conectado · esperando música', published: 'Canción enviada a Discord', error: 'No se pudo conectar',
}
