#!/usr/bin/env node
/*
 * Baja los emoji animados de Noto que usa el catálogo, a `archivos/`.
 *
 * Google publica los Noto Animated Emoji bajo CC BY 4.0, en WebP animado de
 * 512px, con una URL por punto de código. Se bajan una vez acá y después
 * `importar.mjs` los sube a NUESTRO Storage: la app nunca apunta a Google.
 *
 *   node scripts/decoraciones/bajar-noto.mjs
 */
import { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aca = dirname(fileURLToPath(import.meta.url))
const catalogo = JSON.parse(await (await import('node:fs/promises')).readFile(join(aca, 'catalogo.json'), 'utf8'))
const carpeta = join(aca, 'archivos')
await mkdir(carpeta, { recursive: true })

const vistos = new Set()
for (const d of catalogo.decoraciones) {
  if (!d.noto || vistos.has(d.noto)) continue
  vistos.add(d.noto)
  const url = catalogo.noto.base.replace('{cp}', d.noto)
  const res = await fetch(url)
  if (!res.ok) {
    console.error(`✗ ${d.noto}: ${res.status}`)
    continue
  }
  const bytes = Buffer.from(await res.arrayBuffer())
  await writeFile(join(carpeta, `noto-${d.noto}.webp`), bytes)
  console.log(`✓ ${d.noto} (${Math.round(bytes.length / 1024)} KB)`)
}
