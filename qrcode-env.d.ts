/**
 * Los tipos de `qrcode`, sólo lo que se usa.
 *
 * El paquete viene con `react-native-qrcode-svg` —el mismo que dibuja el código
 * del Jam— y no trae declaraciones. En vez de sumar `@types/qrcode` al proyecto
 * por dos campos, se declara acá lo único que `lib/codigoQR` necesita: la
 * matriz de módulos. Si algún día hace falta más, se agrega acá.
 */
declare module 'qrcode' {
  export type NivelCorreccion = 'L' | 'M' | 'Q' | 'H'
  export type CodigoQR = {
    modules: {
      /** Cuántos módulos por lado. */
      size: number
      /** Fila por fila, un byte por módulo: 1 pintado, 0 vacío. */
      data: Uint8Array
    }
  }
  export function create(texto: string, opciones?: { errorCorrectionLevel?: NivelCorreccion }): CodigoQR
  const _default: { create: typeof create }
  export default _default
}
