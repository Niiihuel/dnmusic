import { baseDe, linkDe, ofrecer } from './compartir'

/**
 * Los dos links de una lista: el de mirarla y el de sumarse a armarla.
 *
 * El dominio y la hoja de compartir viven en `lib/compartir`, que es lo que
 * comparten los cuatro compartibles. Acá queda lo que es de una lista y de
 * nadie más: que tenga **dos** links distintos.
 */
export const BASE_LISTA = baseDe('lista')

export function linkDeLista(id: string): string {
  return linkDe('lista', id)
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
  return `${linkDeLista(id)}?colaborar=1`
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
