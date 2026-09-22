import { type ImageStyle } from 'react-native'
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
  if (encuadre?.aspecto) {
    const base = cajaOriginal(lado, altoReal, encuadre.aspecto)
    const escala = Math.max(encuadre.escala, escalaOriginal(rotacion, lado, altoReal, base.w, base.h, alto === undefined))
    const dentro = limitarOriginal(encuadre.x, encuadre.y, escala, rotacion, lado, altoReal, base.w, base.h, alto === undefined)
    return {
      position: 'absolute', width: base.w * escala, height: base.h * escala,
      left: (lado - base.w * escala) / 2 + dentro.x * lado,
      top: (altoReal - base.h * escala) / 2 + dentro.y * altoReal,
      ...(rotacion ? { transform: [{ rotate: `${rotacion}deg` }] } : {}),
    }
  }
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

/** Conserva la imagen completa, incluido lo que queda fuera del visor. */
export function cajaOriginal(w: number, h: number, aspecto: number) {
  'worklet'
  return aspecto > w / h ? { w: h * aspecto, h } : { w, h: w / aspecto }
}

export function escalaOriginal(rot: number, w: number, h: number, iw: number, ih: number, redondo: boolean) {
  'worklet'
  const t = rot * Math.PI / 180, c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t))
  return Math.max(1, (redondo ? w : c * w + s * h) / iw, (redondo ? h : s * w + c * h) / ih)
}

export function limitarOriginal(x: number, y: number, escala: number, rot: number, w: number, h: number, iw: number, ih: number, redondo: boolean) {
  'worklet'
  const t = rot * Math.PI / 180, c = Math.cos(t), s = Math.sin(t)
  const a = Math.max(0, (iw * escala - (redondo ? w : Math.abs(c) * w + Math.abs(s) * h)) / 2)
  const b = Math.max(0, (ih * escala - (redondo ? h : Math.abs(s) * w + Math.abs(c) * h)) / 2)
  // El contrato persistido admite desplazamientos de hasta dos lados.
  const dx = Math.max(-2, Math.min(2, x)) * w, dy = Math.max(-2, Math.min(2, y)) * h
  const u = Math.min(a, Math.max(-a, c * dx + s * dy)), v = Math.min(b, Math.max(-b, -s * dx + c * dy))
  const rx = (c * u - s * v) / w, ry = (s * u + c * v) / h
  const factor = Math.max(1, Math.abs(rx) / 2, Math.abs(ry) / 2)
  return { x: rx / factor, y: ry / factor }
}

/** Zoom alrededor del punto que está entre los dedos, no del centro del visor. */
export function zoomEnFoco(x: number, y: number, antes: number, despues: number, fx: number, fy: number, w: number, h: number) {
  'worklet'
  const razon = despues / antes
  return { x: ((fx - w / 2) * (1 - razon) + x * w * razon) / w,
    y: ((fy - h / 2) * (1 - razon) + y * h * razon) / h }
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
