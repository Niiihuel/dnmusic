import { linkDe, ofrecer } from './compartir'

export function linkDeJam(code: string): string {
  return linkDe('jam', code)
}

/**
 * Acepta un enlace o código escrito a mano, ignorando espacios y mayúsculas.
 * El servidor vuelve a validar el código.
 */
export function codigoDeJam(entrada: string): string | null {
  const t = entrada.trim()
  if (!t) return null
  const m = t.match(/jam\/([^/?#\s]+)/i)
  const code = (m ? m[1] : t).trim().toUpperCase()
  return /^[A-Z0-9]{4,10}$/.test(code) ? code : null
}

/** Ofrecer el link del Jam por el gesto nativo de cada lado. */
export async function invitarAlJam(code: string): Promise<void> {
  const url = linkDeJam(code)
  await ofrecer(url, `Escuchemos juntos en dnmusic: ${url}`)
}
