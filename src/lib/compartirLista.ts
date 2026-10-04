import { linkDe, ofrecer } from './compartir'

export function linkDeLista(id: string): string {
  return linkDe('lista', id)
}

/**
 * La invitación pide entrar antes de leer una lista privada.
 * El permiso viaja en el enlace; el dueño puede retirar colaboradores.
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
