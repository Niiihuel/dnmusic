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
 * El link que **suma** a quien lo abre, en vez de solo mostrarle la lista.
 *
 * Tiene que ser distinto del de mirar por una razón que no es de estilo: una
 * lista colaborativa suele ser privada, y una privada no se le puede leer a
 * quien todavía no es colaborador — con el link común vería «esta lista no está
 * disponible». El `?colaborar=1` es lo que le dice a la pantalla que primero
 * pida entrar y después cargue, que es el único orden que funciona.
 *
 * Que el permiso viaje en el link es la misma decisión que en el Jam: tener el
 * link **es** la invitación. Si se fue de las manos, el dueño saca a quien sobre.
 */
export function linkParaColaborar(id: string): string {
  return `${BASE_LISTA}/${id}?colaborar=1`
}

/** Pasar la lista para que la escuchen. */
export async function compartirLista(id: string, nombre: string): Promise<void> {
  const enlace = linkDeLista(id)
  await ofrecer(enlace, `Escuchá «${nombre}» en dnmusic: ${enlace}`)
}

/** Lo mismo, pero el link suma a quien lo abra. Ver `linkParaColaborar`. */
export async function invitarAColaborar(id: string, nombre: string): Promise<void> {
  const enlace = linkParaColaborar(id)
  await ofrecer(enlace, `Sumate a «${nombre}» en dnmusic y poné tus canciones: ${enlace}`)
}

/**
 * El gesto nativo de cada lado: la hoja de compartir en el teléfono, el
 * portapapeles en el navegador — que no tiene hoja.
 *
 * El nombre viaja en el mensaje porque una URL con un uuid no dice nada de qué
 * se está pasando; con el nombre, quien lo recibe sabe si le interesa antes de
 * tocarlo.
 */
async function ofrecer(enlace: string, mensaje: string): Promise<void> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(enlace)
      avisar('Link copiado. Mandáselo a quien quieras.')
      return
    } catch {
      // Sin permiso de portapapeles: cae a la hoja de compartir.
    }
  }
  try {
    await Share.share({ message: mensaje })
  } catch {
    avisar(`Compartí el link ${enlace}`)
  }
}
