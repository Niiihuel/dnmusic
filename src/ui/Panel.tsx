import type { PropsWithChildren } from 'react'
import { useWindowDimensions, View } from 'react-native'

/** Debajo de esto el contenido va de borde a borde. Igual que en el layout. */
const SHELL_PX = 780

/**
 * Panel: la unidad de layout de la app.
 *
 * En escritorio el fondo de la ventana es negro puro y el contenido vive en
 * paneles redondeados de un gris apenas más claro, separados por un espacio. Es
 * el recurso que usa Spotify para dar estructura sin dibujar una sola línea: la
 * separación la produce el hueco entre paneles, no un borde.
 *
 * **En el teléfono no hay paneles.** Con un solo panel a la vista, el redondeo y
 * el margen no separan nada de nada: lo único que hacen es dejar un marco negro
 * alrededor del contenido —una burbuja dentro de otra— y encima cortan el
 * degradado del reproductor contra el borde de la tarjeta. Ahí el contenido
 * ocupa todo el ancho, como en Spotify y en Apple Music.
 */
export function Panel({
  children,
  className = '',
}: PropsWithChildren<{ className?: string }>) {
  const { width } = useWindowDimensions()
  const suelto = width < SHELL_PX

  return (
    <View
      className={`overflow-hidden bg-background ${suelto ? '' : 'rounded-2xl'} ${className}`}
    >
      {children}
    </View>
  )
}

/**
 * Contenedor raíz de una pantalla: fondo negro y separación entre paneles.
 *
 * En pantallas anchas el contenido se topa a un ancho legible en vez de
 * estirarse de borde a borde; en el teléfono no hay ni margen ni hueco, por lo
 * mismo que el panel pierde el redondeo.
 */
export function Shell({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  const { width } = useWindowDimensions()
  const suelto = width < SHELL_PX

  return (
    <View className={`flex-1 bg-canvas ${suelto ? '' : 'p-2'}`}>
      <View className={`flex-1 ${suelto ? '' : 'gap-2'} ${className}`}>{children}</View>
    </View>
  )
}
