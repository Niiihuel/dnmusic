/**
 * El resolutor de a bordo **no existe en la web**, y este archivo es cómo se
 * dice eso sin costo.
 *
 * Metro resuelve `.web.ts` antes que `.ts` cuando empaqueta para el navegador.
 * Sin este archivo, el resolutor real entra igual al bundle web —Metro sigue
 * los `require` leyendo el código, no ejecutándolo— y son ~650 KB de
 * youtubei.js que ahí no pueden servir para nada: una página no puede hablar
 * con InnerTube, la frena CORS. Ese es el motivo por el que el motor de a bordo
 * es nativo y no universal.
 *
 * La web sigue resolviendo por el `/resolve` del servidor, como siempre.
 */
import type { Aporte } from './resolutorABordo'

export type { Aporte }

export function hayResolutorABordo(): boolean {
  return false
}

export function resolverYAportar(): Promise<Aporte> {
  return Promise.reject(new Error('El navegador no puede resolver por su cuenta.'))
}
