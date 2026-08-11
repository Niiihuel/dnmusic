import { useMemo, useRef } from 'react'
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native'
import { setColapsada } from '../state/shell'

/**
 * Cuánto hay que desplazar antes de que la cáscara se mueva.
 *
 * Sin margen, el temblor del dedo quieto sobre la pantalla la haría plegarse y
 * desplegarse sola. Bajar cuesta un poco más que subir a propósito: esconder
 * algo tiene que ser deliberado, y traerlo de vuelta tiene que ser fácil.
 */
const PLEGAR_PX = 24
const DESPLEGAR_PX = 12
/** Arriba de todo nunca está plegada: no hay nada que tapar. */
const TECHO_PX = 40
/**
 * Zona del final donde la decisión ya está tomada.
 *
 * Llegando al fondo, iOS estira el contenido y lo devuelve con un resorte. Ese
 * regreso es un desplazamiento **hacia arriba** que nadie pidió, y alcanzaba
 * para desplegar la barra justo al llegar abajo — se veía como que la app se
 * arrepentía sola. Dentro de este margen la barra se queda plegada y no se
 * escucha ningún delta.
 */
const FIN_PX = 72

/**
 * Pliega la cáscara al desplazar hacia abajo y la despliega al subir.
 *
 * Se devuelve como props para pegarle a cualquier lista —`{...colapso}`— en vez
 * de como un componente: las listas de la app son `FlatList` y `ScrollView` de
 * distinto tipo, y envolverlas obligaría a duplicar sus tipos.
 *
 * El estado vive en `shell` porque quien reacciona es el layout, del otro lado
 * del árbol. Mismo camino que las pestañas.
 */
export function useColapso() {
  const previo = useRef(0)

  return useMemo(
    () => ({
      scrollEventThrottle: 32,
      onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
        const y = contentOffset.y
        const fondo = Math.max(0, contentSize.height - layoutMeasurement.height)

        /*
         * Fuera del recorrido real no se decide nada.
         *
         * Tirando de más en cualquiera de las dos puntas, iOS entrega
         * posiciones negativas o más allá del fondo. Son el estiramiento del
         * material, no un gesto de navegación, y leerlos como tal hacía que la
         * barra cambiara sola en el momento en que uno frena.
         */
        if (y < 0 || y > fondo) return

        // Contenido que entra en la pantalla: no hay nada que plegar.
        if (fondo <= TECHO_PX) {
          previo.current = y
          setColapsada(false)
          return
        }

        if (y <= TECHO_PX) {
          previo.current = y
          setColapsada(false)
          return
        }

        // Contra el final se queda plegada, pase lo que pase con el resorte.
        if (y >= fondo - FIN_PX) {
          previo.current = y
          setColapsada(true)
          return
        }

        const delta = y - previo.current
        if (delta > PLEGAR_PX) {
          previo.current = y
          setColapsada(true)
        } else if (delta < -DESPLEGAR_PX) {
          previo.current = y
          setColapsada(false)
        }
      },
    }),
    [],
  )
}
