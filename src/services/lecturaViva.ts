/** Lecturas serializadas por RPC: mantienen las mismas reglas de privacidad que
 * la primera carga. No nos suscribimos a las escuchas privadas de otra cuenta. */
export function observarLectura<T>(leer: () => Promise<T>, recibir: (valor: T | null) => void, intervalo = 3000) {
  let vivo = true
  let activo = false
  let version = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const cargar = async (v: number) => {
    try {
      const valor = await leer()
      if (vivo && activo && v === version) recibir(valor)
    } catch {
      // Una lectura fallida no debe seguir afirmando que alguien escucha ahora.
      if (vivo && activo && v === version) recibir(null)
    } finally {
      if (vivo && activo && v === version) timer = setTimeout(() => void cargar(v), intervalo)
    }
  }
  return {
    activar(siguiente: boolean) {
      if (!vivo || activo === siguiente) return
      activo = siguiente
      version++
      clearTimeout(timer)
      if (activo) void cargar(version)
    },
    cerrar() { vivo = false; activo = false; version++; clearTimeout(timer) },
  }
}

export const LATIDO_ESCUCHA_MS = 20_000
export const VIGENCIA_ESCUCHA_MS = 65_000
export function escuchaVigente(suena: boolean, cuando: Date | null, ahora = Date.now()) {
  if (!suena || !cuando) return false
  const edad = ahora - cuando.getTime()
  return Number.isFinite(edad) && edad >= -VIGENCIA_ESCUCHA_MS && edad <= VIGENCIA_ESCUCHA_MS
}
