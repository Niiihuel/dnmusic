import { useCallback, useEffect } from 'react'
import { leerAjustes } from '../state/ajustes'
import { TECLADO_FISICO } from '../lib/teclado'
import { cerrarTooltip, mostrarTooltipYa, pedirTooltip, soltarTooltip } from '../state/tooltip'

export function useConTooltip(texto?: string) {
  useEffect(
    () => () => {
      // Si el botón se va mientras su rótulo está puesto, el rótulo se va con él.
      cerrarTooltip()
    },
    [],
  )

  /*
   * El botón se mide **desde el propio evento**, no con una ref.
   *
   * `getBoundingClientRect` da el rectángulo exacto y al instante, mientras que
   * `measureInWindow` contesta un cuadro después — con el cursor moviéndose,
   * ese retraso alcanza para dibujar el rótulo donde el botón ya no está. Y de
   * paso no hace falta una ref por botón, que además el compilador de React no
   * deja leer durante el dibujado.
   *
   * Es legítimo usar DOM acá: esto solo corre con mouse, y eso solo pasa en web.
   */
  const medir = useCallback(
    (e: unknown, ya: boolean) => {
      if (!texto || !TECLADO_FISICO || (!ya && !leerAjustes().ayudasCursor)) return
      const nodo = (e as { currentTarget?: { getBoundingClientRect?: () => DOMRect } })
        ?.currentTarget
      const r = nodo?.getBoundingClientRect?.()
      if (!r) return
      const tip = { texto, x: r.left, y: r.top, w: r.width, h: r.height }
      if (ya) mostrarTooltipYa(tip)
      else pedirTooltip(tip)
    },
    [texto],
  )

  const gestos =
    texto && TECLADO_FISICO
      ? {
          onPointerEnter: (e: unknown) => medir(e, false),
          onPointerLeave: () => soltarTooltip(),
          // El foco del teclado lo muestra al toque, como pide la APG.
          onFocus: (e: unknown) => medir(e, true),
          onBlur: () => cerrarTooltip(),
          /* Apretar lo cierra: la persona ya decidió, el rótulo sobra. */
          onPointerDown: () => cerrarTooltip(),
        }
      : {}

  return { gestos }
}
