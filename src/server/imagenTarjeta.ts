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

const VINILO = `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
  <circle cx="150" cy="150" r="150" fill="#101010" />
  <g fill="none" stroke="#444" stroke-opacity=".55" stroke-width="2">
    ${[142, 134, 126, 118, 110, 102, 94, 86, 78, 70].map(r => `<circle cx="150" cy="150" r="${r}" />`).join('')}
  </g>
  <circle cx="150" cy="150" r="46" fill="#343434" />
  <circle cx="150" cy="150" r="23" fill="#aaa" />
  <circle cx="150" cy="150" r="5" fill="#101010" />
</svg>`).toString('base64')}`

/** La imagen social conserva la composición de la tarjeta sin dibujar controles. */
export function dibujoTarjeta(t: DatosImagenTarjeta, que: string, portada: string | null) {
  const musical = que === 'cancion' || que === 'lista'
  const redonda = que === 'perfil' || que === 'jam'
  return h('div', { style: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', padding: 32, background: '#121212', color: '#f4f4f5', fontFamily: 'sans-serif' } },
    h('div', { style: { position: 'relative', width: '100%', height: 430, display: 'flex', alignItems: 'center', gap: 32, borderRadius: 36, padding: 48, background: '#181818', overflow: 'hidden', boxShadow: '0 24px 54px rgba(0,0,0,.4)' } },
      // Satori aplica el blur sobre la misma imagen inline; no vuelve a pedirla.
      portada ? h('img', { src: portada, width: 1296, height: 830, style: { position: 'absolute', left: -80, top: -200, objectFit: 'cover', opacity: .72, filter: 'blur(42px)' } }) : null,
      h('div', { style: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', display: 'flex', backgroundImage: 'linear-gradient(180deg, rgba(0,0,0,.82), rgba(0,0,0,.94))' } }),
      h('div', { style: { position: 'relative', display: 'flex', alignItems: 'center', width: musical ? 362 : 300, height: 300, flexShrink: 0 } },
        musical ? h('img', { src: VINILO, width: 246, height: 246, style: { position: 'absolute', left: 116, top: 27 } }) : null,
        portada ? h('img', { src: portada, width: 300, height: 300, style: { borderRadius: redonda ? 150 : 24, objectFit: 'cover', boxShadow: '0 12px 28px rgba(0,0,0,.5)' } })
          : h('div', { style: { display: 'flex', width: 300, height: 300, borderRadius: redonda ? 150 : 24, alignItems: 'center', justifyContent: 'center', background: '#292929', color: '#b3b3b3', fontSize: 100 } }, '♪'),
      ),
      h('div', { style: { position: 'relative', height: 300, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1, minWidth: 0, alignItems: 'flex-start', textAlign: 'left' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 26, fontWeight: 700, color: '#a3a3ae' } },
          h('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: '#a3a3ae', strokeWidth: 2, strokeLinecap: 'round' },
            h('path', { d: 'M2 10v4M6 6v12M10 3v18M14 8v8M18 5v14M22 10v4' })), 'dnmusic'),
        h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%' } },
          h('div', { style: { display: 'flex', width: '100%', fontSize: t.titulo.length > 34 ? 39 : 52, fontWeight: 700, lineHeight: 1.15, letterSpacing: -.4, lineClamp: 2, overflow: 'hidden', wordBreak: 'break-word' } }, recortar(t.titulo, 120)),
          h('div', { style: { display: 'flex', width: '100%', fontSize: 28, color: '#b3b3bd', marginTop: 12, lineHeight: 1.25, lineClamp: 1, overflow: 'hidden' } }, recortar(t.subtitulo, 65)),
          h('div', { style: { display: 'flex', fontSize: 20, color: '#e0dde0', marginTop: 24 } }, que === 'cancion' ? 'Escuchá en dnmusic' : 'Abrí en dnmusic'),
        ),
      ),
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
