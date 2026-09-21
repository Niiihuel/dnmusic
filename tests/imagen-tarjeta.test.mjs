import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as React from 'react'
import { ImageResponse } from '@vercel/og'

function cargar(fetch = async () => { throw Error('no se esperaba red') }) {
  const source = ts.transpileModule(readFileSync('src/server/imagenTarjeta.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  vm.runInNewContext(source, { exports, require: id => id === 'react' ? React : { ImageResponse },
    process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co' } }, URL, Buffer, AbortSignal, fetch })
  return exports
}

test('el generador produce un PNG 1200×630, incluso sin portada o con títulos largos', async () => {
  const { crearImagenTarjeta } = cargar()
  for (const titulo of ['Nerves', 'Una canción con un título muy largo que debe mantenerse dentro de la tarjeta y no salir del encuadre']) {
    const png = await crearImagenTarjeta({ titulo, subtitulo: 'DPR IAN', tapa: null }, 'cancion')
    assert.equal(png.subarray(1, 4).toString(), 'PNG')
    assert.equal(png.readUInt32BE(16), 1200)
    assert.equal(png.readUInt32BE(20), 630)
    assert.ok(png.length > 10000)
  }
})

test('no solicita portadas de redes privadas, URLs con credenciales o hosts ajenos', () => {
  const { portadaPermitida } = cargar()
  for (const url of ['http://i.ytimg.com/x', 'https://127.0.0.1/x', 'https://localhost/x', 'https://169.254.169.254/x', 'https://i.ytimg.com.evil/x', 'https://user@i.ytimg.com/x', 'https://i.ytimg.com:123/x', 'https://project.supabase.co/rest/v1/users']) assert.equal(portadaPermitida(url), false, url)
  assert.equal(portadaPermitida('https://i.ytimg.com/vi/test/hqdefault.jpg'), true)
  assert.equal(portadaPermitida('https://project.supabase.co/storage/v1/object/public/artwork/test.jpg'), true)
})

test('portadas con error, redirección o contenido inválido conservan el preview sin una petición adicional', async () => {
  const llamadas = []
  const { crearImagenTarjeta } = cargar(async (url, options) => {
    llamadas.push({ url, options })
    return new Response('bad', { headers: { 'content-type': 'text/html' } })
  })
  const png = await crearImagenTarjeta({ titulo: 'Nerves', subtitulo: 'DPR IAN', tapa: 'https://i.ytimg.com/vi/test/hqdefault.jpg' }, 'cancion')
  assert.equal(png.subarray(1,4).toString(), 'PNG')
  assert.equal(llamadas.length, 1)
  assert.equal(llamadas[0].options.redirect, 'error')
  assert.ok(llamadas[0].options.signal)
})


test('una portada PNG válida se integra sin peticiones implícitas del renderizador', async () => {
  const imagen = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
  let llamadas = 0
  const { crearImagenTarjeta } = cargar(async () => {
    llamadas++
    return new Response(imagen, { headers: { 'content-type': 'image/png' } })
  })
  const png = await crearImagenTarjeta({ titulo: 'Tema', subtitulo: 'Artista', tapa: 'https://i.ytimg.com/vi/test/hqdefault.jpg' }, 'cancion')
  assert.equal(png.readUInt32BE(16), 1200)
  assert.equal(llamadas, 1)
})
