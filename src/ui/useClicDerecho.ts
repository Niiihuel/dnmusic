import { useCallback, useState } from 'react'
import { TECLADO_FISICO } from '../lib/teclado'

/**
 * El click derecho de una fila: abre **su propio menú**, donde está el cursor.
 *
 * No dibuja un menú aparte a propósito. La fila ya tiene el suyo —el de los
 * tres puntos— y lo que faltaba no era otro menú sino otra puerta al mismo: un
 * menú contextual propio empezaría igual y terminaría, con el tiempo,
 * ofreciendo cosas distintas que el de al lado. Acá las dos puertas son la
 * misma lista, por construcción.
 *
 * Solo con mouse (`pointer: fine`). En una pantalla de tocar el equivalente es
 * mantener apretado, que es otro gesto y otra discusión.
 *
 * El punto va como **estado y no como un mango imperativo**: dónde está abierto
 * el menú es algo que se ve, así que es de quien dibuja. De paso el compilador
 * de React lo acepta sin ruido, que con una ref no pasaba.
 *
 * ```tsx
 * const clic = useClicDerecho()
 * <View {...clic.gestos}>
 *   …
 *   <Menu items={opciones} sinDisparador abiertoEn={clic.punto} onCerrarPunto={clic.cerrar} />
 * </View>
 * ```
 */
export function useClicDerecho() {
  const [punto, setPunto] = useState<{ x: number; y: number } | null>(null)

  const cerrar = useCallback(() => setPunto(null), [])

  const alClicDerecho = useCallback((e: unknown) => {
    const evento = e as {
      preventDefault?: () => void
      clientX?: number
      clientY?: number
      currentTarget?: { focus?: () => void }
      nativeEvent?: { clientX?: number; clientY?: number }
    }
    /* Sin esto sale el menú del navegador —o el de Electron— encima del
       nuestro. Ojo: en Firefox, Shift + click derecho muestra el del navegador
       sin avisarnos, y está bien que así sea: es la salida de emergencia. */
    evento?.preventDefault?.()
    const x = evento?.clientX ?? evento?.nativeEvent?.clientX
    const y = evento?.clientY ?? evento?.nativeEvent?.clientY
    if (typeof x !== 'number' || typeof y !== 'number') return
    evento.currentTarget?.focus?.()
    setPunto({ x, y })
  }, [])

  const alTeclado = useCallback((event: unknown) => {
    const e = event as { key?: string; shiftKey?: boolean; preventDefault?: () => void; stopPropagation?: () => void;
      currentTarget?: { getBoundingClientRect?: () => { left: number; top: number; width: number; height: number } } }
    if (e.key !== 'ContextMenu' && !(e.key === 'F10' && e.shiftKey)) return
    const rect = e.currentTarget?.getBoundingClientRect?.()
    if (!rect) return
    e.preventDefault?.()
    e.stopPropagation?.()
    setPunto({ x: rect.left + Math.min(rect.width, 32), y: rect.top + Math.min(rect.height, 32) })
  }, [])

  const gestos = TECLADO_FISICO ? ({ onContextMenu: alClicDerecho, onKeyDown: alTeclado } as object) : ({} as object)
  return { punto, cerrar, gestos }
}
