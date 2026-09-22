import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

// Auth y Storage propios detrás del gateway de Railway. No permitir cualquier
// *.railway.app: el renderer no puede elegir el servidor que recibe credenciales.
export function esOrigenNubePermitido(u: URL): boolean {
  return u.protocol === 'https:' && !u.port &&
    (/^[a-z0-9-]+\.supabase\.co$/.test(u.hostname) || u.hostname === 'envoy-production-2fb6.up.railway.app')
}

function permitido(valor: string, empaquetada: boolean): string | null {
  try {
    const u = new URL(valor)
    if (u.username || u.password || u.pathname !== '/' || u.search || u.hash) return null
    if (esOrigenNubePermitido(u)) return u.origin
    if (!empaquetada && u.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(u.hostname) && u.port) return u.origin
  } catch { /* Configuración no utilizable, no ampliar la allowlist. */ }
  return null
}

/** Configuración confiable de main/export. Jamás aprender orígenes desde una URL enviada por IPC. */
export async function origenAudioConfigurado(raizWeb: string, empaquetada: boolean, configurado = process.env.EXPO_PUBLIC_SUPABASE_URL): Promise<string | null> {
  if (configurado) return permitido(configurado, empaquetada)
  if (!empaquetada) {
    for (const nombre of ['.env.local', '.env']) {
      try {
        const contenido = await readFile(join(dirname(raizWeb), nombre), 'utf8')
        const valor = /^EXPO_PUBLIC_SUPABASE_URL\s*=\s*([^\r\n]+)$/m.exec(contenido)?.[1].trim().replace(/^['"]|['"]$/g, '')
        if (valor) return permitido(valor, false)
      } catch { /* Un export sin .env puede contener la URL pública compilada. */ }
    }
  }
  const base = join(raizWeb, '_expo', 'static', 'js', 'web'), encontrados = new Set<string>()
  try {
    for (const name of await readdir(base)) {
      if (!name.endsWith('.js')) continue
      const source = await readFile(join(base, name), 'utf8')
      for (const match of source.matchAll(/https:\/\/(?:[a-z0-9-]+\.supabase\.co|envoy-production-2fb6\.up\.railway\.app)(?=[/"'\\\s])/g)) encontrados.add(match[0])
    }
  } catch { return null }
  // Ambigüedad falla cerrada; EXPO_PUBLIC_SUPABASE_URL de main puede resolverla.
  return encontrados.size === 1 ? [...encontrados][0] : null
}
