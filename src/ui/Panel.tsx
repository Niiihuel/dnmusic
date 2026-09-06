import type { PropsWithChildren } from 'react'
import { useWindowDimensions, View, type ViewStyle } from 'react-native'

/** Debajo de esto el contenido va de borde a borde. Igual que en el layout. */
const SHELL_PX = 780

/**
 * Panel: la unidad de layout de la app.
 *
 * En escritorio las columnas van **de borde a borde y se separan por
 * luminancia**: los laterales —la biblioteca, el inspector de la derecha— son
 * más oscuros que el contenido del medio, sin huecos, sin redondeo y sin una
 * sola línea. Es el orden de macOS 26/27: la ventana es una superficie
 * continua, el vidrio queda para la capa de controles que flota encima
 * (encabezado, reproductor), y los paneles son el fondo.
 *
 * Antes esto era el recurso de Spotify —tarjetas redondeadas flotando sobre
 * negro— y se cambió a propósito cuando el reproductor tomó la forma de Apple
 * Music: dos lenguajes de escritorio a la vez se leen como dos apps.
 *
 * **En el teléfono no hay paneles.** Con un solo panel a la vista no hay nada
 * que separar: el contenido ocupa todo el ancho, como en Spotify y en Apple
 * Music.
 */
export function Panel({
  children,
  className = '',
  tone = 'contenido',
  style,
}: PropsWithChildren<{
  className?: string
  /** `lateral` es la columna oscura de los costados; `contenido` la del medio. */
  tone?: 'contenido' | 'lateral'
  /** Medidas que no salen de una clase: el ancho fijo de una barra lateral. */
  style?: ViewStyle
}>) {
  const { width } = useWindowDimensions()
  const suelto = width < SHELL_PX

  return (
    <View
      style={style}
      className={`overflow-hidden ${
        suelto
          ? 'bg-background'
          : tone === 'lateral'
            ? 'bg-canvas'
            : /* La hoja de contenido de macOS: el escalón más claro toma
                 esquinas suaves contra el cromo, y deja de leerse como una
                 caja recortada. 8px, el radio de contenedor de DESIGN.md. */
              'rounded-lg bg-background'
      } ${className}`}
    >
      {children}
    </View>
  )
}

/**
 * Contenedor raíz de una pantalla.
 *
 * El fondo negro del lienzo asoma solo donde no hay columna —la franja del
 * encabezado—, que es el mismo tono de los laterales: el cromo de la ventana
 * es una sola pieza oscura y el contenido, un escalón más claro, es lo que
 * resalta. En el teléfono no hay ni margen ni hueco, por lo mismo que el
 * panel pierde la separación.
 */
export function Shell({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return (
    <View className="flex-1 bg-canvas">
      <View className={`flex-1 ${className}`}>{children}</View>
    </View>
  )
}
