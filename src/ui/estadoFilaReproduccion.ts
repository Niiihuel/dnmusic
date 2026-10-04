/** Pausar gana sobre el estado del buffer, incluso si todavía se resuelve el audio. */
export function filaCargando(sounding: boolean, playing: boolean, cargada: boolean, busy = false): boolean {
  return sounding ? playing && (busy || !cargada) : busy
}
