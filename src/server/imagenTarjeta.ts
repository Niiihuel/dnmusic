import { createElement as h } from 'react'
import { ImageResponse } from '@vercel/og'

export type DatosImagenTarjeta = { titulo: string; subtitulo: string; tapa: string | null }
const MAX_TAPA = 3 * 1024 * 1024

/** Sólo portadas de nuestros CDN; nunca convierte URLs compartidas en un proxy. */
export function portadaPermitida(valor: string): boolean {
  try {
    const url = new URL(valor)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false
    const cdn = ['i.ytimg.com', 'img.youtube.com', 'yt3.googleusercontent.com', 'lh3.googleusercontent.com', 'yt3.ggpht.com', 'lh3.ggpht.com', 'i.scdn.co'].includes(url.hostname)
    const storage = process.env.EXPO_PUBLIC_SUPABASE_URL
    return cdn || !!(storage && url.origin === new URL(storage).origin && url.pathname.startsWith('/storage/v1/object/public/'))
  } catch { return false }
}

async function leerPortada(url: string | null): Promise<string | null> {
  if (!url || !portadaPermitida(url)) return null
  try {
    const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(3000) })
    const tipo = res.headers.get('content-type')?.split(';')[0]
    if (!res.ok || !tipo || !['image/jpeg', 'image/png', 'image/webp'].includes(tipo) || Number(res.headers.get('content-length')) > MAX_TAPA) {
      await res.body?.cancel()
      return null
    }
    const reader = res.body?.getReader()
    if (!reader) return null
    const partes: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_TAPA) { await reader.cancel(); return null }
      partes.push(value)
    }
    return `data:${tipo};base64,${Buffer.concat(partes).toString('base64')}`
  } catch { return null }
}

const recortar = (s: string, n: number) => { const letras = Array.from(s); return letras.length > n ? letras.slice(0, n - 1).join('') + '…' : s }

/** Imagen real, no botones dibujados que prometan reproducir dentro de Discord. */
export function dibujoTarjeta(t: DatosImagenTarjeta, que: string, portada: string | null) {
  const tipo = { cancion: 'CANCIÓN', lista: 'PLAYLIST', jam: 'JAM', perfil: 'PERFIL' }[que] ?? 'MÚSICA'
  return h('div', { style: { width: '100%', height: '100%', display: 'flex', padding: 32, background: '#0b0b10', color: '#fff', fontFamily: 'sans-serif' } },
    h('div', { style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', borderRadius: 36, padding: 40, border: '2px solid #3a3a45', backgroundImage: 'linear-gradient(125deg, #292732, #15151a 70%)' } },
      h('div', { style: { display: 'flex', alignItems: 'center', fontSize: 28, fontWeight: 700, marginBottom: 32 } }, 'dnmusic'),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 38, flex: 1 } },
        portada ? h('img', { src: portada, width: 340, height: 340, style: { borderRadius: que === 'perfil' ? 170 : 24, objectFit: 'cover' } })
          : h('div', { style: { display: 'flex', width: 340, height: 340, borderRadius: 24, alignItems: 'center', justifyContent: 'center', background: '#33313c', fontSize: 100 } }, '♪'),
        h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 } },
          h('div', { style: { display: 'flex', fontSize: 19, letterSpacing: 3, color: '#bcb8ca', marginBottom: 16 } }, tipo),
          h('div', { style: { display: 'flex', fontSize: t.titulo.length > 38 ? 44 : 58, fontWeight: 700, lineHeight: 1.12 } }, recortar(t.titulo, 80)),
          h('div', { style: { display: 'flex', fontSize: 29, color: '#c9c6d2', marginTop: 16, lineHeight: 1.25 } }, recortar(t.subtitulo, 75)),
          h('div', { style: { display: 'flex', fontSize: 20, color: '#e7e5ed', marginTop: 32 } }, que === 'cancion' ? 'Escuchá en dnmusic' : 'Abrí en dnmusic'),
        ),
      ),
      h('div', { style: { display: 'flex', fontSize: 17, color: '#a4a0b0', marginTop: 24 } }, 'Tu música, con quien quieras.'),
    ),
  )
}

export async function crearImagenTarjeta(t: DatosImagenTarjeta, que: string): Promise<Buffer> {
  const portada = await leerPortada(t.tapa)
  try {
    return Buffer.from(await new ImageResponse(dibujoTarjeta(t, que, portada), { width: 1200, height: 630 }).arrayBuffer())
  } catch (error) {
    // Una portada corrupta no impide presentar el nombre y artista.
    if (!portada) throw error
    return Buffer.from(await new ImageResponse(dibujoTarjeta(t, que, null), { width: 1200, height: 630 }).arrayBuffer())
  }
}
