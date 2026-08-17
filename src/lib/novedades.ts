import datos from './novedades.json'

/**
 * Las novedades de cada versión, para leer adentro de la app.
 *
 * Viven en un JSON **adentro del bundle** y no en la base ni en GitHub: así la
 * pantalla anda igual en la web, el escritorio y el teléfono, sin red y sin
 * pedir nada — y cada versión muestra exactamente las notas con las que salió.
 *
 * Es JSON y no un módulo de TS a propósito: el release de escritorio publica
 * estas mismas notas en GitHub (desktop/scripts/notas-release.mjs), y ese
 * script corre en Node pelado, sin compilar nada. Una sola fuente para las dos
 * puntas.
 *
 * La `version` es la del escritorio, que es la única numerada de cara a la
 * gente (el tag `escritorio-v*`); en el teléfono y la web sirve de referencia.
 */
export type Novedad = {
  version: string
  fecha: string
  titulo: string
  cambios: string[]
}

/** De la más nueva a la más vieja, que es como se leen. */
export const NOVEDADES: Novedad[] = datos
