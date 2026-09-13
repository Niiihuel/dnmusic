/** Metadatos de una canción completa, sin URLs firmadas ni archivos locales. */
export type SharedSong = {
  kind: 'track'
  videoId: string
  title: string
  artist: string
  artistId: string | null
  artworkUrl: string
  artworkPath: string | null
  audioPath: string
  durationMs: number
}

/** Se usa al enviar y al leer: un adjunto malformado no rompe el chat. */
export function sharedSongFrom(value: unknown): SharedSong | null {
  if (!value || typeof value !== 'object') return null
  const s = value as Record<string, unknown>
  if (s.kind !== 'track' || typeof s.videoId !== 'string' || !s.videoId.trim() ||
      typeof s.title !== 'string' || !s.title.trim()) return null
  const path = (v: unknown) => typeof v === 'string' && !v.includes('://') &&
    !v.startsWith('/') && !v.split('/').includes('..') ? v : ''
  return {
    kind: 'track',
    videoId: s.videoId,
    title: s.title,
    artist: typeof s.artist === 'string' ? s.artist : '',
    artistId: typeof s.artistId === 'string' ? s.artistId : null,
    artworkUrl: typeof s.artworkUrl === 'string' && /^https?:\/\//i.test(s.artworkUrl) ? s.artworkUrl : '',
    artworkPath: path(s.artworkPath) || null,
    audioPath: path(s.audioPath),
    durationMs: typeof s.durationMs === 'number' && Number.isFinite(s.durationMs)
      ? Math.max(0, Math.round(s.durationMs)) : 0,
  }
}
