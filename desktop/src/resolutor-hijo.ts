import { resolverYAportar } from './resolutor.js'
import { configurarProveedorTokens } from './potoken.js'
import { ErrorDescargaYouTube } from './descarga-youtube.js'

/**
 * Descifra y descarga en un hijo Node para no ocupar el main de Electron.
 * La atestación corre en Chromium: el hijo solo intercambia bindings y tokens
 * por IPC. Sesión, cola y pausa de descargas viven entre pedidos.
 */

type Pedido = {
  tipo?: undefined
  id: number
  opciones: { videoId: string; apiBase: string; token: string; artworkUrl?: string; durationMs?: number }
}

type Token = { tipo: 'potoken'; id: number; token?: string; error?: string }
let siguienteToken = 1
const tokens = new Map<number, (respuesta: Token) => void>()
configurarProveedorTokens((binding) => new Promise<string>((resolve, reject) => {
  const id = siguienteToken++
  const timer = setTimeout(() => {
    tokens.delete(id)
    reject(new Error('El navegador no respondió al pedido de token'))
  }, 45_000)
  tokens.set(id, (respuesta) => {
    clearTimeout(timer)
    tokens.delete(id)
    if (respuesta.token) resolve(respuesta.token)
    else reject(new Error(respuesta.error ?? 'No se obtuvo PO token'))
  })
  process.send?.({ tipo: 'potoken', id, binding }, (error: Error | null) => {
    if (error) tokens.get(id)?.({ tipo: 'potoken', id, error: error.message })
  })
}))

// Una descarga a la vez. Los pedidos repetidos comparten también la subida.
let cola: Promise<unknown> = Promise.resolve()
let pausaHasta = 0
const trabajos = new Map<string, ReturnType<typeof resolverYAportar>>()

process.on('message', (mensaje: Pedido | Token) => {
  if (mensaje?.tipo === 'potoken') {
    tokens.get(mensaje.id)?.(mensaje)
    return
  }
  const { id, opciones } = mensaje ?? ({} as Pedido)
  if (!id || !opciones) return
  const clave = JSON.stringify([opciones.apiBase, opciones.token, opciones.videoId])
  let trabajo = trabajos.get(clave)
  if (!trabajo) {
    trabajo = cola.then(async () => {
      if (Date.now() < pausaHasta) {
        const segundos = Math.ceil((pausaHasta - Date.now()) / 1000)
        throw new Error(`YouTube pausó las descargas. Probá en ${segundos} segundos.`)
      }
      try {
        return await resolverYAportar(opciones)
      } catch (e) {
        if (e instanceof ErrorDescargaYouTube && e.pausaMs) pausaHasta = Date.now() + e.pausaMs
        throw e
      }
    })
    trabajos.set(clave, trabajo)
    cola = trabajo.catch(() => {}).finally(() => trabajos.delete(clave))
  }
  trabajo
    .then((aporte) => process.send?.({ id, ok: true, aporte }))
    .catch((e: unknown) => process.send?.({ id, ok: false, error: (e as Error).message }))
})

/* Si el padre se muere, esto no queda dando vueltas con la música apagada. */
process.on('disconnect', () => process.exit(0))
