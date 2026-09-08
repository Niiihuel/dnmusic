/** El navegador común usa una ventana acotada en memoria, Electron usa disco. */
const MAX_BYTES = 32 * 1024 * 1024
export async function prepararBuffer(uri: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(uri, { signal })
  if (!response.ok) throw new Error(`Audio no disponible (${response.status})`)
  const length = Number(response.headers.get('content-length'))
  if (length > MAX_BYTES || !response.body) {
    await response.body?.cancel()
    throw new Error('El audio excede la precarga del navegador')
  }
  const reader = response.body.getReader()
  const partes: Uint8Array<ArrayBuffer>[] = []
  let bytes = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_BYTES) throw new Error('El audio excede la precarga del navegador')
      partes.push(new Uint8Array(value))
    }
    if (signal.aborted || bytes === 0) throw new Error('Precarga incompleta')
    return URL.createObjectURL(new Blob(partes, { type: response.headers.get('content-type') || 'audio/mp4' }))
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  } finally { reader.releaseLock() }
}
export function liberarBuffer(uri: string) { URL.revokeObjectURL(uri) }
