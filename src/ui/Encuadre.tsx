import { Image, View, type ImageStyle } from 'react-native'
import type { Encuadre } from '../services/profile'

/**
 * Cómo se dibuja una imagen encuadrada, en un solo lugar.
 *
 * El encuadre no es un recorte: la imagen se sube entera y esto dice cómo
 * mirarla (ver la migración `encuadre_perfil`). Que la cuenta viva acá y no en
 * cada pantalla es lo que garantiza que la foto se vea **igual** en el editor
 * mientras la movés, en tu perfil y en el de otro — tres lugares que dibujan la
 * misma imagen y que, con tres cuentas distintas, mostrarían tres recortes.
 *
 * La imagen se estira a `lado * escala` y se corre. Con `escala` 1 y sin
 * corrimiento queda exactamente como se dibujaba antes de que esto existiera:
 * cubriendo el recuadro y centrada.
 */
export function estiloEncuadrado(lado: number, encuadre: Encuadre | null): ImageStyle {
  const escala = encuadre?.escala ?? 1
  const medida = lado * escala
  /* El corrimiento va en fracciones del lado, no en píxeles: así el mismo
     encuadre sirve para el redondel de 32 de una fila y para el de 136 del
     encabezado. Guardar píxeles ataría el dato al tamaño donde se eligió. */
  const dx = (encuadre?.x ?? 0) * lado
  const dy = (encuadre?.y ?? 0) * lado
  return {
    position: 'absolute',
    width: medida,
    height: medida,
    /* Centrado primero, corrido después: `(lado - medida) / 2` es lo que deja
       la imagen agrandada centrada, y de ahí se mueve. */
    left: (lado - medida) / 2 + dx,
    top: (lado - medida) / 2 + dy,
  }
}

/**
 * Una imagen dentro de su recuadro, con el encuadre aplicado.
 *
 * `overflow: hidden` en el contenedor es lo que hace de máscara: la imagen es
 * más grande que el hueco y lo que sobra se recorta al dibujar, sin tocar el
 * archivo.
 */
export function ImagenEncuadrada({
  uri,
  lado,
  encuadre,
  redonda = false,
}: {
  uri: string
  /** El lado del recuadro. Cuadrado: es la forma de una foto de perfil. */
  lado: number
  encuadre: Encuadre | null
  redonda?: boolean
}) {
  return (
    <View
      style={{
        width: lado,
        height: lado,
        overflow: 'hidden',
        borderRadius: redonda ? lado / 2 : 12,
      }}
    >
      <Image source={{ uri }} style={estiloEncuadrado(lado, encuadre)} resizeMode="cover" />
    </View>
  )
}
