import { getSupabase } from '../lib/supabase'
import type { Compartible } from '../lib/compartir'

/**
 * Lo poco que se sabe de algo **antes** de entrar: la tarjeta de un link.
 *
 * Es la única lectura de esta app que funciona sin sesión. `tarjeta_enlace` es
 * `security definer` y tiene su excepción en `check_app_access` —la misma forma
 * que ya tenían `auth_email_for_username` y `access_status`—, y a cambio de esa
 * excepción devuelve exactamente cinco campos de presentación y solo de cosas
 * que ya eran compartibles: una canción que alguien publicó, una lista
 * `publica`, un perfil `publico`, un Jam vivo llamado por su propio código de
 * invitación. Ver `supabase/migrations/20260920000000_tarjetas_de_enlace.sql`.
 *
 * Que la tarjeta exista no es lo mismo que poder escuchar: la reproducción
 * sigue pidiendo cuenta aprobada, y eso no lo decide esta pantalla sino la RLS
 * de todo lo demás.
 */
export type Tarjeta = {
  que: Compartible
  id: string
  titulo: string
  subtitulo: string
  /** Absoluta y lista para `<Image>`; null si no hay con qué ilustrarla. */
  tapa: string | null
  durationMs: number | null
}

/**
 * La tapa viene del RPC como `bucket/camino` o como una URL absoluta del CDN, y
 * no como una URL de Storage ya armada, porque la base no sabe con qué origen
 * la van a leer: local, preview y producción no comparten uno. Componerla acá
 * es una línea; cablear el origen en una migración sería un error que solo
 * aparece al mover de entorno.
 */
function tapaAbsoluta(valor: unknown): string | null {
  if (typeof valor !== 'string' || !valor) return null
  if (/^https?:\/\//i.test(valor)) return valor
  const barra = valor.indexOf('/')
  if (barra <= 0) return null
  const { data } = getSupabase()
    .storage.from(valor.slice(0, barra))
    .getPublicUrl(valor.slice(barra + 1))
  return data.publicUrl || null
}

export async function tarjetaDe(que: Compartible, id: string): Promise<Tarjeta | null> {
  const { data, error } = await getSupabase().rpc('tarjeta_enlace', { p_tipo: que, p_id: id })
  if (error) throw error
  const fila = data as Record<string, unknown> | null
  if (!fila || typeof fila.titulo !== 'string') return null
  return {
    que,
    id: typeof fila.id === 'string' ? fila.id : id,
    titulo: fila.titulo,
    subtitulo: typeof fila.subtitulo === 'string' ? fila.subtitulo : '',
    tapa: tapaAbsoluta(fila.tapa),
    durationMs: typeof fila.duracion_ms === 'number' ? fila.duracion_ms : null,
  }
}

/**
 * Deja publicada la tarjeta de una canción, que es lo único que un link de
 * canción no puede sacar de ningún lado.
 *
 * Una lista, un perfil y un Jam son filas con nombre propio; una canción no
 * existe como fila: vive adentro de las listas que la tienen. Así que
 * compartirla **publica** su título, su artista y su tapa —y solo eso—, y el
 * link muestra exactamente lo que quien compartió decidió mostrar. De paso, un
 * id inventado no devuelve nada: no hay forma de recorrer el catálogo probando.
 *
 * No devuelve nada y no rompe nada: si falla, el link igual funciona y lo único
 * que se pierde es la tapa del preview. Compartir no puede quedarse esperando a
 * una escritura.
 */
export async function publicarCancion(track: {
  videoId: string
  title: string
  artist: string
  artworkPath?: string | null
  artworkUrl?: string
  durationMs?: number
}): Promise<void> {
  await getSupabase().rpc('publicar_cancion', {
    p_video_id: track.videoId,
    p_title: track.title,
    p_artist: track.artist,
    p_artwork_path: track.artworkPath ?? null,
    p_artwork_url: track.artworkUrl ?? '',
    p_duration_ms: Math.round(track.durationMs ?? 0),
  })
}
