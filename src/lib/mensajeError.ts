/**
 * El texto de un error, siempre con algo que decir.
 *
 * Un `Error` con mensaje vacío —o algo que ni siquiera es un Error— se mostraba
 * como un recuadro en blanco: literalmente `Object { "message": "" }` a pantalla
 * completa. Cualquier cosa que no sirva cae a una frase genérica, que es menos
 * útil que el mensaje real pero infinitamente más que nada.
 *
 * Vive suelto y no adentro de un componente porque lo necesitan las cuatro
 * pantallas que reproducen fragmentos, y cada una tenía su propia forma de no
 * decir nada.
 */
export function mensajeError(e: unknown): string {
  const texto = e instanceof Error ? e.message : String(e ?? '')
  return texto.trim() || 'No se pudo completar la acción.'
}
