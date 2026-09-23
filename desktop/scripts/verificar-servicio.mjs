#!/usr/bin/env node
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Evita publicar un instalador que apunta a un servicio retirado. Sin sesión,
 * las rutas protegidas deben responder 401 JSON, nunca un 404 de plataforma.
 * Estos pedidos no descargan audio ni crean aportes. */
export async function verificarServicio(valor, pedir = fetch) {
  const base = new URL(valor?.trim() || '')
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) {
    throw new Error('EXPO_PUBLIC_MUSIC_API debe ser una URL HTTPS sin credenciales, query ni fragmento.')
  }
  const origen = base.href.replace(/\/+$/, '')
  const rutas = [
    ['/health', 'GET', 200],
    ['/search', 'GET', 401],
    ['/spotify', 'GET', 401],
    ['/emparejar', 'POST', 401],
    ['/aportar/url', 'POST', 401],
    ['/aportar/confirmar', 'POST', 401],
  ]
  await Promise.all(rutas.map(async ([ruta, method, status]) => {
    const respuesta = await pedir(`${origen}${ruta}`, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
      ...(method === 'POST' ? { headers: { 'Content-Type': 'application/json' }, body: '{}' } : {}),
    })
    const data = await respuesta.json().catch(() => null)
    if (respuesta.status !== status || (ruta === '/health' ? data?.ok !== true : data?.error !== 'No autorizado')) {
      throw new Error(`El servicio no cumple el contrato en ${ruta}: HTTP ${respuesta.status}. Revisá EXPO_PUBLIC_MUSIC_API antes de publicar.`)
    }
  }))

  // Electron carga el export desde app://dnmusic. Un servicio sano que sólo
  // permite el origen web sigue dejando al escritorio sin buscar ni importar.
  // /spotify usa el manejador liviano; /search y /emparejar, el principal.
  await Promise.all(['/search', '/spotify', '/emparejar'].map(async (ruta) => {
    const method = ruta === '/emparejar' ? 'POST' : 'GET'
    const respuesta = await pedir(`${origen}${ruta}`, {
      method: 'OPTIONS',
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
      headers: {
        Origin: 'app://dnmusic',
        'Access-Control-Request-Method': method,
        'Access-Control-Request-Headers': method === 'POST' ? 'authorization,content-type' : 'authorization',
      },
    })
    if (respuesta.status !== 204 || respuesta.headers.get('access-control-allow-origin') !== 'app://dnmusic') {
      throw new Error(`El servicio no permite el escritorio en ${ruta}: CORS HTTP ${respuesta.status}. Desplegá la API corregida antes de publicar.`)
    }
  }))
  return origen
}

async function main() {
  try {
    await verificarServicio(process.env.EXPO_PUBLIC_MUSIC_API)
    console.log('✓ Servicio disponible; búsqueda, importación y aportes aceptan el escritorio.')
  } catch (error) {
    console.error(`✗ ${error.message}`)
    process.exitCode = 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main()
