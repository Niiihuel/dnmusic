/**
 * Los links de dnmusic que le llegan al escritorio desde afuera.
 *
 * Cuando alguien hace clic en `dnmusic://cancion/abc` —lo que intenta la web
 * desde `src/lib/abrirEnLaApp.ts` cuando ofrece «Abrir en la app»— el sistema
 * levanta esta app y le pasa la URL. Por dónde llega depende del sistema, y son
 * tres caminos distintos que terminan todos acá:
 *
 *   macOS            el evento `open-url`, incluso con la app ya abierta
 *   Windows / Linux  un argumento más en `process.argv`, en el arranque; y si
 *                    ya estaba abierta, en el `argv` del `second-instance`
 *
 * El link **no se abre con `loadURL`**: eso recarga el bundle entero y corta la
 * música que estuviera sonando, que es exactamente lo contrario de lo que
 * espera alguien que toca un link mientras escucha. Se le manda la ruta al
 * renderer y navega expo-router, igual que un toque adentro de la app.
 */

/** El esquema propio, el mismo que declara `electron-builder.yml`. */
export const ESQUEMA_ENLACE = 'dnmusic'

/**
 * Las cuatro cosas que tienen link. Es la copia de `COMPARTIBLES` de
 * `src/lib/compartir.ts`, y tiene que ser copia: aquel módulo importa
 * react-native, que en el proceso principal de Electron no existe. Si allá se
 * suma una quinta, acá también.
 */
const COMPARTIBLES = ['cancion', 'lista', 'jam', 'perfil']

/**
 * La ruta de expo-router a la que lleva un link, o null si no es uno nuestro.
 *
 * Acepta las dos formas en las que puede llegar: el esquema propio
 * (`dnmusic://cancion/abc`, que es lo que arma la web) y el link https del
 * sitio, por si algún escritorio nos declara manejador de esos. Nada más: un
 * link de otro lado nunca se convierte en una ruta de esta app.
 */
export function rutaDeEnlace(entrada: string): string | null {
  const texto = (entrada ?? '').trim()
  if (!texto) return null
  const m = new RegExp(
    `^(?:${ESQUEMA_ENLACE}:/|https://(?:dnmusic-app\\.vercel\\.app|dnmusic-production-c3f4\\.up\\.railway\\.app))` +
      `/(${COMPARTIBLES.join('|')})/([^/?#\\s]+)`,
    'i',
  ).exec(texto)
  if (!m) return null
  try {
    const id = decodeURIComponent(m[2])
    /* Se vuelve a codificar al armar la ruta: lo que sale de acá va derecho a
       `router.push`, y un id de canción propia trae `:` adentro. */
    return id ? `/${m[1].toLowerCase()}/${encodeURIComponent(id)}` : null
  } catch {
    return null
  }
}

/** El primer link que aparezca en una lista de argumentos del sistema. */
export function enlaceEnArgumentos(argv: readonly string[]): string | null {
  for (const arg of argv) {
    const ruta = rutaDeEnlace(arg)
    if (ruta) return ruta
  }
  return null
}

/**
 * Guarda el link hasta que haya a quién dárselo.
 *
 * En Windows y Linux el link llega **en el arranque**, antes de que exista la
 * ventana: sin esto, el primer clic —el que abre la app— es justamente el que
 * se pierde, y la app arranca en la portada como si nadie hubiera tocado nada.
 * Se guarda el último y no una cola: si alguien tocó tres links mientras la
 * ventana levantaba, quiso ir al último.
 */
export class EntregaDeEnlaces {
  private pendiente: string | null = null
  private entregar: ((ruta: string) => void) | null = null

  /** Un link recién llegado, de donde sea. Devuelve si se reconoció. */
  recibir(entrada: string): boolean {
    const ruta = rutaDeEnlace(entrada)
    if (!ruta) return false
    if (this.entregar) this.entregar(ruta)
    else this.pendiente = ruta
    return true
  }

  /** Lo mismo para el `argv` del sistema. */
  recibirArgumentos(argv: readonly string[]): boolean {
    const ruta = enlaceEnArgumentos(argv)
    return ruta ? this.recibir(ruta) : false
  }

  /** La ventana ya está: se le da lo guardado y lo que venga después. */
  conectar(entregar: (ruta: string) => void): void {
    this.entregar = entregar
    const guardado = this.pendiente
    this.pendiente = null
    if (guardado) entregar(guardado)
  }

  /** La ventana se fue: lo próximo vuelve a esperar. */
  desconectar(): void {
    this.entregar = null
  }
}
