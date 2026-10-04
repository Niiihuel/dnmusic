import { addTrack, createPlaylist } from './playlists'
import { ensureArtwork, fetchMusica, resolveSong } from './music'
import type { TrackResult } from './music'
import { getSupabase } from '../lib/supabase'

/**
 * Importa playlists públicas de Spotify: lee metadata, empareja en YouTube Music
 * y guarda filas en orden. El audio se resuelve al reproducir para no descargar
 * toda la colección ni multiplicar solicitudes contra YouTube.
 */

const MUSIC_API = process.env.EXPO_PUBLIC_MUSIC_API ?? 'http://localhost:8787'

/** Cuántas canciones sirve la página de embed de Spotify. Ver `server/src/spotify.ts`. */
export const TOPE_SPOTIFY = 100

export type PistaSpotify = {
  uri: string
  titulo: string
  artista: string
  durationMs: number
  /** MP3 de 30s para comparar de oído en la revisión. Puede no venir. */
  previewUrl: string | null
}

export type ListaSpotify = {
  id: string
  nombre: string
  autor: string
  portadaUrl: string | null
  pistas: PistaSpotify[]
  /** Llegó al tope de la página: puede haber más canciones sin leer. */
  truncada: boolean
}

export type Confianza = 'segura' | 'dudosa' | 'sin_resultado'

export type Candidato = {
  track: TrackResult
  puntaje: number
  /** En palabras, por qué puntuó así. Se muestra al revisar. */
  motivo: string
}

/** Un tema de Spotify con lo que se encontró para él. */
export type Emparejado = {
  pista: PistaSpotify
  confianza: Confianza
  /** El candidato elegido, o null si no hubo ninguno aceptable. */
  elegido: TrackResult | null
  candidatos: Candidato[]
}

// ── Leer ───────────────────────────────────────────────────────────────────

export async function leerListaSpotify(
  enlace: string,
  signal?: AbortSignal,
): Promise<ListaSpotify> {
  const res = await fetchMusica(`${MUSIC_API}/spotify?url=${encodeURIComponent(enlace)}`, { signal })
  const datos = (await res.json()) as Partial<ListaSpotify> & { error?: string }
  if (!res.ok || datos.error || !datos.pistas) {
    throw new Error(datos.error ?? `No se pudo leer la lista (${res.status})`)
  }
  return datos as ListaSpotify
}

// ── Emparejar ──────────────────────────────────────────────────────────────

/** Cuántas van por pedido. El server rechaza más de 20. */
const LOTE = 10

export type Avance = { hechas: number; total: number }

/**
 * Lotes secuenciales: el servidor ya paraleliza dentro de cada lote.
 * El progreso y AbortSignal permiten cancelar sin dejar búsquedas pendientes.
 */
export async function emparejarLista(
  pistas: PistaSpotify[],
  opciones?: { signal?: AbortSignal; alAvanzar?: (avance: Avance) => void },
): Promise<Emparejado[]> {
  const salida: Emparejado[] = []

  for (let desde = 0; desde < pistas.length; desde += LOTE) {
    if (opciones?.signal?.aborted) break
    const lote = pistas.slice(desde, desde + LOTE)

    const res = await fetchMusica(`${MUSIC_API}/emparejar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pistas: lote.map((p) => ({
          titulo: p.titulo,
          artista: p.artista,
          durationMs: p.durationMs,
        })),
      }),
      signal: opciones?.signal,
    })
    const datos = (await res.json()) as {
      emparejados?: { indice: number; confianza: Confianza; elegido: TrackResult | null; candidatos: Candidato[] }[]
      error?: string
    }
    if (!res.ok || datos.error || !datos.emparejados) {
      throw new Error(datos.error ?? `No se pudo emparejar (${res.status})`)
    }

    for (const resultado of datos.emparejados) {
      salida.push({
        pista: lote[resultado.indice],
        confianza: resultado.confianza,
        elegido: resultado.elegido,
        candidatos: resultado.candidatos ?? [],
      })
    }
    opciones?.alAvanzar?.({ hechas: Math.min(desde + LOTE, pistas.length), total: pistas.length })
  }

  return salida
}

// ── Guardar ────────────────────────────────────────────────────────────────

export type ResumenImport = {
  playlistId: string
  agregadas: number
  /** Ya estaban en la lista: el mismo video dos veces. */
  repetidas: number
  /** Se eligió no traerlas, o no se encontró nada. */
  salteadas: number
}

/**
 * Ruta vacía identifica audio pendiente de resolución. No guardar una ruta
 * predicha: el motor la intentaría firmar antes de que exista en Storage.
 */
const SIN_RESOLVER = ''

/**
 * Inserta en orden: add_playlist_track calcula max(position)+10
 * y las escrituras paralelas podrían producir posiciones iguales.
 */
export async function guardarLista(
  nombre: string,
  elegidas: { pista: PistaSpotify; track: TrackResult }[],
  opciones?: { signal?: AbortSignal; alAvanzar?: (avance: Avance) => void; salteadas?: number },
): Promise<ResumenImport> {
  const lista = await createPlaylist(nombre)

  let agregadas = 0
  let repetidas = 0

  for (const [indice, { pista, track }] of elegidas.entries()) {
    if (opciones?.signal?.aborted) break
    const nueva = await addTrack(lista.id, {
      videoId: track.videoId,
      title: track.title,
      artist: track.artist,
      artistId: track.artistId,
      artworkUrl: track.artworkUrl,
      artworkPath: track.artworkPath ?? null,
      audioPath: SIN_RESOLVER,
      /*
       * La duración de Spotify le gana a la de la búsqueda cuando esta viene
       * en cero, que pasa (ver `trackFrom` en el server). Sin esto, la fila
       * mostraría «0:00» hasta que alguien la reproduzca.
       */
      durationMs: track.durationMs || pista.durationMs,
      truePeak: undefined,
    })
    if (nueva) agregadas++
    else repetidas++
    opciones?.alAvanzar?.({ hechas: indice + 1, total: elegidas.length })
  }

  return {
    playlistId: lista.id,
    agregadas,
    repetidas,
    salteadas: opciones?.salteadas ?? 0,
  }
}

/**
 * Prepara unas pocas canciones y copia portadas sin retener la pantalla.
 * Los fallos son accesorios: el motor resolverá el audio al reproducir
 * y la portada puede seguir usando su URL de catálogo.
 */
export async function terminarEnSegundoPlano(
  playlistId: string,
  tracks: TrackResult[],
  cuantasPreparar = 3,
): Promise<void> {
  const supabase = getSupabase()

  for (const track of tracks.slice(0, cuantasPreparar)) {
    try {
      const resuelta = await resolveSong(track)
      /**
       * Persistir audio resuelto evita repetir la resolución al reabrir
       * y deja una ruta real para descargar la playlist.
       */
      await supabase
        .from('playlist_tracks')
        .update({
          audio_path: resuelta.path,
          ...(resuelta.artworkPath ? { artwork_path: resuelta.artworkPath } : {}),
          ...(resuelta.durationMs ? { duration_ms: resuelta.durationMs } : {}),
        })
        .eq('playlist_id', playlistId)
        .eq('video_id', track.videoId)
    } catch {
      // Que no se pueda adelantar una canción no rompe nada: se va a resolver
      // sola cuando alguien la reproduzca.
    }
  }

  for (const track of tracks) {
    if (track.artworkPath || !track.artworkUrl) continue
    try {
      const path = await ensureArtwork(track.videoId, track.artworkUrl)
      if (!path) continue
      await supabase
        .from('playlist_tracks')
        .update({ artwork_path: path })
        .eq('playlist_id', playlistId)
        .eq('video_id', track.videoId)
    } catch {
      // La carátula sigue viéndose por la URL del CDN. No vale un error.
    }
  }
}
