import { sharedSongFrom, type SharedSong } from './sharedSong'

/**
 * Fragmento de canción adjunto a un mensaje, al estilo de Instagram.
 *
 * El audio vive completo en Supabase Storage, puesto ahí por el servicio de
 * `server/` que lo resuelve desde YouTube Music. Ver docs/MUSICA.md.
 */
export type SongSnippet = {
  /** Id en YouTube Music; sirve para re-resolver si hiciera falta. */
  videoId: string
  title: string
  artist: string
  artworkUrl: string
  /**
   * Ruta de nuestra copia de la carátula, en el bucket `artwork`.
   *
   * Es la buena; `artworkUrl` queda de respaldo para los mensajes anteriores
   * al caché. Ver `artworkSource`.
   */
  artworkPath?: string
  /** Ruta del audio dentro del bucket `songs`. Se firma al reproducir. */
  path: string
  /** Inicio del recorte dentro de la CANCIÓN COMPLETA, en ms. */
  startMs: number
  /** Duración del recorte, en ms. */
  durationMs: number
  /**
   * Pico real del audio decodificado; puede pasar de 1.
   *
   * Se mide una sola vez al elegir el fragmento —ahí el tema ya está
   * decodificado para dibujar la onda— y viaja con el mensaje para que
   * reproducirlo después no obligue a decodificarlo de nuevo. Ver
   * `headroomGain` en services/music.
   */
  truePeak?: number
  /**
   * Cómo eligió mostrarlo quien lo mandó.
   *
   * Es una decisión de quien escribe, no una preferencia de quien lee: elegir
   * que se abra en la letra es parte del gesto. `disc` si no se guardó nada.
   */
  style?: 'disc' | 'lyrics'
  /**
   * Letra sincronizada, con los tiempos de la canción completa.
   *
   * Al tener el tema entero (y no un preview de 30s de origen desconocido) los
   * tiempos del LRC valen tal cual: no hay desfase que calcular ni alinear.
   *
   * Va **como se eligió mandarla**: si el remitente la tradujo, acá están las
   * líneas traducidas. Ver `lyricsLang`.
   */
  lyrics?: { atMs: number; text: string }[]
  /**
   * Idioma de `lyrics`, si se tradujo. Ausente = tal como vino.
   *
   * Se guarda como código suelto y no con el tipo de `services/music` para no
   * hacer que el modelo dependa de la capa de servicios.
   */
  lyricsLang?: string
}

/** Un mensaje entre las dos personas del par. */
export type Message = {
  id: string
  senderUid: string
  text: string
  createdAt: Date | null
  /** Cuándo el receptor lo abrió. */
  openedAt: Date | null
  /** Cuándo el receptor terminó de leerlo. */
  readAt: Date | null
  song: SongSnippet | null
  sharedSong?: SharedSong | null
}

/** Lo que se pasa para enviar; `id` y `created_at` los pone Postgres. */
export type NewMessage = {
  text: string
  song?: SongSnippet
  sharedSong?: SharedSong
}

/** La fila tal como vive en public.messages (snake_case). */
export type MessageRow = {
  id: string
  pair_id: string
  sender_id: string
  text: string
  song: SongSnippet | SharedSong | null
  created_at: string
  opened_at: string | null
  read_at: string | null
}

export function isSentBy(message: Message, uid: string): boolean {
  return message.senderUid === uid
}

export function isOpened(message: Message): boolean {
  return message.openedAt !== null
}

function toDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function toSong(value: unknown): SongSnippet | null {
  if (!value || typeof value !== 'object') return null
  const s = value as Record<string, unknown>
  if (s.kind === 'track') return null
  if (typeof s.path !== 'string' || typeof s.title !== 'string') return null
  return {
    videoId: typeof s.videoId === 'string' ? s.videoId : '',
    title: s.title,
    artist: typeof s.artist === 'string' ? s.artist : '',
    artworkUrl: typeof s.artworkUrl === 'string' ? s.artworkUrl : '',
    artworkPath: typeof s.artworkPath === 'string' ? s.artworkPath : undefined,
    path: s.path,
    startMs: typeof s.startMs === 'number' ? s.startMs : 0,
    durationMs: typeof s.durationMs === 'number' ? s.durationMs : 15_000,
    truePeak: typeof s.truePeak === 'number' ? s.truePeak : undefined,
    style: s.style === 'lyrics' || s.style === 'disc' ? s.style : undefined,
    lyricsLang: typeof s.lyricsLang === 'string' ? s.lyricsLang : undefined,
    lyrics: Array.isArray(s.lyrics)
      ? (s.lyrics as unknown[])
          .filter(
            (l): l is { atMs: number; text: string } =>
              !!l &&
              typeof (l as { atMs?: unknown }).atMs === 'number' &&
              typeof (l as { text?: unknown }).text === 'string',
          )
          .map((l) => ({ atMs: l.atMs, text: l.text }))
      : undefined,
  }
}

/**
 * Convierte una fila de Postgres al modelo.
 *
 * Devuelve null si la fila no tiene la forma esperada, en vez de romper el
 * canal: una sola fila corrupta no debería vaciar la conversación entera.
 */
export function messageFromRow(row: unknown): Message | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Partial<MessageRow>

  if (typeof r.id !== 'string') return null
  if (typeof r.sender_id !== 'string' || typeof r.text !== 'string') return null

  return {
    id: r.id,
    senderUid: r.sender_id,
    text: r.text,
    createdAt: toDate(r.created_at),
    openedAt: toDate(r.opened_at),
    readAt: toDate(r.read_at),
    song: toSong(r.song),
    sharedSong: sharedSongFrom(r.song),
  }
}

/** Payload de INSERT. `id`, `created_at` y los flags los pone la base. */
export function toMessageRow(
  pairId: string,
  senderUid: string,
  message: NewMessage,
): Pick<MessageRow, 'pair_id' | 'sender_id' | 'text'> & {
  song?: SongSnippet | SharedSong
} {
  return {
    pair_id: pairId,
    sender_id: senderUid,
    text: message.text.trim(),
    ...(message.sharedSong ? { song: message.sharedSong } : message.song ? { song: message.song } : {}),
  }
}
