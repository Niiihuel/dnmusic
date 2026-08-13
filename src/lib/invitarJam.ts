import { Platform, Share } from 'react-native'
import { avisar } from '../state/aviso'

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
 * Ofrecer el link por el gesto nativo de cada lado: la hoja de compartir en
 * el teléfono, el portapapeles en el navegador — que no tiene hoja. Si ninguno
 * de los dos camina (web sin https, escritorio pelado), el código dicho con
 * palabras alcanza.
 */
export async function invitarAlJam(code: string): Promise<void> {
  const url = linkDeJam(code)
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(url)
      avisar('Link copiado. Mandáselo a quien quieras.')
      return
    } catch {
      // Sin permiso de portapapeles: cae a los otros caminos.
    }
  }
  try {
    await Share.share({ message: `Escuchemos juntos en dnmusic: ${url}` })
  } catch {
    avisar(`Compartí el código ${code} o el link ${url}`)
  }
}
