/** Última elección gana: resolver una canción nunca puede cambiar otro Jam. */
export function crearSeleccionJam<T extends { audioPath: string }>({
  preparar,
  publicar,
  vigente,
  onError,
}: {
  preparar: (cancion: T, signal: AbortSignal) => Promise<T>
  publicar: (jamId: string, canciones: T[]) => Promise<void>
  vigente: (jamId: string) => boolean
  onError: (error: unknown) => void
}) {
  let generacion = 0
  let control: AbortController | null = null
  let envios = Promise.resolve()
  function cancelar() {
    generacion++
    control?.abort()
    control = null
  }
  async function elegir(jamId: string, tracks: T[], desde: number) {
    const elegida = tracks[desde]
    if (!elegida) return
    cancelar()
    const turno = generacion
    const pedido = new AbortController()
    control = pedido
    const actual = () => turno === generacion && !pedido.signal.aborted && vigente(jamId)
    try {
      const primera = elegida.audioPath ? elegida : await preparar(elegida, pedido.signal)
      if (!actual()) return
      const canciones = [
        primera,
        ...tracks
          .slice(desde + 1)
          .filter((t) => t.audioPath)
          .slice(0, 299),
      ]
      envios = envios
        .catch(() => undefined)
        .then(async () => {
          if (actual()) await publicar(jamId, canciones)
        })
      await envios
    } catch (error) {
      if (actual()) onError(error)
    } finally {
      if (turno === generacion) control = null
    }
  }
  return { elegir, cancelar }
}
