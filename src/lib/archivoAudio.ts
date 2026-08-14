/**
 * El diálogo de elegir un archivo de audio, en la web.
 *
 * Es la puerta de «agregar una canción de mi compu»: existe solo donde hay un
 * sistema de archivos a mano — el navegador de escritorio—. En el teléfono la
 * fila de menú directamente no se ofrece (ver quien llama), así que acá no
 * hace falta un camino nativo.
 *
 * Devuelve `null` si se canceló. El `input` no se cuelga del DOM: `click()`
 * sobre un input suelto alcanza en todos los navegadores actuales.
 */
export function elegirArchivoAudio(): Promise<File | null> {
  if (typeof document === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'audio/*,.mp3,.m4a,.aac,.wav,.flac'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    /* Chrome moderno emite `cancel` al cerrar sin elegir; donde no exista, la
       promesa queda colgada sin efecto — no hay nada esperándola con timeout. */
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}
