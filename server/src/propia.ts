import { execFile } from 'node:child_process'
import { FFMPEG, FFPROBE } from './binarios.js'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)


/*
 * Solo lo que se usa del cliente de Supabase, estructural: atarse al tipo
 * concreto de `createClient` pelea con sus genéricos por defecto (el cliente
 * real de index.ts no calza con `ReturnType<typeof createClient>`).
 */
type Storage = {
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        body: Buffer,
        opts: { contentType: string; upsert: boolean },
      ) => Promise<{ error: { message: string } | null }>
    }
  }
}

/**
 * Canciones propias: un archivo de audio de quien escucha, a Storage.
 *
 * Es la primera fuente de música que no pasa por YouTube. El archivo se guarda
 * **tal cual llegó** —recodificar sería decidir sobre la calidad de un archivo
 * ajeno— y de él se leen la duración, las etiquetas (título y artista del ID3
 * o del contenedor) y la tapa embebida, si trae. Todo con ffprobe/ffmpeg, que
 * ya están en la imagen por el remuxado.
 *
 * Se valida con ffprobe y no confiando en la extensión: cualquier cosa puede
 * llamarse `.mp3`. Si ffprobe no le encuentra una duración, no es audio y no
 * se guarda.
 */

/** Formatos que la app puede reproducir en web y en el iPhone. */
const FORMATOS: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  flac: 'audio/flac',
}

export type PropiaSubida = {
  path: string
  durationMs: number
  title: string | null
  artist: string | null
  artworkPath: string | null
}

export async function subirPropia(
  supabase: Storage,
  bucket: string,
  bytes: Buffer,
  nombre: string,
): Promise<PropiaSubida> {
  const ext = (nombre.split('.').pop() ?? '').toLowerCase()
  const mime = FORMATOS[ext]
  if (!mime) {
    throw new Error(
      `Ese formato no se puede reproducir en todos lados. Sirven: ${Object.keys(FORMATOS).join(', ')}.`,
    )
  }

  let dir: string | null = null
  try {
    dir = await mkdtemp(join(tmpdir(), 'propia-'))
    const entrada = join(dir, `in.${ext}`)
    await writeFile(entrada, bytes)

    const { stdout } = await run(FFPROBE, [
      '-v', 'error',
      '-show_entries', 'format=duration:format_tags=title,artist',
      '-of', 'json',
      entrada,
    ]).catch(() => ({ stdout: '' }))

    const info = JSON.parse(String(stdout) || '{}') as {
      format?: { duration?: string; tags?: Record<string, string> }
    }
    const segundos = Number(info.format?.duration)
    if (!Number.isFinite(segundos) || segundos <= 0) {
      throw new Error('Eso no parece un archivo de audio.')
    }

    /* Las etiquetas vienen con la caja que quiera el contenedor: `title` en
       mp4, `TITLE` en algunos mp3. Se busca sin distinguir mayúsculas. */
    const tags = info.format?.tags ?? {}
    const etiqueta = (clave: string): string | null => {
      const k = Object.keys(tags).find((t) => t.toLowerCase() === clave)
      const v = k ? tags[k]?.trim() : ''
      return v ? v : null
    }

    const id = randomUUID()

    /*
     * La tapa embebida, si trae. `-frames:v 1` saca el attached_pic de un mp3
     * o m4a como jpg; si el archivo no trae imagen, ffmpeg falla y la canción
     * queda sin tapa — que es la verdad.
     */
    let artworkPath: string | null = null
    try {
      const tapa = join(dir, 'tapa.jpg')
      await run(FFMPEG, ['-y', '-loglevel', 'error', '-i', entrada, '-an', '-frames:v', '1', tapa])
      const jpg = await readFile(tapa)
      if (jpg.length) {
        const destino = `propia-${id}.jpg`
        const { error } = await supabase.storage
          .from('artwork')
          .upload(destino, jpg, { contentType: 'image/jpeg', upsert: true })
        if (!error) artworkPath = destino
      }
    } catch {
      // Sin tapa embebida; el recuadro gris de siempre.
    }

    const path = `propias/${id}.${ext}`
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, bytes, { contentType: mime, upsert: false })
    if (error) throw new Error(`No se pudo guardar: ${error.message}`)

    return {
      path,
      durationMs: Math.round(segundos * 1000),
      title: etiqueta('title'),
      artist: etiqueta('artist'),
      artworkPath,
    }
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
