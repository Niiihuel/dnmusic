import type { PlaylistTrack } from '../services/playlists'

/**
 * La canción que está por compartirse, entre el menú y la hoja.
 *
 * Va por acá y no por la URL por lo mismo que la de «Agregar a una lista»
 * (`state/listas`): una canción tiene diez campos y pasarla en la ruta la
 * vuelve ilegible. Se deja al abrir la hoja y se toma una sola vez adentro; la
 * hoja vive lo que dura decidir, y la canción no cambia mientras tanto.
 */
let pendiente: PlaylistTrack | null = null

export function dejarCancionACompartir(track: PlaylistTrack) {
  pendiente = track
}

/** Lo dejado por el menú. `null` si se entró a la hoja por las suyas. */
export function cancionACompartir(): PlaylistTrack | null {
  return pendiente
}

export function soltarCancionACompartir() {
  pendiente = null
}
