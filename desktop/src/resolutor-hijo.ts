import { resolverYAportar } from './resolutor.js'

/**
 * El resolutor, corriendo en un proceso **Node de verdad**.
 *
 * No es una manía de arquitectura: es la única forma medida de que YouTube
 * entregue el audio. BotGuard —el que decide si sos un navegador o un script—
 * examina el runtime donde corre, y adentro del proceso principal de Electron
 * su veredicto es peor: acuña un PO token **degradado**, y con ese token los
 * /player contestan «This video is unavailable» en los siete clientes. Medido
 * en esta misma máquina, misma IP, mismo minuto y mismo código:
 *
 *   · en el main de Electron  → token de 120-124 caracteres → no reproduce
 *   · en Node a secas         → token de 168-172 caracteres → resuelve y baja
 *
 * Se lanza con el binario de Electron en modo `ELECTRON_RUN_AS_NODE`, así que
 * no hay que llevar otro Node: es el mismo ejecutable sin Chromium encima.
 *
 * El hijo **vive** entre pedidos a propósito. La sesión de InnerTube y el
 * acuñador de tokens se guardan en memoria con su vencimiento (ver
 * `potoken.ts`), y rehacerlos por cada canción no solo sumaría medio segundo a
 * cada una: crear sesiones nuevas a repetición es justo lo que parece un bot.
 */

type Pedido = {
  id: number
  opciones: { videoId: string; apiBase: string; token: string; artworkUrl?: string; durationMs?: number }
}

process.on('message', (mensaje: Pedido) => {
  const { id, opciones } = mensaje ?? ({} as Pedido)
  if (!id || !opciones) return
  resolverYAportar(opciones)
    .then((aporte) => process.send?.({ id, ok: true, aporte }))
    .catch((e: unknown) => process.send?.({ id, ok: false, error: (e as Error).message }))
})

/* Si el padre se muere, esto no queda dando vueltas con la música apagada. */
process.on('disconnect', () => process.exit(0))
