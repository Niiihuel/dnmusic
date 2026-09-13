/** Vigila eventos de audio, sin polling ni trabajo visual en segundo plano. */
export type EstadoAudioVigilado = {
  currentTime: number; playing: boolean; isLoaded: boolean; isBuffering: boolean
  timeControlStatus?: string; playbackState?: string; error?: string | null; didJustFinish?: boolean
}
export type PresupuestoRecuperacion = { intentos: number; posicionMs?: number; pendienteConfirmar?: boolean }
export type IncidenciaRecuperacion = { tipo: 'fallo' | 'reintento' | 'recuperado' | 'agotado'; motivo: string; intento?: number }

export function crearVigilanteAudio({ presupuesto, sigue, recargar, agotado, incidencia = () => {}, ahora = Date.now,
  programar = setTimeout, cancelar = clearTimeout }: {
  presupuesto: PresupuestoRecuperacion
  sigue: () => boolean
  recargar: (posicionMs: number, signal: AbortSignal) => Promise<void>
  agotado: () => void
  incidencia?: (evento: IncidenciaRecuperacion) => void
  ahora?: () => number
  programar?: typeof setTimeout
  cancelar?: typeof clearTimeout
}) {
  const abort = new AbortController()
  let vivo = true, ocupado = false, terminal = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let sinProgresoDesde: number | null = null
  let ultimaPosicion = (presupuesto.posicionMs ?? 0) / 1000
  const vigente = () => vivo && sigue()
  const fallo = (motivo: string) => {
    if (!vigente() || ocupado || terminal) return
    incidencia({ tipo: 'fallo', motivo })
    if (presupuesto.intentos >= 2) {
      terminal = true
      incidencia({ tipo: 'agotado', motivo: 'reintentos-agotados', intento: presupuesto.intentos })
      agotado()
      return
    }
    ocupado = true
    const intento = ++presupuesto.intentos
    presupuesto.pendienteConfirmar = true
    incidencia({ tipo: 'reintento', motivo: 'renovar-fuente', intento })
    timer = programar(() => {
      timer = undefined
      if (!vigente()) { ocupado = false; return }
      void recargar(ultimaPosicion * 1000, abort.signal).then(() => {
        ocupado = false
        sinProgresoDesde = null
      }, error => {
        ocupado = false
        if (vigente()) fallo(error instanceof Error ? error.message : 'fallo-apertura')
      })
    }, intento === 1 ? 1000 : 3000)
  }
  return {
    recibir(status: EstadoAudioVigilado): boolean {
      if (!vigente()) return false
      // Se conserva el último segundo válido si el player fallido vuelve a cero.
      const posicion = Number.isFinite(status.currentTime) ? Math.max(0, status.currentTime) : ultimaPosicion
      if (!status.error && status.playbackState !== 'failed' && status.isLoaded && (!ocupado || timer !== undefined)) {
        if (posicion > ultimaPosicion + 0.05) sinProgresoDesde = null
        ultimaPosicion = posicion
        presupuesto.posicionMs = posicion * 1000
      }
      if (status.error || status.playbackState === 'failed') { fallo(status.error || 'fallo-reproductor'); return true }
      if (status.didJustFinish) { sinProgresoDesde = null; return false }
      if (ocupado && timer !== undefined && status.playing && status.isLoaded && !status.isBuffering) {
        cancelar(timer); timer = undefined; ocupado = false
      }
      if (ocupado || terminal) return true
      if (status.playing && status.isLoaded && !status.isBuffering) {
        sinProgresoDesde = null
        if (presupuesto.pendienteConfirmar) {
          presupuesto.pendienteConfirmar = false
          incidencia({ tipo: 'recuperado', motivo: 'audio-reanudado', intento: presupuesto.intentos })
        }
      } else if (status.isBuffering || status.timeControlStatus === 'waitingToPlayAtSpecifiedRate') {
        sinProgresoDesde ??= ahora()
        if (ahora() - sinProgresoDesde >= 15_000) { fallo('buffer-sin-progreso'); return true }
      } else {
        // Una pausa real no es un bloqueo de red: jamás la reanuda el vigilante.
        sinProgresoDesde = null
      }
      return false
    },
    cancelar() { vivo = false; abort.abort(); if (timer !== undefined) cancelar(timer) },
  }
}

/** La firma es corta: un fallo transitorio no debe dejar muda toda la cola. */
export async function abrirFuenteConReintento<T>(abrir: () => Promise<T>, signal: AbortSignal): Promise<T> {
  for (let intento = 0; ; intento++) {
    if (signal.aborted) throw Object.assign(new Error('Cancelado'), { name: 'AbortError' })
    try {
      const resultado = await esperarAperturaAudio(abrir, signal)
      if (signal.aborted) throw Object.assign(new Error('Cancelado'), { name: 'AbortError' })
      return resultado
    } catch (error) {
      if (signal.aborted || intento >= 2) throw error
      await new Promise<void>((resolve, reject) => {
        const abortar = () => { clearTimeout(timer); reject(Object.assign(new Error('Cancelado'), { name: 'AbortError' })) }
        const timer = setTimeout(() => { signal.removeEventListener('abort', abortar); resolve() }, intento === 0 ? 750 : 2000)
        signal.addEventListener('abort', abortar, { once: true })
        if (signal.aborted) abortar()
      })
    }
  }
}

/** Un firmante lento no mantiene la transición pendiente indefinidamente. */
export function esperarAperturaAudio<T>(abrir: () => Promise<T>, signal: AbortSignal, limiteMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(Object.assign(new Error('Cancelado'), { name: 'AbortError' })); return }
    let terminado = false
    const terminar = (fn: () => void) => {
      if (terminado) return
      terminado = true; clearTimeout(timer); signal.removeEventListener('abort', abortar); fn()
    }
    const abortar = () => terminar(() => reject(Object.assign(new Error('Cancelado'), { name: 'AbortError' })))
    const timer = setTimeout(() => terminar(() => reject(new Error('Tiempo de espera agotado al abrir el audio'))), limiteMs)
    signal.addEventListener('abort', abortar, { once: true })
    Promise.resolve().then(() => signal.aborted ? Promise.reject(Object.assign(new Error('Cancelado'), { name: 'AbortError' })) : abrir()).then(
      value => terminar(() => resolve(value)), error => terminar(() => reject(error)),
    )
  })
}
