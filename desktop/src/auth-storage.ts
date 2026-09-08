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

/** Sesión de Supabase persistida por el proceso principal, fuera de localStorage. */
export class AlmacenAuth {
  private estado: Promise<ArchivoAuth> | null = null
  private cola: Promise<void> = Promise.resolve()

  constructor(private readonly ruta: string, private readonly codec: CodecAuth) {}

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
      await mkdir(dirname(this.ruta), { recursive: true })
      const temporal = this.ruta + '.tmp'
      await writeFile(temporal, this.codec.codificar(JSON.stringify(siguiente)), { mode: 0o600 })
      await rename(temporal, this.ruta)
      this.estado = Promise.resolve(siguiente)
    })
    this.cola = trabajo.catch(() => {})
    return trabajo
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
         próximo setItem; nunca se imprime su contenido ni se expone al renderer. */
      return { ...VACIO, valores: {} }
    }
  }
}

function validarClave(clave: string): void {
  if (typeof clave !== 'string' || !CLAVE_VALIDA.test(clave)) throw new Error('Clave de sesión no permitida.')
}
