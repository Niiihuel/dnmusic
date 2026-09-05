import { ErrorDescargaYouTube } from './descarga-youtube.js'

/** No serializa mensajes arbitrarios de dependencias: pueden contener credenciales. */
export function describirError(error: unknown) {
  const e = error as { name?: string; message?: string; cause?: { code?: string } }
  if (error instanceof ErrorDescargaYouTube) return {
    codigo: `HTTP_${error.status}`, status: error.status, desde: error.desde,
    pausaMs: error.pausaMs,
    mensaje: error.status === 403 ? 'El CDN rechazó la descarga. El código no determina por sí solo la causa.'
      : error.status === 429 ? 'YouTube limitó la frecuencia de solicitudes.' : 'El CDN respondió con un error HTTP.',
  }
  const texto = e?.message ?? ''
  if (e?.name === 'AbortError') return { codigo: 'CANCELADO', mensaje: 'Prueba cancelada.' }
  if (e?.name === 'TimeoutError' || /tiempo|timed out|timeout/i.test(texto)) return { codigo: 'TIMEOUT', mensaje: 'Se agotó el plazo de la prueba.' }
  if (/BotGuard|integrity|token|verificar el navegador/i.test(texto)) return { codigo: 'ATESTACION', mensaje: 'No se pudo generar el token en Chromium.' }
  if (/Sin audio|no ofreció audio/i.test(texto)) return { codigo: 'SIN_AUDIO', mensaje: 'Los clientes consultados no ofrecieron audio AAC utilizable.' }
  if (/inconsistente|Tamaño de audio/i.test(texto)) return { codigo: 'INTEGRIDAD', mensaje: 'La respuesta no coincide con los rangos o tamaños esperados.' }
  if (/ffprobe|códec|duración/i.test(texto)) return { codigo: 'VALIDACION_AUDIO', mensaje: 'No se pudo validar códec y duración con ffprobe.' }
  if (/ENOTFOUND|EAI_AGAIN/.test(e?.cause?.code ?? '')) return { codigo: 'DNS', mensaje: 'No se pudo resolver el servidor.' }
  if (e?.name === 'TypeError' && /fetch/i.test(texto)) return { codigo: 'RED', mensaje: 'La conexión falló antes de recibir una respuesta válida.' }
  return { codigo: 'ERROR', mensaje: 'La etapa registrada no pudo completarse.' }
}
