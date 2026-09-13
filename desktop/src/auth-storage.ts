import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export type CodecAuth = {
  codificar: (texto: string) => Buffer
  decodificar: (datos: Buffer) => string
}

type ArchivoAuth = { version: 1; valores: Record<string, string> }
const VACIO: ArchivoAuth = { version: 1, valores: {} }
const CLAVE_VALIDA = /^[A-Za-z0-9:._-]{1,200}$/
const MAX_VALOR = 1024 * 1024

/**
 * Los códigos con los que Windows dice «ese archivo está ocupado en este
 * instante».
 *
 * Reemplazar un archivo por otro es atómico en Linux y una carrera en Windows:
 * el antivirus escaneando lo recién escrito, el indexador o el cliente de
 * OneDrive sincronizando `%APPDATA%` alcanzan para que `rename` falle con
 * EPERM. Es transitorio —milisegundos— y por eso se reintenta en vez de darlo
 * por perdido.
 */
const OCUPADO = new Set(['EPERM', 'EACCES', 'EBUSY'])
const REINTENTOS = 5

const esperar = (ms: number) => new Promise<void>((listo) => setTimeout(listo, ms))

/** Sesión de Supabase persistida por el proceso principal, fuera de localStorage. */
export class AlmacenAuth {
  private estado: Promise<ArchivoAuth> | null = null
  private cola: Promise<void> = Promise.resolve()

  constructor(
    private readonly ruta: string,
    private readonly codec: CodecAuth,
    /** Para dejar en el log lo que se rompió; nunca recibe el contenido. */
    private readonly alFallar: (motivo: string, error: unknown) => void = () => {},
  ) {}

  async getItem(clave: string): Promise<string | null> {
    validarClave(clave)
    return (await this.cargar()).valores[clave] ?? null
  }

  setItem(clave: string, valor: string): Promise<void> {
    validarClave(clave)
    if (typeof valor !== 'string' || valor.length > MAX_VALOR) throw new Error('Sesión demasiado grande.')
    return this.mutar((estado) => { estado.valores[clave] = valor })
  }

  removeItem(clave: string): Promise<void> {
    validarClave(clave)
    return this.mutar((estado) => { delete estado.valores[clave] })
  }

  private mutar(cambio: (estado: ArchivoAuth) => void): Promise<void> {
    const trabajo = this.cola.then(async () => {
      const previo = await this.cargar()
      const siguiente: ArchivoAuth = { version: 1, valores: { ...previo.valores } }
      cambio(siguiente)
      /*
       * Lo que está en memoria se actualiza **antes** de tocar el disco.
       *
       * Al revés —que era como estaba— un guardado que fallaba dejaba al
       * almacén sirviendo la sesión **anterior** durante todo el resto de la
       * corrida, y eso es exactamente el «entro y a los segundos me saca» de
       * Windows: Supabase volvía a leer la sesión vieja, la veía vencida,
       * intentaba renovarla con un refresh token ya gastado, recibía un 400 y
       * borraba la sesión por muerta. Un fallo de escritura tiene que
       * significar «esto no sobrevive al reinicio», nunca «volvé a la sesión
       * de antes».
       *
       * El error se sigue propagando: el renderer lo necesita para guardar su
       * copia de respaldo (ver `src/lib/supabase.ts`).
       */
      this.estado = Promise.resolve(siguiente)
      await this.guardar(siguiente)
    })
    this.cola = trabajo.catch(() => {})
    return trabajo
  }

  /**
   * El archivo, reemplazado entero y de una.
   *
   * El camino normal es escribir un `.tmp` y renombrarlo encima: así nadie lee
   * nunca medio archivo. En Windows ese renombre choca con quien tenga el
   * archivo abierto en ese instante, así que se reintenta unas cuantas veces
   * antes de resignar la atomicidad y escribir encima —un archivo a medias se
   * lee como vacío y cuesta un login, y no escribir nada cuesta lo mismo—.
   */
  private async guardar(estado: ArchivoAuth): Promise<void> {
    try {
      const datos = this.codec.codificar(JSON.stringify(estado))
      const temporal = this.ruta + '.tmp'
      let ultimo: unknown = null

      await mkdir(dirname(this.ruta), { recursive: true })
      for (let intento = 0; intento < REINTENTOS; intento++) {
        try {
          await writeFile(temporal, datos, { mode: 0o600 })
          await rename(temporal, this.ruta)
          return
        } catch (error) {
          ultimo = error
          if (!OCUPADO.has((error as NodeJS.ErrnoException).code ?? '')) break
          await esperar(20 * (intento + 1))
        }
      }

      await writeFile(this.ruta, datos, { mode: 0o600 }).catch(() => { throw ultimo })
    } catch (error) {
      this.alFallar('no se pudo guardar la sesión', error)
      throw error
    }
  }

  private cargar(): Promise<ArchivoAuth> {
    if (!this.estado) this.estado = this.leer()
    return this.estado
  }

  private async leer(): Promise<ArchivoAuth> {
    try {
      const raw = JSON.parse(this.codec.decodificar(await readFile(this.ruta))) as Partial<ArchivoAuth>
      if (raw.version !== 1 || !raw.valores || Array.isArray(raw.valores) || typeof raw.valores !== 'object') throw new Error('Formato inválido.')
      const valores: Record<string, string> = {}
      for (const [clave, valor] of Object.entries(raw.valores)) {
        if (CLAVE_VALIDA.test(clave) && typeof valor === 'string' && valor.length <= MAX_VALOR) valores[clave] = valor
      }
      return { version: 1, valores }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ...VACIO, valores: {} }
      /* Un archivo viejo o dañado no bloquea el login. Se reemplaza en el
         próximo setItem; nunca se imprime su contenido ni se expone al
         renderer — pero sí queda dicho que pasó, porque «me pide entrar cada
         vez que abro» no tiene otra explicación que ésta. */
      this.alFallar('no se pudo leer la sesión guardada', error)
      return { ...VACIO, valores: {} }
    }
  }
}

function validarClave(clave: string): void {
  if (typeof clave !== 'string' || !CLAVE_VALIDA.test(clave)) throw new Error('Clave de sesión no permitida.')
}
