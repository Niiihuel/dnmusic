/** Cuenta avance confirmado por el reproductor, también con la pantalla apagada. */
export function crearMedidorEscucha() {
  let anterior: { posicionMs: number; relojMs: number; sonando: boolean } | null = null
  return {
    medir(posicionMs: number, relojMs: number, sonando: boolean, buscando = false) {
      if (!Number.isFinite(posicionMs) || !Number.isFinite(relojMs)) { anterior = null; return 0 }
      const previo = anterior
      anterior = { posicionMs, relojMs, sonando: sonando && !buscando }
      if (!previo || !previo.sonando || buscando) return 0
      const tiempo = relojMs - previo.relojMs, avance = posicionMs - previo.posicionMs
      // No sumamos saltos, buffering ni el tiempo de una app que quedó suspendida.
      if (tiempo <= 0 || tiempo > 10_000 || avance <= 0 || avance > tiempo * 1.1 + 250) return 0
      return Math.min(tiempo, avance)
    },
    reiniciar() { anterior = null },
  }
}
