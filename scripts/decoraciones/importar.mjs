#!/usr/bin/env node
/*
 * Sube las decoraciones del catálogo al bucket y registra las filas.
 *
 * Corre con la service_role key, que es la única que puede escribir en el
 * bucket `decoraciones` y en la tabla (ver la migración). Es idempotente:
 * volver a correrlo pisa el archivo y actualiza la fila.
 *
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=… \
 *     node scripts/decoraciones/importar.mjs
 *
 * Cada entrada del catálogo trae o `noto` (un punto de código, bajado antes
 * con `bajar-noto.mjs`) o `archivo` (una ruta relativa a `archivos/`, para lo
 * propio o con licencia libre), y opcionalmente `autor`, `licencia` y
 * `fuente`; sin ellos, los de Noto toman los del bloque `noto`.
 */
import { readFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}
const supabase = createClient(url, key, { auth: { persistSession: false } })

const aca = dirname(fileURLToPath(import.meta.url))
const catalogo = JSON.parse(await readFile(join(aca, 'catalogo.json'), 'utf8'))
const MIME = { '.webp': 'image/webp', '.png': 'image/png', '.apng': 'image/apng', '.gif': 'image/gif' }

let ok = 0
for (const d of catalogo.decoraciones) {
  const local = d.noto ? `noto-${d.noto}.webp` : d.archivo
  if (!local) {
    console.error(`✗ ${d.id}: sin archivo`)
    continue
  }
  const ext = extname(local).toLowerCase()
  const mime = MIME[ext]
  if (!mime) {
    console.error(`✗ ${d.id}: formato ${ext} no admitido`)
    continue
  }
  let bytes
  try {
    bytes = await readFile(join(aca, 'archivos', local))
  } catch {
    console.error(`✗ ${d.id}: no está archivos/${local} (¿corriste bajar-noto.mjs?)`)
    continue
  }
  /* Un archivo por decoración, con su id: lo que se ve en el bucket dice qué es. */
  const archivo = `${d.tipo}/${d.id}${ext}`
  const subida = await supabase.storage.from('decoraciones').upload(archivo, bytes, { contentType: mime, upsert: true })
  if (subida.error) {
    console.error(`✗ ${d.id}: ${subida.error.message}`)
    continue
  }
  const fila = {
    id: d.id,
    tipo: d.tipo,
    nombre: d.nombre,
    familia: d.familia ?? 'insignias',
    archivo,
    escala: d.escala ?? 1.2,
    posicion: d.posicion ?? 'centro',
    autor: d.autor ?? (d.noto ? catalogo.noto.autor : ''),
    licencia: d.licencia ?? (d.noto ? catalogo.noto.licencia : ''),
    fuente: d.fuente ?? (d.noto ? catalogo.noto.fuente : ''),
    orden: d.orden ?? 0,
  }
  const guardado = await supabase.from('decoraciones').upsert(fila, { onConflict: 'id' })
  if (guardado.error) {
    console.error(`✗ ${d.id}: ${guardado.error.message}`)
    continue
  }
  console.log(`✓ ${d.tipo} ${d.id} → ${archivo}`)
  ok++
}
console.log(`${ok} de ${catalogo.decoraciones.length} decoraciones.`)
