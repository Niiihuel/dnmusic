import { Platform } from 'react-native'
import { enlaceDeDnmusic, linkDe, type Compartible } from './compartir'

/**
 * Mandar a quien está en el navegador a la app instalada, si es que la tiene.
 *
 * **No hay forma de preguntarle al sistema si una app está instalada** — ningún
 * navegador la ofrece, y es a propósito: sería una huella digital perfecta—. Lo
 * único que se puede hacer es lo que hacen Spotify, Slack y Zoom: intentar
 * abrir el esquema propio y mirar si la pestaña se fue a segundo plano. Si se
 * fue, la app tomó el link; si sigue acá al vencer el plazo, no está instalada
 * y la web se queda con la persona.
 *
 * En iOS esto casi nunca corre: el universal link ya abrió la app **antes** de
 * que existiera una pestaña. Se llega acá por el camino contrario —el usuario
 * volvió a Safari desde la miga de pan de arriba a la derecha—, y ahí el botón
 * tiene que seguir funcionando.
 *
 * En el escritorio el esquema lo registra Electron con
 * `setAsDefaultProtocolClient('dnmusic')`; ver `desktop/src/main.ts`.
 */
const ESPERA_MS = 1400

export function puedeIntentarLaApp(): boolean {
  /* En la app nativa ya estás adentro; no hay a dónde saltar. */
  return Platform.OS === 'web' && typeof document !== 'undefined'
}

/**
 * Devuelve `true` si la app se llevó el link. El `false` no prueba que no esté
 * instalada —una ventana que tarda puede pasarse del plazo—, pero es la
 * respuesta correcta para lo único que decide: si mostrar la web o no.
 */
export async function abrirEnLaApp(que: Compartible, id: string): Promise<boolean> {
  if (!puedeIntentarLaApp()) return false
  const destino = linkDe(que, id).replace(/^https:\/\/[^/]+/, 'dnmusic:/')

  return new Promise<boolean>((resolver) => {
    let listo = false
    const terminar = (abrio: boolean) => {
      if (listo) return
      listo = true
      document.removeEventListener('visibilitychange', alEsconderse)
      window.removeEventListener('blur', alPerderFoco)
      clearTimeout(reloj)
      resolver(abrio)
    }
    const alEsconderse = () => document.hidden && terminar(true)
    const alPerderFoco = () => terminar(true)
    document.addEventListener('visibilitychange', alEsconderse)
    window.addEventListener('blur', alPerderFoco)
    const reloj = setTimeout(() => terminar(false), ESPERA_MS)

    /*
     * `location.href` y no un `<a>` ni `window.open`: un esquema que el sistema
     * no conoce hace que `window.open` deje una pestaña en blanco abierta, y
     * eso se ve —una ventana vacía que nadie pidió— aun cuando el salto
     * funciona. Con `location.href`, un esquema desconocido no hace nada
     * visible y el plazo decide.
     */
    try {
      window.location.href = destino
    } catch {
      terminar(false)
    }
  })
}

/** La ruta a la que lleva un `dnmusic://…`, para el escritorio. Ver `compartir`. */
export { enlaceDeDnmusic }
