import { clearPreloadedSource, preload } from 'expo-audio'

type BufferNativo = {
  propietarios: Map<symbol, boolean>
  pendientes: number
  version: number
  limpieza: Promise<void> | null
}
const buffers = new Map<string, BufferNativo>()
const cancelado = () => Object.assign(new Error('Cancelado'), { name: 'AbortError' })

function limpiarSiLibre(uri: string, buffer: BufferNativo) {
  if (buffer.propietarios.size || buffer.limpieza) return
  const version = buffer.version
  // Una adquisición nueva espera sólo esta limpieza, nunca el preload anterior.
  buffer.limpieza = Promise.resolve().then(async () => {
    if (!buffer.propietarios.size) await clearPreloadedSource({ uri })
  }).catch(() => {}).finally(() => {
    buffer.limpieza = null
    if (!buffer.propietarios.size && buffer.version !== version) limpiarSiLibre(uri, buffer)
    else if (!buffer.propietarios.size && !buffer.pendientes && buffers.get(uri) === buffer) buffers.delete(uri)
  })
}

export function prepararBuffer(uri: string, signal: AbortSignal): Promise<string> {
  if (signal.aborted) return Promise.reject(cancelado())
  const buffer = buffers.get(uri) ?? { propietarios: new Map<symbol, boolean>(), pendientes: 0, version: 0, limpieza: null }
  buffers.set(uri, buffer)
  const propietario = Symbol(uri)
  buffer.propietarios.set(propietario, false)
  buffer.pendientes++
  return new Promise((resolve, reject) => {
    let terminada = false
    const abortar = () => {
      if (terminada) return
      terminada = true
      buffer.propietarios.delete(propietario)
      limpiarSiLibre(uri, buffer)
      reject(cancelado())
    }
    signal.addEventListener('abort', abortar, { once: true })
    const preparar = async () => {
      if (buffer.limpieza) await buffer.limpieza
      if (signal.aborted) return
      // iOS crea y registra AVPlayer sin esperar la red. Es un objetivo de
      // buffer de 30 segundos, no un timeout ni una garantía de audio listo.
      await preload({ uri }, { preferredForwardBufferDuration: 30 })
    }
    void preparar().then(() => {
      if (terminada) return
      terminada = true
      buffer.propietarios.set(propietario, true)
      resolve(uri)
    }, error => {
      if (terminada) return
      terminada = true
      buffer.propietarios.delete(propietario)
      reject(error)
    }).finally(() => {
      signal.removeEventListener('abort', abortar)
      buffer.pendientes--
      buffer.version++
      // La finalización tardía de A no puede borrar el buffer que adoptó B.
      limpiarSiLibre(uri, buffer)
    })
  })
}

export function liberarBuffer(uri: string) {
  const buffer = buffers.get(uri)
  if (!buffer) return
  const propietario = [...buffer.propietarios].find(([, listo]) => listo)?.[0]
  if (!propietario) return
  buffer.propietarios.delete(propietario)
  limpiarSiLibre(uri, buffer)
}
