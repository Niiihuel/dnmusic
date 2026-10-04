/** El clip pertenece a la ventana, no al ancho del texto que está rebotando. */
export const ESCALA_MAX_LETRA = 1.04

export function margenLetra(ancho: number, preferido: number) {
  // Reserva el crecimiento a ambos lados y el halo del desenfoque de iOS.
  return Math.max(preferido, Math.ceil((ancho * (ESCALA_MAX_LETRA - 1) / 2 + 10) / ESCALA_MAX_LETRA))
}
