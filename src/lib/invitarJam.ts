import { Platform, Share } from 'react-native'
import { avisar } from '../state/aviso'
import { copiarAlPortapapeles } from './portapapeles'

/**
 * El link que se comparte para entrar a un Jam. La misma URL entra por web y
 * por la app.
 *
 * Va cableado y no en una variable de entorno a propósito: es el dominio que
 * está declarado en `associatedDomains` y en el `apple-app-site-association`,
 * y los tres tienen que decir lo mismo o el link deja de abrir la app. Un
 * valor que se puede cambiar por build es justo lo que no queremos acá.
 *
 * Vive en su propio módulo porque lo comparten tres pantallas (el sheet del
 * teléfono, el panel de escritorio y la hoja de invitar): antes estaba copiado
 * en dos archivos con un comentario pidiendo mantenerlos iguales a mano.
 */
export const BASE_INVITACION = 'https://dnmusic-app.vercel.app/jam'

export function linkDeJam(code: string): string {
  return `${BASE_INVITACION}/${code}`
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

/**
 * Ofrecer el link por el gesto nativo de cada lado: la hoja de compartir en
 * el teléfono, el portapapeles en el navegador — que no tiene hoja. Si ninguno
 * de los dos camina (web sin https, escritorio pelado), el código dicho con
 * palabras alcanza.
 */
export async function invitarAlJam(code: string): Promise<void> {
  const url = linkDeJam(code)
  // El link se copia siempre, en todos lados: era lo que fallaba —en el
  // escritorio `navigator.clipboard` no está y se caía a la hoja de compartir,
  // que en web no existe, y el link nunca llegaba a ningún lado—.
  const copiado = await copiarAlPortapapeles(url)
  if (Platform.OS !== 'web') {
    // En el teléfono, además, la hoja nativa para mandarlo por donde sea.
    try {
      await Share.share({ message: `Escuchemos juntos en dnmusic: ${url}` })
      return
    } catch {
      // Hoja cancelada: no importa, el link ya quedó en el portapapeles.
    }
  }
  avisar(
    copiado
      ? 'Link copiado. Mandáselo a quien quieras.'
      : `Compartí el código ${code} o el link ${url}`,
  )
}
