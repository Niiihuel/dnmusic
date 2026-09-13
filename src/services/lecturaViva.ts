/** Lecturas serializadas y cancelables. El timeout retira el último valor;
 * un lector que ignora AbortSignal no permite acumular solicitudes paralelas. */
export function observarLectura<T>(leer: (signal?: AbortSignal) => Promise<T>, recibir: (valor: T | null) => void, intervalo = 3000) {
  let vivo = true
  let activo = false
  let version = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  type LecturaEnCurso = { abort: AbortController; version: number; deadline?: ReturnType<typeof setTimeout> }
  let ejecutando: LecturaEnCurso | null = null
  const pausa = Number.isFinite(intervalo) ? Math.max(250, Math.min(60_000, intervalo)) : 3000
  const cargar = async (v: number) => {
    if (ejecutando || !vivo || !activo) return
    const operacion: LecturaEnCurso = { abort: new AbortController(), version: v }
    ejecutando = operacion
    let vencida = false
    const deadline = setTimeout(() => {
      vencida = true
      operacion.abort.abort()
      if (vivo && activo && v === version) recibir(null)
    }, 10_000)
    operacion.deadline = deadline
    try {
      const valor = await leer(operacion.abort.signal)
      if (!vencida && vivo && activo && v === version) recibir(valor)
    } catch {
      if (!vencida && vivo && activo && v === version) recibir(null)
    } finally {
      clearTimeout(deadline)
      if (ejecutando === operacion) ejecutando = null
      if (vivo && activo) {
        if (v === version) timer = setTimeout(() => void cargar(version), pausa)
        else void cargar(version)
      }
    }
  }
  return {
    activar(siguiente: boolean) {
      if (!vivo || activo === siguiente) return
      activo = siguiente
      version++
      clearTimeout(timer)
      ejecutando?.abort.abort()
      clearTimeout(ejecutando?.deadline)
      if (activo) void cargar(version)
    },
    cerrar() { vivo = false; activo = false; version++; clearTimeout(timer); ejecutando?.abort.abort(); clearTimeout(ejecutando?.deadline) },
  }
}

export const LATIDO_ESCUCHA_MS = 20_000
export const VIGENCIA_ESCUCHA_MS = 65_000
export function escuchaVigente(suena: boolean, cuando: Date | null, ahora = Date.now()) {
  if (!suena || !cuando) return false
  const edad = ahora - cuando.getTime()
  return Number.isFinite(edad) && edad >= -VIGENCIA_ESCUCHA_MS && edad <= VIGENCIA_ESCUCHA_MS
}
