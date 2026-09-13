import { useEffect, useRef, useState } from 'react'
import { cancelarTraspaso, confirmarTraspaso, useTransferenciaEscucha, useTraspasoPendiente } from '../state/escucha'

/** La decisión retenida pertenece al store. La UI sólo guarda el intento para
 * bloquear dobles toques y no presentar errores de una transferencia anterior. */
export function useConfirmacionTraspaso() {
  const pendiente = useTraspasoPendiente()
  const transferencia = useTransferenciaEscucha()
  const vigente = useRef(pendiente)
  const enviando = useRef(false)
  const [intento, setIntento] = useState<{ decision: typeof pendiente; ocupado: boolean; fallo: boolean } | null>(null)
  useEffect(() => { vigente.current = pendiente }, [pendiente])
  useEffect(() => () => { vigente.current = null }, [])
  const propio = intento?.decision === pendiente ? intento : null
  const ocupado = !!propio?.ocupado || transferencia?.estado === 'pendiente'
  const error = propio?.fallo && !ocupado
    ? transferencia?.estado === 'error' && transferencia.error
      ? transferencia.error : 'No se pudo traer la música. Intentá nuevamente.'
    : null

  async function confirmar() {
    if (!pendiente || vigente.current !== pendiente || enviando.current || ocupado) return
    enviando.current = true
    setIntento({ decision: pendiente, ocupado: true, fallo: false })
    let exito = false
    try { exito = await confirmarTraspaso() } catch { /* El diálogo conserva el reintento. */ }
    finally {
      enviando.current = false
      if (vigente.current === pendiente) setIntento({ decision: pendiente, ocupado: false, fallo: !exito })
    }
  }
  function cancelar() {
    if (pendiente && vigente.current === pendiente && !enviando.current && !ocupado) cancelarTraspaso()
  }
  return { pendiente, ocupado, error, confirmar, cancelar }
}
