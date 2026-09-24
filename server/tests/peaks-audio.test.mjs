import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AnalysisError } from '../dist/analysis.js'
import { leerRangoOnda, obtenerOndaAudio } from '../dist/peaks-audio.js'

const range = { desdeMs: 0, durMs: 1000, buckets: 80 }
const sampleWave = { peaks: Array(80).fill(0.4), durationMs: 1000 }

function wavConTonoYSilencio() {
  const rate = 8000, samples = rate * 2
  const bytes = Buffer.alloc(44 + samples * 2)
  bytes.write('RIFF', 0)
  bytes.writeUInt32LE(bytes.length - 8, 4)
  bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(rate, 24)
  bytes.writeUInt32LE(rate * 2, 28)
  bytes.writeUInt16LE(2, 32)
  bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36)
  bytes.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < rate; i++) {
    bytes.writeInt16LE(Math.round(16000 * Math.sin(2 * Math.PI * 440 * i / rate)), 44 + i * 2)
  }
  return bytes
}

test('rango estricto: hasta 30 s y 40–600 barras, sin coerción de valores raros', () => {
  assert.deepEqual(leerRangoOnda(new URLSearchParams('desdeMs=100&durMs=30000&buckets=600')),
    { desdeMs: 100, durMs: 30000, buckets: 600 })
  for (const query of [
    'desdeMs=0&durMs=30001&buckets=80',
    'desdeMs=0&durMs=100&buckets=80',
    'desdeMs=-1&durMs=1000&buckets=80',
    'desdeMs=0&durMs=1000&buckets=39',
    'desdeMs=0&durMs=1000&buckets=601',
    'desdeMs=0&durMs=1000&buckets=80.5',
    'desdeMs=0&durMs=1000&buckets=Infinity',
    'desdeMs=14400000&durMs=1000&buckets=80',
    'durMs=1000&buckets=80',
  ]) {
    assert.throws(() => leerRangoOnda(new URLSearchParams(query)),
      error => error instanceof AnalysisError && error.status === 400, query)
  }
})

test('comprueba ruta exacta con JWT antes de firmar y antes del acierto de caché', async () => {
  const calls = []
  let permitido = true
  const deps = {
    reader: {
      info: async path => {
        calls.push(['info', path])
        return permitido
          ? { data: { version: 'v1', size: 2000, contentType: 'audio/wav' }, error: null }
          : { data: null, error: new Error('denied') }
      },
      createSignedUrl: async path => { calls.push(['sign', path]); return { data: { signedUrl: 'firmada' }, error: null } },
    },
    decode: async () => { calls.push(['decode']); return sampleWave },
  }
  const path = 'propias/123e4567-e89b-12d3-a456-426614174000.wav'
  assert.deepEqual(await obtenerOndaAudio(path, range, deps), sampleWave)
  assert.deepEqual(await obtenerOndaAudio(path, range, deps), sampleWave)
  assert.equal(calls.filter(([type]) => type === 'info').length, 2)
  assert.equal(calls.filter(([type]) => type === 'sign').length, 1)
  assert.equal(calls.filter(([type]) => type === 'decode').length, 1)

  permitido = false
  await assert.rejects(obtenerOndaAudio(path, range, deps),
    error => error instanceof AnalysisError && error.status === 404)
  assert.equal(calls.filter(([type]) => type === 'sign').length, 1)
  await assert.rejects(obtenerOndaAudio('propias/usuario/cuarentena.wav', range, deps),
    error => error instanceof AnalysisError && error.status === 400)
  assert.equal(calls.filter(([type]) => type === 'info').length, 3)
})

test('FFmpeg mide el PCM del tramo solicitado, incluso en un audio propio', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dn-peaks-audio-'))
  try {
    const file = join(dir, 'dos-segundos.wav')
    const bytes = wavConTonoYSilencio()
    await writeFile(file, bytes)
    let infos = 0, firmas = 0
    const deps = {
      reader: {
        info: async () => { infos++; return { data: { version: 'v1', size: bytes.length, contentType: 'audio/wav' }, error: null } },
        createSignedUrl: async () => { firmas++; return { data: { signedUrl: file }, error: null } },
      },
    }
    const path = 'propias/audio-real-ondas.wav'
    const tono = await obtenerOndaAudio(path, range, deps)
    const silencio = await obtenerOndaAudio(path, { ...range, desdeMs: 1000 }, deps)
    assert.equal(tono.peaks.length, range.buckets)
    assert.ok(Math.max(...tono.peaks) > 0.9)
    for (const band of ['low', 'mid', 'high']) {
      assert.equal(tono.bands[band].length, range.buckets)
      assert.ok(silencio.bands[band].every(value => value === 0))
    }
    assert.ok(silencio.peaks.every(value => value === 0))
    assert.ok(Math.abs(tono.durationMs - 1000) <= 1)
    assert.ok(Math.abs(silencio.durationMs - 1000) <= 1)
    await obtenerOndaAudio(path, range, deps)
    assert.equal(infos, 3)
    assert.equal(firmas, 2)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('dos rangos activos ocupan los cupos; una tercera huella recibe 429 y el mismo rango comparte cálculo', async () => {
  let liberar
  const bloqueo = new Promise(resolve => { liberar = resolve })
  let avisarDos
  const dosActivos = new Promise(resolve => { avisarDos = resolve })
  let decodes = 0
  const deps = {
    reader: {
      info: async () => ({ data: { version: 'v1', size: 2000, contentType: 'audio/wav' }, error: null }),
      createSignedUrl: async () => ({ data: { signedUrl: 'firmada' }, error: null }),
    },
    decode: async () => {
      decodes++
      if (decodes === 2) avisarDos()
      await bloqueo
      return sampleWave
    },
  }
  const path = 'propias/ondas-concurrentes.wav'
  const primero = obtenerOndaAudio(path, range, deps)
  const segundo = obtenerOndaAudio(path, { ...range, desdeMs: 1000 }, deps)
  try {
    await dosActivos
    const repetido = obtenerOndaAudio(path, range, deps)
    await assert.rejects(obtenerOndaAudio(path, { ...range, desdeMs: 2000 }, deps),
      error => error instanceof AnalysisError && error.status === 429)
    liberar()
    const [a, b, c] = await Promise.all([primero, segundo, repetido])
    assert.deepEqual(c, a)
    assert.deepEqual(b, a)
    assert.equal(decodes, 2)
  } finally { liberar() }
})

test('errores de FFmpeg no exponen la URL firmada', async () => {
  const deps = {
    reader: {
      info: async () => ({ data: { version: 'v1', size: 2000, contentType: 'audio/wav' }, error: null }),
      createSignedUrl: async () => ({ data: { signedUrl: 'https://storage/signed?token=secreto' }, error: null }),
    },
    decode: async () => { throw new Error('Falló https://storage/signed?token=secreto') },
  }
  await assert.rejects(obtenerOndaAudio('propias/falla-onda.wav', range, deps),
    error => error instanceof AnalysisError && error.status === 502 && !error.message.includes('secreto'))
})
