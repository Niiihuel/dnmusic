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
 * La imagen se estira a `lado * escala`, se corre y, si hay rotación, se gira
 * sobre su propio centro. Con `escala` 1 y sin corrimiento queda exactamente
 * como se dibujaba antes de que esto existiera: cubriendo el recuadro y
 * centrada.
 *
 * `alto` es para los recuadros apaisados —el fondo del perfil, la superficie
 * de una pieza, la banda de una imagen fijada—. Sin `alto` el recuadro es
 * cuadrado (la foto) y se dibuja lo guardado tal cual. **Con `alto`, la
 * escala se sube si hace falta para que la imagen girada siga cubriendo**: la
 * pantalla de encuadre elige sobre una banda de proporción fija, pero la
 * tarjeta real tiene la proporción que le dé su contenido y su ancho, y una
 * imagen girada 90° que cubría un 16:10 deja bandas a los costados de un 2:1.
 * Quien pisaba `height`/`top` después de desparramar esto debería pasar el
 * alto acá en vez de hacerlo, así la cuenta sigue siendo una sola.
 */
export function estiloEncuadrado(lado: number, encuadre: Encuadre | null, alto?: number): ImageStyle {
  const rotacion = encuadre?.rotacion ?? 0
  const altoReal = alto ?? lado
  const escala =
    alto === undefined
      ? (encuadre?.escala ?? 1)
      : Math.max(encuadre?.escala ?? 1, escalaQueCubre(rotacion, lado, altoReal))
  const ancho = lado * escala
  const altura = altoReal * escala
  /* El corrimiento va en fracciones del lado, no en píxeles: así el mismo
     encuadre sirve para el redondel de 32 de una fila y para el de 136 del
     encabezado. Guardar píxeles ataría el dato al tamaño donde se eligió. */
  const dx = (encuadre?.x ?? 0) * lado
  const dy = (encuadre?.y ?? 0) * altoReal
  return {
    position: 'absolute',
    width: ancho,
    height: altura,
    /* Centrado primero, corrido después: `(lado - ancho) / 2` es lo que deja
       la imagen agrandada centrada, y de ahí se mueve. */
    left: (lado - ancho) / 2 + dx,
    top: (altoReal - altura) / 2 + dy,
    /* La rotación gira la caja ya agrandada y corrida, alrededor de su centro
       —que es lo que hace `rotate` en React Native—. Solo se escribe cuando
       hay: así el estilo de un encuadre viejo es byte a byte el de antes. */
    ...(rotacion ? { transform: [{ rotate: `${rotacion}deg` }] } : {}),
  }
}

/**
 * La escala más chica con la que una imagen girada `rotacion` grados cubre
 * un recuadro de `ancho × alto`.
 *
 * Girar una imagen que apenas cubre su recuadro deja las cuatro esquinas al
 * descubierto. La caja de la imagen mide `ancho·escala × alto·escala` y gira
 * con ella; cubre el recuadro cuando cada lado alcanza para la proyección del
 * recuadro sobre su propio eje: `ancho·escala ≥ ancho·|cos θ| + alto·|sin θ|`
 * en un eje, y lo mismo con los lados cambiados en el otro. De las dos manda
 * la del lado corto, donde el corto tiene que alcanzar al largo: de ahí
 * `escala ≥ |cos θ| + |sin θ| · (largo / corto)`. Con θ = 0 da 1, lo de
 * siempre; con 90° da la razón entera (una banda 16:10 parada necesita 1.6×)
 * y con 45° en un cuadrado da √2.
 *
 * Para un redondel no hace falta nada: un cuadrado girado sobre su centro
 * sigue conteniendo el círculo inscripto. Eso lo decide quien llama —acá no se
 * sabe la forma de la máscara.
 *
 * Es un `worklet` porque la pantalla de encuadre la corre en el hilo de la
 * interfaz, adentro del gesto; desde JS se llama igual.
 */
export function escalaQueCubre(rotacion: number, ancho: number, alto: number): number {
  'worklet'
  const t = (rotacion * Math.PI) / 180
  const razon = Math.max(ancho / alto, alto / ancho)
  return Math.abs(Math.cos(t)) + Math.abs(Math.sin(t)) * razon
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
