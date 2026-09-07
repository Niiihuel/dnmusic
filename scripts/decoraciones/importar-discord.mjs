#!/usr/bin/env node
import { readFile, writeFile, rename, unlink, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { parseArgs } from 'node:util'
import { FUENTE_DISCORD, BASE_DISCORD, normalizarDiscord, contarCatalogo } from './discord-normalizar.mjs'

const destino = fileURLToPath(new URL('../../src/data/discord-catalogo.json', import.meta.url))
const { values } = parseArgs({ options: {
  fecha: { type: 'string' }, archivo: { type: 'string' },
  comprobar: { type: 'boolean', default: false },
  'permitir-reduccion': { type: 'boolean', default: false },
  ayuda: { type: 'boolean', default: false },
} })

async function main() {
  if (values.ayuda) {
    console.log('node scripts/decoraciones/importar-discord.mjs --fecha YYYY-MM-DD [--archivo collectibles.json] [--comprobar] [--permitir-reduccion]\nFecha: la del snapshot upstream, no la de descarga. Sin --archivo descarga la fuente pública; --comprobar valida sin escribir.')
    return
  }
  if (!values.fecha) throw new Error('Indicá --fecha YYYY-MM-DD (fecha del snapshot upstream).')
  let raw
  if (values.archivo) raw = await readFile(values.archivo)
  else {
    const response = await fetch(FUENTE_DISCORD, { signal: AbortSignal.timeout(60_000), redirect: 'error' })
    if (!response.ok) throw new Error(`Descarga fallida: HTTP ${response.status}`)
    raw = Buffer.from(await response.arrayBuffer())
  }
  if (raw.length > 40_000_000) throw new Error('La fuente supera el límite de 40 MB; revisar antes de importar.')
  const catalogo = normalizarDiscord(JSON.parse(raw.toString('utf8')), { actualizado: values.fecha, sha256: createHash('sha256').update(raw).digest('hex') })
  const cantidades = contarCatalogo(catalogo)
  let anterior
  try { anterior = JSON.parse(await readFile(destino, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
  const minimos = anterior ? contarCatalogo(anterior) : BASE_DISCORD
  if (!values['permitir-reduccion']) {
    for (const [tipo, cantidad] of Object.entries(minimos)) {
      if (cantidades[tipo] < cantidad) throw new Error(`${tipo}: ${cantidades[tipo]} < ${cantidad}. Revisá la fuente; --permitir-reduccion acepta un recorte intencional.`)
    }
    if (anterior && catalogo.actualizado < anterior.actualizado) throw new Error('La fecha retrocede respecto del snapshot instalado.')
  }
  const contenido = `${JSON.stringify(catalogo)}\n`
  console.log(JSON.stringify({ actualizado: catalogo.actualizado, sha256: catalogo.sha256, cantidades, bytes: Buffer.byteLength(contenido), destino, comprobacion: values.comprobar }, null, 2))
  if (values.comprobar) return
  await mkdir(dirname(destino), { recursive: true })
  const temporal = `${destino}.${process.pid}.tmp`
  try {
    await writeFile(temporal, contenido, { flag: 'wx' })
    await rename(temporal, destino)
  } finally {
    await unlink(temporal).catch((error) => { if (error.code !== 'ENOENT') throw error })
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1 })
