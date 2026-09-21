#!/usr/bin/env node
import { createReadStream } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import tarjeta from '../api/tarjeta'
import listening from '../api/v1/listening'
// Railway genera este módulo con `npm --prefix server run build` antes de
// arrancar el contenedor; en un checkout limpio todavía no existe al ejecutar
// el typecheck de la app.
// @ts-ignore -- artefacto generado durante el build de Railway
import { manejador as musica } from '../server/dist/index.js'

const PORT = Number(process.env.PORT ?? 8080)
const DIST = fileURLToPath(new URL('../dist', import.meta.url))
process.env.WEB_DIST_DIR ??= DIST

const RUTAS_MUSICA = new Set([
  '/album',
  '/aportar',
  '/aportar/confirmar',
  '/aportar/url',
  '/artist',
  '/artwork',
  '/emparejar',
  '/genero',
  '/generos',
  '/health',
  '/home',
  '/home-generos',
  '/img',
  '/peaks',
  '/playlist',
  '/propia',
  '/propia/confirmar',
  '/propia/url',
  '/push',
  '/resolve',
  '/resolve/progreso',
  '/search',
  '/spotify',
  '/spotify/canciones',
  '/translate',
])

const COMPARTIBLES = '(cancion|lista|jam|perfil)'
const RUTA_COMPARTIDA = new RegExp(`^/${COMPARTIBLES}/([^/]+)$`)
const RUTA_EMBED = new RegExp(`^/embed/${COMPARTIBLES}/([^/]+)$`)

const TIPOS: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function responderError(res: ServerResponse, status: number, mensaje: string) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end(mensaje)
}

function rutaSegura(pathname: string): string | null {
  let decodificada: string
  try {
    decodificada = decodeURIComponent(pathname)
  } catch {
    return null
  }
  const relativa = normalize(decodificada).replace(/^[/\\]+/, '')
  if (!relativa || relativa.startsWith('..') || relativa.includes('/../')) return null
  return join(DIST, relativa)
}

async function servirArchivo(req: IncomingMessage, res: ServerResponse, archivo: string): Promise<boolean> {
  try {
    const info = await stat(archivo)
    if (!info.isFile()) return false
    const extension = extname(archivo).toLowerCase()
    const asociacionApple = archivo.endsWith('apple-app-site-association')
    const inmutable = archivo.includes(`${join('_expo', 'static')}${process.platform === 'win32' ? '\\' : '/'}`)
    res.writeHead(200, {
      'Content-Type': asociacionApple ? TIPOS['.json'] : (TIPOS[extension] ?? 'application/octet-stream'),
      'Content-Length': info.size,
      'Cache-Control': inmutable
        ? 'public, max-age=31536000, immutable'
        : extension === '.html'
          ? 'public, max-age=0, must-revalidate'
          : 'public, max-age=3600',
    })
    if (req.method === 'HEAD') {
      res.end()
      return true
    }
    createReadStream(archivo).pipe(res)
    return true
  } catch {
    return false
  }
}

async function manejar(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

  if (url.pathname === '/live') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify({ ok: true }))
    return
  }
  if (RUTAS_MUSICA.has(url.pathname)) return musica(req, res)
  if (url.pathname === '/api/v1/listening') return listening(req, res)
  if (url.pathname === '/api/tarjeta') return tarjeta(req, res)

  const embed = RUTA_EMBED.exec(url.pathname)
  const compartida = RUTA_COMPARTIDA.exec(url.pathname)
  if (embed || compartida) {
    const [, que, idCrudo] = embed ?? compartida!
    let id: string
    try {
      id = decodeURIComponent(idCrudo)
    } catch {
      responderError(res, 404, 'No es un link de dnmusic.')
      return
    }
    req.url = `/api/tarjeta?${new URLSearchParams({
      ...(embed ? { modo: 'embed' } : {}),
      que,
      id,
    })}`
    return tarjeta(req, res)
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    responderError(res, 405, 'Método no permitido.')
    return
  }

  const archivo = rutaSegura(url.pathname)
  if (archivo && (await servirArchivo(req, res, archivo))) return

  // Expo Router exporta una SPA: una ruta que no es un archivo real vuelve al shell.
  const index = join(DIST, 'index.html')
  try {
    await access(index)
  } catch {
    responderError(res, 503, 'La web todavía no fue compilada.')
    return
  }
  await servirArchivo(req, res, index)
}

const server = createServer((req, res) => {
  void manejar(req, res).catch((error) => {
    console.error('[dnmusic-railway]', error)
    if (!res.headersSent) responderError(res, 500, 'Error interno.')
    else if (!res.writableEnded) res.end()
  })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[dnmusic-railway] web + api escuchando en :${PORT}`)
})
