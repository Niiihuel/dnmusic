/**
 * Notificaciones del sistema, en la app de escritorio.
 *
 * Es el equivalente de escritorio de lo que en iOS hace el push (ver el
 * circuito de `private.push_relay` → `/push` → Expo), con una diferencia de
 * fondo: **el push existe para cuando la app está cerrada**, y esto solo
 * funciona con la app abierta. En el teléfono eso importa mucho; en la compu,
 * donde la app vive minimizada o detrás del navegador todo el día, alcanza para
 * lo que se le pide — enterarte de un mensaje sin tener que ir a mirar.
 *
 * No monta nada nuevo para saber que llegó algo: se cuelga del mismo refresco
 * de la bandeja que ya dispara realtime (`subscribeToInbox`).
 */

type PuenteEscritorio = { enfocar?: () => void }

function puente(): PuenteEscritorio | undefined {
  if (typeof globalThis === 'undefined') return undefined
  return (globalThis as { dnmusicEscritorio?: PuenteEscritorio }).dnmusicEscritorio
}

/**
 * Si acá se puede notificar.
 *
 * Pide las dos cosas: estar adentro de la app de escritorio —el puente del
 * preload— y que exista la API. En un navegador común devuelve false a
 * propósito: notificar desde una pestaña obliga a pedir permiso con un diálogo
 * que nadie pidió, y la web ya tiene el globito en la bandeja para lo mismo.
 */
export function hayNotificaciones(): boolean {
  return Boolean(puente()) && typeof Notification !== 'undefined'
}

let permisoPedido = false

/**
 * Pedir permiso una sola vez por sesión.
 *
 * En Electron el proceso principal contesta que sí sin molestar a nadie (ver
 * `permitirNotificaciones` en desktop/src/main.ts), así que esto no dibuja
 * ningún diálogo: es el paso que la API exige igual antes de dejar notificar.
 */
export async function prepararNotificaciones(): Promise<void> {
  if (!hayNotificaciones() || permisoPedido) return
  permisoPedido = true
  try {
    if (Notification.permission === 'default') await Notification.requestPermission()
  } catch {
    /* Un permiso denegado no es un error de la app: simplemente no se notifica. */
  }
}

/**
 * Un aviso del sistema.
 *
 * Silencioso si la ventana está adelante y a la vista: si ya estás mirando la
 * app, el mensaje se ve solo y una notificación encima sería avisarte de algo
 * que tenés delante de los ojos. Con la ventana atrás o minimizada, sí.
 *
 * `tag` hace que el sistema **reemplace** la notificación anterior de la misma
 * conversación en vez de apilar una por mensaje: tres mensajes seguidos de la
 * misma persona son un aviso que se actualiza, no tres avisos.
 */
export function notificar({
  titulo,
  cuerpo,
  tag,
  alTocar,
}: {
  titulo: string
  cuerpo: string
  tag?: string
  alTocar?: () => void
}): void {
  if (!hayNotificaciones()) return
  if (Notification.permission !== 'granted') return
  if (typeof document !== 'undefined' && document.hasFocus() && !document.hidden) return

  try {
    const aviso = new Notification(titulo, { body: cuerpo, tag, silent: false })
    aviso.onclick = () => {
      /* Primero la ventana al frente —desde el renderer solo no se puede— y
         recién después lo que haya que abrir adentro. */
      puente()?.enfocar?.()
      alTocar?.()
    }
  } catch {
    /* El escritorio puede tener las notificaciones apagadas para la app. No es
       algo que se pueda arreglar desde acá ni que valga un cartel. */
  }
}
