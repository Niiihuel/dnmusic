/**
 * Vuelve a resolver el audio guardado como WebM y actualiza lo que lo apunta.
 *
 * El servicio guardaba el mejor formato por bitrate, que en YouTube siempre es
 * Opus dentro de WebM. Suena impecable en el navegador y **iOS no lo decodifica
 * en absoluto**: en el teléfono no sonaba nada, sin error ni pista. Ahora se
 * prefiere AAC en mp4; esto arregla lo que quedó de antes.
 *
 * Es idempotente: lo que ya apunte a un `.m4a` se saltea. Los `.webm` viejos no
 * se borran de Storage — ocupan lugar, pero si algo sale mal siguen ahí.
 *
 *   node scripts/remigrar-audio.mjs
 *
 * Lee del entorno (o de .env.local): SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY,
 * y MUSIC_API para saber a quién pedirle la resolución.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

function fromEnvFile(file) {
  try {
    return Object.fromEntries(
      readFileSync(file, 'utf8')
        .split('\n')
        .filter((l) => l.trim() && !l.trim().startsWith('#'))
        .map((l) => {
          const i = l.indexOf('=')
          return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
        }),
    )
  } catch {
    return {}
  }
}

const env = { ...fromEnvFile('.env'), ...fromEnvFile('.env.local'), ...process.env }
const SUPABASE_URL = env.SUPABASE_URL_LOCAL ?? env.EXPO_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const MUSIC_API = env.MUSIC_API ?? env.EXPO_PUBLIC_MUSIC_API

if (!SUPABASE_URL || !SERVICE_KEY || !MUSIC_API) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / MUSIC_API')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_KEY)

/** Le pide al servicio que resuelva de nuevo y devuelve la ruta nueva. */
async function resolver(videoId, artworkUrl) {
  const res = await fetch(`${MUSIC_API}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoId, artworkUrl }),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`)
  return data.path
}

const { data: tracks, error } = await db
  .from('playlist_tracks')
  .select('id, video_id, title, artwork_url, audio_path')
  .like('audio_path', '%.webm')
if (error) throw error

console.log(`Canciones de listas por migrar: ${tracks.length}`)

for (const t of tracks) {
  process.stdout.write(`  ${t.title} … `)
  try {
    const path = await resolver(t.video_id, t.artwork_url)
    if (path.endsWith('.webm')) {
      console.log('sin mp4 disponible, queda como estaba')
      continue
    }
    const { error: e } = await db
      .from('playlist_tracks')
      .update({ audio_path: path })
      .eq('id', t.id)
    if (e) throw e
    console.log(path)
  } catch (e) {
    console.log(`falló: ${e.message}`)
  }
}

/*
 * Los mensajes guardan la canción embebida en un jsonb, y la fila es inmutable
 * por trigger salvo `opened_at`/`read_at`. Se actualizan con SQL directo desde
 * el service role, que es el mismo camino que usa el servicio para escribir.
 */
const { data: msgs, error: e2 } = await db
  .from('messages')
  .select('id, song')
  .like('song->>path', '%.webm')
if (e2) {
  console.log(`\nMensajes: no se pudieron leer (${e2.message})`)
} else {
  console.log(`\nMensajes por migrar: ${msgs.length}`)
  for (const m of msgs) {
    process.stdout.write(`  ${m.song.title} … `)
    try {
      const path = await resolver(m.song.videoId, m.song.artworkUrl)
      if (path.endsWith('.webm')) {
        console.log('sin mp4 disponible, queda como estaba')
        continue
      }
      const { error: e3 } = await db
        .from('messages')
        .update({ song: { ...m.song, path } })
        .eq('id', m.id)
      if (e3) throw e3
      console.log(path)
    } catch (e) {
      console.log(`falló: ${e.message}`)
    }
  }
}

console.log('\nListo.')
