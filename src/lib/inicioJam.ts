/** La canción visible debe sobrevivir al filtro de audios pendientes de la cola. */
type CancionJam = { id: string; videoId: string; audioPath: string }
type Reproduccion<T> = {
  tracks: T[]
  upNext: T[]
  manual: T | null
  index: number
  wantPlay: boolean
  positionMs: number
}

function actualDe<T>(p: Reproduccion<T>): T | null {
  return p.manual ?? p.tracks[p.index] ?? null
}

export async function prepararInicioJam<T extends CancionJam>({ leer, preparar, vigente }: {
  leer: () => Reproduccion<T>
  preparar: (track: T) => Promise<T>
  vigente: () => boolean
}): Promise<{ canciones: T[]; indice: number; suena: boolean; posicionMs: number }> {
  const elegida = actualDe(leer())
  if (!elegida) throw new Error('Poné algo a sonar primero: el Jam arranca con tu cola.')
  if (!vigente()) throw new Error('La reproducción cambió. Volvé a iniciar el Jam.')
  const resuelta = elegida.audioPath ? elegida : await preparar(elegida)
  // La descarga puede tardar: ni la posición, ni la pausa, ni la cola del clic
  // siguen necesariamente vigentes. Tampoco se puede emitir desde un espejo.
  const p = leer()
  const actual = actualDe(p)
  if (!vigente() || actual?.id !== elegida.id || actual.videoId !== elegida.videoId) {
    throw new Error('La reproducción cambió. Volvé a iniciar el Jam.')
  }
  const primera = actual.audioPath ? actual : { ...actual, audioPath: resuelta.audioPath }
  if (!primera.audioPath || !primera.videoId) throw new Error('No se pudo preparar el audio para compartir.')
  const disponible = (t: T) => !!t.audioPath && !!t.videoId
  // El límite del RPC nunca debe cortar la actual, aunque esté después de 500.
  const antes = p.manual ? [] : p.tracks.slice(0, p.index).filter(disponible).slice(-499)
  const despues = [...p.upNext, ...p.tracks.slice(p.index + 1)].filter(disponible)
  return {
    canciones: [...antes, primera, ...despues].slice(0, 500),
    indice: antes.length,
    suena: p.wantPlay,
    posicionMs: p.positionMs,
  }
}
