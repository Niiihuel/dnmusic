import type { PickedImage } from '../lib/pickImage'

/**
 * El fondo elegido que todavía no subió.
 *
 * Elegir un fondo ya no lo sube al toque: primero se encuadra, sobre el
 * archivo local, y recién al confirmar viaja a Storage con el encuadre
 * puesto (ver `app/perfil/encuadrar`, modo `fondo-nuevo`). Entre una pantalla
 * y la otra el archivo tiene que vivir en algún lado que no sea la URL —un
 * Blob no viaja por parámetros—, y es este módulo: la misma idea que la
 * canción pendiente de `state/listas`.
 *
 * Se suelta al subir o al cancelar. Si la app se cierra en el medio no pasa
 * nada: el archivo sigue en el teléfono y se vuelve a elegir.
 */
let pendiente: PickedImage | null = null

export function dejarFondoPendiente(elegida: PickedImage) {
  pendiente = elegida
}

/** El fondo que espera encuadre, o `null`; se lee sin consumirlo. */
export function fondoPendiente(): PickedImage | null {
  return pendiente
}

export function soltarFondoPendiente() {
  pendiente = null
}
