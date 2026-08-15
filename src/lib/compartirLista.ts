import { Platform, Share } from 'react-native'
import { avisar } from '../state/aviso'

/**
 * El link de una lista pública.
 *
 * Mismo dominio cableado que el del Jam y por la misma razón: es el que está
 * declarado en `associatedDomains` y en el `apple-app-site-association`, y los
 * tres tienen que decir lo mismo o el link deja de abrir la app. Ver
 * `lib/invitarJam`, que es el hermano de este módulo.
 */
export const BASE_LISTA = 'https://dnmusic-app.vercel.app/lista'

export function linkDeLista(id: string): string {
  return `${BASE_LISTA}/${id}`
}

/**
 * Ofrecer el link por el gesto nativo de cada lado: la hoja de compartir en el
 * teléfono, el portapapeles en el navegador — que no tiene hoja.
 *
 * El nombre viaja en el mensaje porque una URL con un uuid no dice nada de qué
 * se está pasando; con el nombre, quien lo recibe sabe si le interesa antes de
 * tocarlo.
 */
export async function compartirLista(id: string, nombre: string): Promise<void> {
  const url = linkDeLista(id)
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(url)
      avisar('Link copiado. Mandáselo a quien quieras.')
      return
    } catch {
      // Sin permiso de portapapeles: cae a la hoja de compartir.
    }
  }
  try {
    await Share.share({ message: `Escuchá «${nombre}» en dnmusic: ${url}` })
  } catch {
    avisar(`Compartí el link ${url}`)
  }
}
