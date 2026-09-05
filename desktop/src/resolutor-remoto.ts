import { fork, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import type { Aporte } from './resolutor.js'
import { acunarEnNavegador, cerrarTokens, userAgentTokens } from './potoken-navegador.js'

/** Un hijo persistente para resolver audio y un navegador aislado para atestar. */

type Respuesta = { tipo?: undefined; id: number; ok: true; aporte: Aporte }
  | { tipo?: undefined; id: number; ok: false; error: string }
  | { tipo: 'potoken'; id: number; binding: string }

type Pendiente = { resolver: (a: Aporte) => void; rechazar: (e: Error) => void }

let hijo: ChildProcess | null = null
const pendientes = new Map<number, Pendiente>()
let siguienteId = 1

/** Le avisa a todos los que esperaban que este hijo ya no va a contestar. */
function tumbar(motivo: string) {
  hijo = null
  for (const [, p] of pendientes) p.rechazar(new Error(motivo))
  pendientes.clear()
}

function asegurarHijo(): ChildProcess {
  if (hijo && hijo.connected) return hijo

  /*
   * El mismo ejecutable, sin Chromium: `ELECTRON_RUN_AS_NODE` es lo que lo
   * vuelve un Node común.
   *
   * El guion se bifurca **desde adentro del .asar**, y está probado que anda:
   * un proceso en modo Node conserva el parche de asar de Electron, así que
   * tanto el script como lo que él importa se leen del paquete. El primer
   * intento lo sacó afuera con `asarUnpack` por las dudas y fue peor — el
   * hijo quedaba solo, sin `resolutor.js` ni `jsdom` al lado, y moría con
   * código 1 antes de resolver nada.
   */
  const guion = join(__dirname, 'resolutor-hijo.js')
  const nuevo = fork(guion, [], {
    execPath: process.execPath,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', DNMUSIC_YT_USER_AGENT: userAgentTokens() },
    // Su salida a la nuestra: los `console.log` del resolutor siguen sirviendo.
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  })

  nuevo.on('message', (m: Respuesta) => {
    if (m?.tipo === 'potoken') {
      const contestar = (respuesta: object) => {
        if (nuevo.connected) nuevo.send({ tipo: 'potoken', id: m.id, ...respuesta }, () => {})
      }
      void acunarEnNavegador(m.binding).then(
        (token) => contestar({ token }),
        (e: unknown) => contestar({ error: (e as Error).message }),
      )
      return
    }
    const p = pendientes.get(m?.id)
    if (!p) return
    pendientes.delete(m.id)
    if (m.ok) p.resolver(m.aporte)
    else p.rechazar(new Error(m.error))
  })
  nuevo.on('exit', (codigo) => {
    if (nuevo === hijo) tumbar(`el resolutor se cerró (${codigo ?? 'sin código'})`)
  })
  nuevo.on('error', (e) => {
    if (nuevo === hijo) tumbar(`no se pudo abrir el resolutor: ${e.message}`)
  })

  hijo = nuevo
  return nuevo
}

export function resolverEnHijo(opciones: {
  videoId: string
  apiBase: string
  token: string
  artworkUrl?: string
  durationMs?: number
}): Promise<Aporte> {
  return new Promise<Aporte>((resolver, rechazar) => {
    let proceso: ChildProcess
    try {
      proceso = asegurarHijo()
    } catch (e) {
      rechazar(new Error(`no se pudo abrir el resolutor: ${(e as Error).message}`))
      return
    }
    const id = siguienteId++
    pendientes.set(id, { resolver, rechazar })
    proceso.send({ id, opciones }, (e) => {
      if (!e) return
      pendientes.delete(id)
      rechazar(new Error(`no se pudo hablar con el resolutor: ${e.message}`))
    })
  })
}

/** Cortarlo al cerrar la app: un hijo huérfano bajando bytes no le sirve a nadie. */
export function cerrarResolutor() {
  const actual = hijo
  tumbar('El resolutor se cerró')
  actual?.kill()
  cerrarTokens()
}
