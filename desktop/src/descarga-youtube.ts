import { setTimeout as dormir } from 'node:timers/promises'
import type { ObservadorDiagnostico } from './diagnostico-eventos.js'

const CHUNK_BYTES = 1 << 20
const ESPERAS_MS = [600, 1800]

export class ErrorDescargaYouTube extends Error {
  constructor(readonly status: number, readonly desde: number, readonly pausaMs = 0) {
    super(`googlevideo respondió ${status} al rango ${desde}`)
  }
}

function pausa(res: Response, minimo = 60_000): number {
  const valor = res.headers.get('retry-after')
  if (valor === null) return minimo
  const segundos = Number(valor)
  const ms = Number.isFinite(segundos) ? segundos * 1000 : Date.parse(valor) - Date.now()
  return Number.isFinite(ms) ? Math.max(minimo, ms) : minimo
}

/** Un solo rango activo; 403/429 interrumpen, 5xx y errores de red tienen dos reintentos. */
export async function bajarPorRangos(
  url: string,
  opciones: {
    fetch: typeof fetch
    headers: Record<string, string>
    totalEsperado?: number
    signal?: AbortSignal
    chunkBytes?: number
    onEvento?: ObservadorDiagnostico
    esperar?: (ms: number) => Promise<void>
  },
): Promise<Buffer> {
  const esperar = opciones.esperar ?? ((ms) => dormir(ms, undefined, { signal: opciones.signal }))
  const chunkBytes = opciones.chunkBytes ?? CHUNK_BYTES
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 64 * 1024 || chunkBytes > 4 * CHUNK_BYTES) {
    throw new Error('El bloque debe medir entre 64 KiB y 4 MiB')
  }
  if (opciones.totalEsperado !== undefined &&
    (!Number.isSafeInteger(opciones.totalEsperado) || opciones.totalEsperado <= 0)) {
    throw new Error('Tamaño de audio inválido')
  }
  let total = opciones.totalEsperado && Number.isSafeInteger(opciones.totalEsperado)
    ? opciones.totalEsperado : undefined
  let desde = 0
  const chunks: Buffer[] = []
  do {
    opciones.signal?.throwIfAborted()
    const hasta = total ? Math.min(total - 1, desde + chunkBytes - 1) : desde + chunkBytes - 1
    let buf: Buffer | undefined
    for (let intento = 0; ; intento++) {
      try {
        opciones.signal?.throwIfAborted()
        const inicioPedido = Date.now()
        opciones.onEvento?.({ etapa: 'rango', estado: 'solicitando', desde, hasta, intento: intento + 1 })
        const timeout = AbortSignal.timeout(30_000)
        const res = await opciones.fetch(url, {
          headers: { ...opciones.headers, Range: `bytes=${desde}-${hasta}` },
          signal: opciones.signal ? AbortSignal.any([opciones.signal, timeout]) : timeout,
        })
        if (res.status !== 206 && !(res.status === 200 && desde === 0)) {
          opciones.onEvento?.({ etapa: 'rango', desde, hasta, status: res.status, intento: intento + 1 })
          await res.body?.cancel().catch(() => {})
          throw new ErrorDescargaYouTube(res.status, desde,
            res.status === 403 || res.status === 429 ? pausa(res) : pausa(res, 0))
        }
        let fin: number | undefined
        if (res.status === 206) {
          const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(res.headers.get('content-range') ?? '')
          const inicio = Number(match?.[1]), ultimo = Number(match?.[2]), size = Number(match?.[3])
          if (!match || ![inicio, ultimo, size].every(Number.isSafeInteger)
            || inicio !== desde || ultimo < inicio || ultimo > hasta || size <= ultimo
            || (total !== undefined && total !== size)) {
            await res.body?.cancel().catch(() => {})
            throw new Error('Descarga inconsistente: Content-Range inválido')
          }
          total = size
          fin = ultimo
        }
        buf = Buffer.from(await res.arrayBuffer())
        if (!buf.length || (fin !== undefined && buf.length !== fin - desde + 1)) {
          throw new Error('Descarga inconsistente: tamaño del rango incorrecto')
        }
        if (res.status === 200) {
          const length = res.headers.get('content-length')
          if ((total !== undefined && buf.length !== total)
            || (length !== null && Number(length) !== buf.length)) {
            throw new Error('Descarga inconsistente: respuesta completa truncada')
          }
          total = buf.length
        }
        opciones.onEvento?.({ etapa: 'rango', desde, hasta, status: res.status,
          intento: intento + 1, bytes: buf.length, total, duracionMs: Date.now() - inicioPedido })
        break
      } catch (e) {
        opciones.signal?.throwIfAborted()
        const reintentable = e instanceof ErrorDescargaYouTube
          ? e.status >= 500 && e.status <= 599
          : e instanceof TypeError || (e as Error).name === 'TimeoutError'
        if (!reintentable || intento >= ESPERAS_MS.length) throw e
        const esperaMs = Math.max(ESPERAS_MS[intento], e instanceof ErrorDescargaYouTube ? e.pausaMs : 0)
        // Una espera larga vuelve al usuario y pausa la cola, no mantiene el pedido colgado.
        if (esperaMs > 30_000) throw e
        opciones.onEvento?.({ etapa: 'reintento', desde, intento: intento + 2, esperaMs })
        await esperar(esperaMs)
      }
    }
    chunks.push(buf)
    desde += buf.length
  } while (total !== undefined && desde < total)
  if (desde !== total) throw new Error(`Descarga inconsistente: ${desde} de ${total} bytes`)
  return Buffer.concat(chunks)
}
