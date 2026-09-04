import { readFile } from 'node:fs/promises'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Health check del servicio.
 *
 * `/health` es lo que se mira para saber si el servicio está sano, y un
 * `{ ok: true }` pelado no decía nada: el proceso podía estar corriendo con la
 * base inalcanzable y seguir «sano». El chequeo vive en una función aparte para
 * que se pueda llamar desde una prueba sin levantar el HTTP entero.
 */

/** Cuánto espera el chequeo a la base antes de declararla caída. */
const TIMEOUT_MS = 2_000

export type Salud =
  | { ok: true; uptime: number; version: string }
  | { ok: false; error: string }

let versionCache: string | null = null

/**
 * La versión del servicio, leída una sola vez del package.json.
 *
 * Desde `dist/`, el paquete vive un directorio arriba: por eso el `../`. Si no
 * se puede leer (un binario suelto, un empaquetado raro) no tira: la versión no
 * vale una respuesta 503.
 */
async function versionActual(): Promise<string> {
  if (versionCache !== null) return versionCache
  try {
    const crudo = await readFile(new URL('../package.json', import.meta.url), 'utf8')
    const pkg = JSON.parse(crudo) as { version?: string }
    versionCache = pkg.version ?? 'desconocida'
  } catch {
    versionCache = 'desconocida'
  }
  return versionCache
}

/**
 * Estado real del servicio: ¿puede hablar con su base?
 *
 * La prueba es una query trivial contra una tabla estable (`pairs`, de la
 * migración inicial), pedida como conteo con `head: true`: no baja ninguna fila
 * y pasa por PostgREST **y** Postgres, que es exactamente lo que puede romperse.
 *
 * Con timeout corto a propósito: un health check que cuelga es peor que uno que
 * contesta «mal» — un orquestador reinicia ante lo segundo, ante lo primero no hace
 * nada mientras el servicio sigue muerto por dentro.
 */
export async function chequearSalud(
  supabase: SupabaseClient | null,
): Promise<Salud> {
  // Sin credenciales no hay nada que chequear, pero tampoco nada que funcione:
  // el servicio arrancó cojo y conviene que se vea.
  if (!supabase) return { ok: false, error: 'Supabase no configurado' }

  try {
    const { error } = await Promise.race([
      supabase.from('pairs').select('*', { count: 'exact', head: true }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`La base no respondió en ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS),
      ),
    ])
    if (error) return { ok: false, error: error.message }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }

  return {
    ok: true,
    /** Segundos desde que arrancó el proceso; útil para ver reinicios. */
    uptime: Math.round(process.uptime()),
    version: await versionActual(),
  }
}
