/**
 * El código escaneable de un link, como matriz de puntos.
 *
 * La tarjeta de la historia se dibuja **dos veces** —una vista de React Native
 * en el teléfono y un canvas en la web— y las dos tienen que sacar el mismo
 * código. Por eso acá no se devuelve una imagen ni un componente sino la
 * matriz: cada quien pinta los puntos con lo que tenga a mano, y no hay dos
 * codificadores que puedan discrepar.
 *
 * El paquete `qrcode` es el que ya usa `react-native-qrcode-svg` para el código
 * del Jam, así que no entra nada nuevo al bundle. Va detrás de un `try` por lo
 * mismo que el tinte de portada: un código que no se puede armar deja la
 * tarjeta sin esa esquina, nunca sin tarjeta.
 */
import QRCode from 'qrcode'

export type MatrizQR = {
  /** Cuántos módulos por lado. Un link de la app da 29 o 33. */
  lado: number
  /** Fila por fila: `true` es un módulo pintado. */
  puntos: boolean[]
}

/**
 * Corrección **media**: aguanta que la esquina de la tarjeta quede tapada por
 * un sticker de Instagram sin volverse ilegible, y no engorda la matriz como
 * la alta. Es la que usa Spotify en sus códigos.
 */
const CORRECCION = 'M' as const

export function matrizQR(texto: string): MatrizQR | null {
  if (!texto) return null
  try {
    const { modules } = QRCode.create(texto, { errorCorrectionLevel: CORRECCION })
    const lado = modules.size
    const datos = modules.data as unknown as ArrayLike<number>
    const puntos: boolean[] = []
    for (let i = 0; i < lado * lado; i++) puntos.push(datos[i] === 1)
    return { lado, puntos }
  } catch {
    return null
  }
}
