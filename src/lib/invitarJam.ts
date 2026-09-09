import { baseDe, linkDe, ofrecer } from './compartir'

/**
 * El link que se comparte para entrar a un Jam. La misma URL entra por web y
 * por la app.
 *
 * El dominio y la hoja de compartir salieron a `lib/compartir`, que es lo que
 * comparten los cuatro compartibles. Acá queda lo que es del Jam: que además
 * del link hay un **código corto**, que se dicta en voz alta y se escribe a
 * mano, y que por eso necesita perdonar lo que un link no.
 *
 * Vive en su propio módulo porque lo comparten tres pantallas (el sheet del
 * teléfono, el panel de escritorio y la hoja de invitar).
 */
export const BASE_INVITACION = baseDe('jam')

export function linkDeJam(code: string): string {
  return linkDe('jam', code)
}

/**
 * El código de un Jam a partir de lo que la persona pegó: el link entero
 * (`…/jam/ABC123`) o el código suelto. Devuelve null si no parece uno.
 *
 * Se perdona mayúsculas, espacios y el link porque acá se escribe **a mano** —
 * el que entra tipea lo que le pasaron por chat—. El servidor igual valida
 * (`unirse_jam` hace `upper(btrim(...))`), así que un código raro no rompe: la
 * pantalla del código dirá que ese Jam no existe.
 */
export function codigoDeJam(entrada: string): string | null {
  const t = entrada.trim()
  if (!t) return null
  const m = t.match(/jam\/([^/?#\s]+)/i)
  const code = (m ? m[1] : t).trim().toUpperCase()
  return /^[A-Z0-9]{4,10}$/.test(code) ? code : null
}

/** Ofrecer el link del Jam por el gesto nativo de cada lado. */
export async function invitarAlJam(code: string): Promise<void> {
  const url = linkDeJam(code)
  await ofrecer(url, `Escuchemos juntos en dnmusic: ${url}`)
}
