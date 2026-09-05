import { CLIENTES_RESOLVE, type ClienteResolve } from './clientes-youtube.js'

export const AYUDA = `Diagnóstico de YouTube (sin subir audio)
Uso: npm run diagnostico:youtube -- [VIDEO_ID o URL] [opciones]
  --modo entorno|buscar|token|formatos|descarga  (por defecto: descarga)
  --consulta "artista canción"                 para el modo buscar
  --cliente ${CLIENTES_RESOLVE.join('|')}  prueba solo ese cliente
  --json informe.json                         guarda un informe nuevo
  --timeout 120                               plazo total, 5–300 segundos
  --chunk-kib 1024                             bloque de descarga, 64–4096 KiB
  --ffprobe /ruta/al/ffprobe                    verifica códec y duración
  --help                                      muestra esta ayuda
Sin --cliente se usa la selección habitual. No se repiten automáticamente videos.
El modo token comprueba la generación; solo descargar comprueba aceptación del CDN.`

type Modo = 'entorno' | 'buscar' | 'token' | 'formatos' | 'descarga'
export type OpcionesCLI = {
  ayuda: boolean; modo: Modo; videoId?: string; consulta?: string
  cliente?: ClienteResolve; json?: string; timeout: number; chunkBytes: number; ffprobe?: string
}

export function identificarVideo(valor: string): string {
  if (/^[\w-]{11}$/.test(valor)) return valor
  let url: URL
  try { url = new URL(valor) } catch { throw new Error('Video ID o URL de YouTube inválido') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('URL de YouTube inválida')
  const hosts = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']
  const id = url.hostname === 'youtu.be' ? url.pathname.slice(1)
    : hosts.includes(url.hostname) ? url.searchParams.get('v') ?? url.pathname.match(/^\/(?:shorts|embed)\/([\w-]{11})$/)?.[1] : null
  if (!id || !/^[\w-]{11}$/.test(id)) throw new Error('Video ID o URL de YouTube inválido')
  return id
}

export function leerOpciones(args: string[]): OpcionesCLI {
  const o: OpcionesCLI = { ayuda: args.includes('--help'), modo: 'descarga', timeout: 120, chunkBytes: 1 << 20 }
  if (o.ayuda) return o
  const vistas = new Set<string>()
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!arg.startsWith('--')) {
      if (o.videoId) throw new Error('Indicá un solo video por prueba')
      o.videoId = identificarVideo(arg)
      continue
    }
    if (vistas.has(arg)) throw new Error(`Opción repetida: ${arg}`)
    vistas.add(arg)
    if (!['--modo', '--consulta', '--cliente', '--json', '--timeout', '--chunk-kib', '--ffprobe'].includes(arg)) {
      throw new Error(`Opción desconocida: ${arg}`)
    }
    const valor = args[++i]
    if (!valor?.trim() || valor.startsWith('--')) throw new Error(`Falta el valor de ${arg}`)
    if (arg === '--modo') {
      if (!['entorno', 'buscar', 'token', 'formatos', 'descarga'].includes(valor)) throw new Error('Modo inválido')
      o.modo = valor as Modo
    } else if (arg === '--cliente') {
      if (!(CLIENTES_RESOLVE as readonly string[]).includes(valor)) throw new Error('Cliente no compatible con tokens web')
      o.cliente = valor as ClienteResolve
    } else if (arg === '--timeout' || arg === '--chunk-kib') {
      const numero = Number(valor)
      const [min, max] = arg === '--timeout' ? [5, 300] : [64, 4096]
      if (!Number.isSafeInteger(numero) || numero < min || numero > max) throw new Error(`Valor inválido para ${arg}: ${min}–${max}`)
      if (arg === '--timeout') o.timeout = numero
      else o.chunkBytes = numero * 1024
    } else if (arg === '--consulta') o.consulta = valor.trim()
    else if (arg === '--json') o.json = valor
    else o.ffprobe = valor
  }
  if (['token', 'formatos', 'descarga'].includes(o.modo) && !o.videoId) throw new Error('Falta VIDEO_ID o URL')
  if (o.modo === 'buscar' && !o.consulta) throw new Error('Falta --consulta')
  if (o.consulta && o.modo !== 'buscar') throw new Error('--consulta requiere --modo buscar')
  if (o.videoId && ['entorno', 'buscar'].includes(o.modo)) throw new Error('Este modo no utiliza VIDEO_ID')
  if (o.cliente && !['formatos', 'descarga'].includes(o.modo)) throw new Error('--cliente requiere formatos o descarga')
  if ((o.ffprobe || vistas.has('--chunk-kib')) && o.modo !== 'descarga') throw new Error('--ffprobe y --chunk-kib requieren descarga')
  return o
}
