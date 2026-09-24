import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ANALYSIS_SAMPLE_RATE, analizarPcm } from '../dist/analysis-dsp.js'
import { ANALYSIS_CACHE_VERSION, MAX_CONCURRENT_ANALYSES, MAX_CONCURRENT_CACHE_LOOKUPS, AnalysisError, clienteLecturaAudio, decodificarYAnalizar, leerLoudnorm, medirLoudness, obtenerAnalisisMusical, rutaAudioValida, rutaCacheAnalisis } from '../dist/analysis.js'

function pulsos(segundos = 40, bpm = 120, acento = true) {
  const muestras = new Int16Array(ANALYSIS_SAMPLE_RATE * segundos)
  const periodo = 60 / bpm
  for (let beat = 0; ; beat++) {
    const inicio = Math.round((2 + beat * periodo) * ANALYSIS_SAMPLE_RATE)
    if (inicio + 240 >= (segundos - 2) * ANALYSIS_SAMPLE_RATE) break
    const amplitud = acento && beat % 4 === 0 ? 0.9 : 0.3
    for (let j = 0; j < 240; j++) {
      muestras[inicio + j] = Math.round(32767 * amplitud *
        Math.sin(2 * Math.PI * 900 * j / ANALYSIS_SAMPLE_RATE) * Math.exp(-j / 75))
    }
  }
  return muestras
}

function mezclaRitmica(segundos = 60, bpm = 154) {
  const rate = ANALYSIS_SAMPLE_RATE
  const señal = new Float32Array(rate * segundos)
  for (let i = 0; i < señal.length; i++) {
    señal[i] = 0.08 * Math.sin(2 * Math.PI * 220 * i / rate) +
      0.04 * Math.sin(2 * Math.PI * 330 * i / rate)
  }
  const agregar = (inicio, largo, amplitud, frecuencia, caída) => {
    for (let j = 0; j < largo && inicio + j < señal.length; j++) {
      señal[inicio + j] += amplitud * Math.sin(2 * Math.PI * frecuencia * j / rate) * Math.exp(-j / caída)
    }
  }
  for (let beat = 0; ; beat++) {
    const inicio = Math.round((2 + beat * 60 / bpm) * rate)
    if (inicio >= (segundos - 2) * rate) break
    agregar(inicio, 1200, 0.50, 90, 400)
    if (beat % 2 === 1) agregar(inicio, 800, 0.27, 1300, 180)
    const medio = Math.round((2 + (beat + 0.5) * 60 / bpm) * rate)
    agregar(medio, 400, 0.12, 2600, 100)
  }
  return Int16Array.from(señal, value => Math.round(32767 * Math.max(-1, Math.min(1, value))))
}

function tempoPartido() {
  const rate = ANALYSIS_SAMPLE_RATE
  const señal = new Int16Array(rate * 80)
  for (const [desde, hasta, bpm] of [[2, 40, 90], [42, 78, 140]]) {
    for (let tiempo = desde; tiempo < hasta; tiempo += 60 / bpm) {
      const inicio = Math.round(tiempo * rate)
      for (let j = 0; j < 320; j++) {
        señal[inicio + j] = Math.round(22000 * Math.sin(2 * Math.PI * 900 * j / rate) * Math.exp(-j / 90))
      }
    }
  }
  return señal
}

function tempoGradual() {
  const rate = ANALYSIS_SAMPLE_RATE
  const señal = new Int16Array(rate * 120)
  for (let tiempo = 2; tiempo < 118; tiempo += 60 / (90 + 6 * tiempo / 120)) {
    const inicio = Math.round(tiempo * rate)
    for (let j = 0; j < 320; j++) {
      señal[inicio + j] = Math.round(22000 * Math.sin(2 * Math.PI * 900 * j / rate) * Math.exp(-j / 90))
    }
  }
  return señal
}

function temposCercanosSinGrid() {
  const rate = ANALYSIS_SAMPLE_RATE
  const señal = new Int16Array(rate * 100)
  for (const [desde, hasta, bpm] of [[2, 50, 90], [52, 98, 94]]) {
    for (let tiempo = desde; tiempo < hasta; tiempo += 60 / bpm) {
      const inicio = Math.round(tiempo * rate)
      for (let j = 0; j < 320; j++) {
        señal[inicio + j] = Math.round(22000 * Math.sin(2 * Math.PI * 900 * j / rate) * Math.exp(-j / 90))
      }
    }
  }
  return señal
}

function wav(muestras) {
  const bytes = Buffer.alloc(44 + muestras.length * 2)
  bytes.write('RIFF', 0)
  bytes.writeUInt32LE(bytes.length - 8, 4)
  bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(ANALYSIS_SAMPLE_RATE, 24)
  bytes.writeUInt32LE(ANALYSIS_SAMPLE_RATE * 2, 28)
  bytes.writeUInt16LE(2, 32)
  bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36)
  bytes.writeUInt32LE(muestras.length * 2, 40)
  for (let i = 0; i < muestras.length; i++) bytes.writeInt16LE(muestras[i], 44 + i * 2)
  return bytes
}

function tono(segundos, amplitud) {
  const muestras = new Int16Array(ANALYSIS_SAMPLE_RATE * segundos)
  for (let i = 0; i < muestras.length; i++) {
    muestras[i] = Math.round(32767 * amplitud * Math.sin(2 * Math.PI * 440 * i / ANALYSIS_SAMPLE_RATE))
  }
  return muestras
}

function wavEstereoContrafase(segundos, amplitud) {
  const samples = ANALYSIS_SAMPLE_RATE * segundos
  const bytes = Buffer.alloc(44 + samples * 4)
  bytes.write('RIFF', 0)
  bytes.writeUInt32LE(bytes.length - 8, 4)
  bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(2, 22)
  bytes.writeUInt32LE(ANALYSIS_SAMPLE_RATE, 24)
  bytes.writeUInt32LE(ANALYSIS_SAMPLE_RATE * 4, 28)
  bytes.writeUInt16LE(4, 32)
  bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36)
  bytes.writeUInt32LE(samples * 4, 40)
  for (let i = 0; i < samples; i++) {
    const value = Math.round(32767 * amplitud * Math.sin(2 * Math.PI * 440 * i / ANALYSIS_SAMPLE_RATE))
    bytes.writeInt16LE(value, 44 + i * 4)
    bytes.writeInt16LE(-value, 46 + i * 4)
  }
  return bytes
}

test('un pulso 4/4 claro produce BPM, beats y compases; silencio y onda salen del PCM', () => {
  const r = analizarPcm(pulsos(40, 120))
  assert.equal(r.durationMs, 40_000)
  assert.equal(r.waveform.rms.length, 256)
  assert.ok(r.waveform.rms.every(v => v >= 0 && v <= 1))
  for (const band of ['low', 'mid', 'high']) {
    assert.equal(r.waveform.bands[band].length, 256)
    assert.ok(r.waveform.bands[band].every(v => v >= 0 && v <= 1))
  }
  assert.equal(r.silence.introEndMs, 2_000)
  assert.ok(r.silence.outroStartMs > 37_000)
  assert.ok(r.energy.peakRms > r.energy.meanRms)
  assert.ok(r.rhythm)
  assert.ok(Math.abs(r.rhythm.bpm - 120) < 1)
  assert.ok(r.tempo)
  assert.ok(Math.abs(r.tempo.bpm - 120) < 1)
  assert.ok(r.tempo.minBpm <= r.tempo.bpm && r.tempo.bpm <= r.tempo.maxBpm)
  assert.ok(r.tempo.confidence >= 0.55 && r.tempo.confidence <= 1)
  assert.ok(r.rhythm.confidence >= 0.55)
  assert.equal(r.rhythm.meter, 4)
  assert.ok(r.rhythm.barMs.length >= 8)
  assert.ok(r.rhythm.beatMs[0] >= 1_940)
})

test('un pulso regular sin acento conserva BPM pero no inventa compás', () => {
  const r = analizarPcm(pulsos(40, 123, false))
  assert.ok(r.rhythm)
  assert.ok(Math.abs(r.rhythm.bpm - 123) < 2)
  assert.equal(r.rhythm.meter, null)
  assert.equal(r.rhythm.barMs, null)
})

test('una mezcla de bajo, caja, hi-hat y nota sostenida conserva BPM y beats medidos', () => {
  const result = analizarPcm(mezclaRitmica())
  assert.ok(result.rhythm)
  assert.ok(Math.abs(result.rhythm.bpm - 154) < 2, `BPM observado: ${result.rhythm.bpm}`)
  assert.ok(result.tempo)
  assert.ok(Math.abs(result.tempo.bpm - result.rhythm.bpm) < 2)
  assert.ok(Math.abs(result.tempo.alternateBpm - 77) < 2)
  assert.ok(result.rhythm.confidence >= 0.75)
  assert.ok(result.rhythm.beatMs.some(t => Math.abs(t - 2_000) <= 80))
  assert.ok(result.rhythm.beatMs.some(t => Math.abs(t - (2_000 + 120 * 60_000 / 154)) <= 80))
})

test('dos secciones con tempos incompatibles no fabrican un BPM global', () => {
  const result = analizarPcm(tempoPartido())
  assert.equal(result.rhythm, null)
  assert.equal(result.tempo, null)
})

test('tempo que varía gradualmente tiene rango medido', () => {
  const result = analizarPcm(tempoGradual())
  assert.ok(result.tempo)
  assert.ok(result.tempo.minBpm < result.tempo.maxBpm)
  assert.ok(result.tempo.bpm >= result.tempo.minBpm && result.tempo.bpm <= result.tempo.maxBpm)
  assert.equal(result.tempo.varying, true)
})

test('dos velocidades cercanas dan BPM aproximado sin inventar beatgrid fiable', () => {
  const result = analizarPcm(temposCercanosSinGrid())
  assert.ok(result.tempo)
  assert.ok(result.tempo.minBpm <= 90)
  assert.ok(result.tempo.maxBpm >= 94)
  assert.equal(result.tempo.varying, true)
  assert.equal(result.rhythm, null)
})

test('un tono sostenido y un archivo mudo no producen BPM ni tonalidad inventada', () => {
  const sostenido = new Int16Array(ANALYSIS_SAMPLE_RATE * 25)
  for (let i = 0; i < sostenido.length; i++) sostenido[i] = Math.round(4000 * Math.sin(2 * Math.PI * 440 * i / ANALYSIS_SAMPLE_RATE))
  assert.equal(analizarPcm(sostenido).rhythm, null)
  assert.equal(analizarPcm(sostenido).tempo, null)
  const mudo = analizarPcm(new Int16Array(ANALYSIS_SAMPLE_RATE * 25))
  assert.equal(mudo.rhythm, null)
  assert.equal(mudo.tempo, null)
  assert.equal(mudo.energy.meanRms, 0)
  assert.equal(mudo.silence.introEndMs, 25_000)
  assert.equal(mudo.silence.outroStartMs, 0)
  assert.equal('key' in mudo, false)
})

test('ataques con tiempos irregulares no pasan el umbral de ritmo', () => {
  const muestras = new Int16Array(ANALYSIS_SAMPLE_RATE * 50)
  let semilla = 123456789, tiempo = 2
  while (tiempo < 48) {
    semilla = (Math.imul(semilla, 1664525) + 1013904223) >>> 0
    tiempo += 0.25 + semilla / 4294967296 * 0.7
    const inicio = Math.round(tiempo * ANALYSIS_SAMPLE_RATE)
    for (let j = 0; j < 240 && inicio + j < muestras.length; j++) {
      muestras[inicio + j] = Math.round(9000 * Math.sin(2 * Math.PI * 900 * j / ANALYSIS_SAMPLE_RATE) * Math.exp(-j / 75))
    }
  }
  const result = analizarPcm(muestras)
  assert.equal(result.rhythm, null)
  assert.equal(result.tempo, null)
})

test('ffprobe y ffmpeg decodifican un WAV real antes de pasar al analizador', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dn-analysis-'))
  try {
    const path = join(dir, 'beat.wav')
    await writeFile(path, wav(pulsos(20, 120)))
    const r = await decodificarYAnalizar(path)
    assert.equal(r.durationMs, 20_000)
    assert.ok(Math.abs(r.rhythm?.bpm - 120) < 1)
    assert.ok(Number.isFinite(r.loudness?.integratedLufs))
    assert.ok(Number.isFinite(r.loudness?.truePeakDbtp))
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('loudnorm mide LUFS y true peak multicanal sin confundirlos con RMS', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dn-loudness-'))
  try {
    const bajo = join(dir, 'bajo.wav'), alto = join(dir, 'alto.wav')
    await Promise.all([writeFile(bajo, wav(tono(5, 0.25))), writeFile(alto, wav(tono(5, 0.5)))])
    const a = await decodificarYAnalizar(bajo)
    const b = await decodificarYAnalizar(alto)
    assert.ok(a.loudness && b.loudness)
    assert.ok(Math.abs(b.loudness.integratedLufs - a.loudness.integratedLufs - 6.02) < 0.3)
    assert.ok(Math.abs(b.loudness.truePeakDbtp - a.loudness.truePeakDbtp - 6.02) < 0.3)
    assert.ok(Math.abs(b.loudness.truePeakDbtp + 6.02) < 0.7)
    assert.equal('integratedLufs' in b.energy, false)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('el loudness conserva los canales originales aunque el PCM mono se cancele', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dn-loudness-stereo-'))
  try {
    const path = join(dir, 'contrafase.wav')
    await writeFile(path, wavEstereoContrafase(5, 0.5))
    const result = await decodificarYAnalizar(path)
    assert.ok(result.energy.meanRms < 0.001)
    assert.ok(result.loudness)
    assert.ok(result.loudness.integratedLufs > -30)
    assert.ok(Math.abs(result.loudness.truePeakDbtp + 6.02) < 0.7)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('si FFmpeg falla o informa infinito no fabrica un valor de loudness', async () => {
  assert.equal(await medirLoudness('/audio/que-no-existe.wav'), null)
  assert.equal(leerLoudnorm('{"input_i":"-inf","input_tp":"-inf"}'), null)
  assert.equal(leerLoudnorm('salida incompleta'), null)
  assert.deepEqual(leerLoudnorm('{"input_i":"-16.40","input_tp":"1.20","output_i":"-24"}'),
    { integratedLufs: -16.4, truePeakDbtp: 1.2 })
  const dir = await mkdtemp(join(tmpdir(), 'dn-loudness-silent-'))
  try {
    const path = join(dir, 'silencio.wav')
    await writeFile(path, wav(new Int16Array(ANALYSIS_SAMPLE_RATE * 3)))
    assert.equal(await medirLoudness(path), null)
    const result = await decodificarYAnalizar(path)
    assert.equal(result.loudnessSilenceConfirmed, true)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('autoriza la ruta exacta antes de leer caché; versión nueva invalida el análisis', async () => {
  const calls = []
  let version = 'v1'
  const files = new Map()
  const features = { ...analizarPcm(pulsos(20, 120)), loudness: { integratedLufs: -15, truePeakDbtp: -1 } }
  const deps = {
    reader: {
      info: async path => { calls.push(['info', path]); return { data: { version, size: 1000, contentType: 'audio/mp4' }, error: null } },
      createSignedUrl: async path => { calls.push(['sign', path]); return { data: { signedUrl: 'signed-audio' }, error: null } },
    },
    cache: {
      download: async path => { calls.push(['download', path]); return { data: files.has(path) ? new Blob([files.get(path)]) : null, error: null } },
      upload: async (path, json) => { calls.push(['upload', path]); files.set(path, json); return { error: null } },
    },
    reserveStorage: async () => {},
    decode: async url => { calls.push(['decode', url]); return features },
  }
  const path = 'abcdefghijk.m4a'
  const primero = await obtenerAnalisisMusical(path, deps)
  assert.deepEqual(primero.loudness, features.loudness)
  assert.equal(ANALYSIS_CACHE_VERSION, 5)
  assert.ok(rutaCacheAnalisis(path, { version: 'v1', size: 1000 }).ruta.startsWith('analysis/v5/'))
  const segundo = await obtenerAnalisisMusical(path, deps)
  assert.deepEqual(segundo, primero)
  assert.equal(calls.filter(c => c[0] === 'info').length, 2)
  assert.equal(calls.filter(c => c[0] === 'decode').length, 1)
  version = 'v2'
  const nuevo = await obtenerAnalisisMusical(path, deps)
  assert.notEqual(nuevo.sourceVersion, primero.sourceVersion)
  assert.equal(calls.filter(c => c[0] === 'decode').length, 2)
  assert.notEqual(rutaCacheAnalisis(path, { version: 'v1', size: 1000 }).ruta,
    rutaCacheAnalisis(path, { version: 'v2', size: 1000 }).ruta)

  const antes = calls.length
  deps.reader.info = async () => ({ data: null, error: new Error('denied') })
  await assert.rejects(obtenerAnalisisMusical(path, deps), e => e instanceof AnalysisError && e.status === 404)
  assert.equal(calls.length, antes)
  assert.equal(rutaAudioValida('analysis/v1/file.json'), false)
  await assert.rejects(obtenerAnalisisMusical('../otro.m4a', deps), e => e instanceof AnalysisError && e.status === 400)
})

test('descarta una caché v5 con tempo ausente o fuera de rango', async () => {
  const path = 'tempo-cache.m4a'
  const info = { version: 'v1', size: 1000, contentType: 'audio/mp4' }
  const features = { ...analizarPcm(pulsos(20, 120)), loudness: { integratedLufs: -15, truePeakDbtp: -1 } }
  const sourceVersion = rutaCacheAnalisis(path, info).version
  let decodes = 0
  let cached = { version: 1, audioPath: path, sourceVersion, ...features, tempo: undefined }
  const deps = {
    reader: {
      info: async () => ({ data: info, error: null }),
      createSignedUrl: async () => ({ data: { signedUrl: 'signed-audio' }, error: null }),
    },
    cache: {
      download: async () => ({ data: new Blob([JSON.stringify(cached)]), error: null }),
      upload: async () => ({ error: null }),
    },
    reserveStorage: async () => {},
    decode: async () => { decodes++; return features },
  }
  assert.equal((await obtenerAnalisisMusical(path, deps)).tempo?.bpm, 120)
  cached = { version: 1, audioPath: path, sourceVersion, ...features,
    tempo: { ...features.tempo, bpm: 260 } }
  assert.equal((await obtenerAnalisisMusical(path, deps)).tempo?.bpm, 120)
  assert.equal(decodes, 2)
})

test('solo dos análisis distintos quedan activos; una misma huella comparte trabajo y libera el cupo', async () => {
  assert.equal(MAX_CONCURRENT_ANALYSES, 2)
  assert.equal(MAX_CONCURRENT_CACHE_LOOKUPS, 8)
  let liberar
  const bloqueo = new Promise(resolve => { liberar = resolve })
  let avisarInicio
  const iniciados = new Promise(resolve => { avisarInicio = resolve })
  let decodes = 0
  const features = { ...analizarPcm(pulsos(20, 120)), loudness: { integratedLufs: -15, truePeakDbtp: -1 } }
  const info = { version: 'v1', size: 1000, contentType: 'audio/mp4' }
  const cachedVersion = rutaCacheAnalisis('cacheado.m4a', info)
  const cachedResult = { version: 1, audioPath: 'cacheado.m4a', sourceVersion: cachedVersion.version, ...features }
  const deps = {
    reader: {
      info: async () => ({ data: info, error: null }),
      createSignedUrl: async path => ({ data: { signedUrl: path }, error: null }),
    },
    cache: {
      download: async path => ({ data: path === cachedVersion.ruta ? new Blob([JSON.stringify(cachedResult)]) : null, error: null }),
      upload: async () => ({ error: null }),
    },
    reserveStorage: async () => {},
    decode: async () => {
      decodes++
      if (decodes === 2) avisarInicio()
      await bloqueo
      return features
    },
  }
  const primero = obtenerAnalisisMusical('primero.m4a', deps)
  const segundo = obtenerAnalisisMusical('segundo.m4a', deps)
  try {
    await iniciados
    assert.deepEqual(await obtenerAnalisisMusical('cacheado.m4a', deps), cachedResult)
    assert.equal(decodes, 2)
    const compartido = obtenerAnalisisMusical('primero.m4a', deps)
    await assert.rejects(obtenerAnalisisMusical('tercero.m4a', deps),
      e => e instanceof AnalysisError && e.status === 429)
    assert.equal(decodes, 2)
    liberar()
    const [uno, dos, repetido] = await Promise.all([primero, segundo, compartido])
    assert.deepEqual(repetido, uno)
    assert.equal(dos.audioPath, 'segundo.m4a')
    await obtenerAnalisisMusical('tercero.m4a', deps)
    assert.equal(decodes, 3)
  } finally { liberar() }
})

test('consultas simultáneas de una huella comparten lectura de caché y cálculo tras el miss', async () => {
  let liberarCache
  const bloqueoCache = new Promise(resolve => { liberarCache = resolve })
  let avisarCache
  const cacheIniciada = new Promise(resolve => { avisarCache = resolve })
  let downloads = 0, decodes = 0
  const features = { ...analizarPcm(pulsos(20, 120)), loudness: { integratedLufs: -15, truePeakDbtp: -1 } }
  const deps = {
    reader: {
      info: async () => ({ data: { version: 'v1', size: 1000, contentType: 'audio/mp4' }, error: null }),
      createSignedUrl: async () => ({ data: { signedUrl: 'firmada' }, error: null }),
    },
    cache: {
      download: async () => { downloads++; avisarCache(); await bloqueoCache; return { data: null, error: null } },
      upload: async () => ({ error: null }),
    },
    reserveStorage: async () => {},
    decode: async () => { decodes++; return features },
  }
  const a = obtenerAnalisisMusical('compartida.m4a', deps)
  try {
    await cacheIniciada
    const b = obtenerAnalisisMusical('compartida.m4a', deps)
    liberarCache()
    const [primero, segundo] = await Promise.all([a, b])
    assert.deepEqual(primero, segundo)
    assert.equal(downloads, 1)
    assert.equal(decodes, 1)
  } finally { liberarCache() }
})

test('las consultas de caché de huellas distintas también tienen un límite sin cola', async () => {
  let liberarCache
  const bloqueoCache = new Promise(resolve => { liberarCache = resolve })
  let avisarOcho
  const ochoIniciadas = new Promise(resolve => { avisarOcho = resolve })
  let downloads = 0
  const features = { ...analizarPcm(pulsos(20, 120)), loudness: { integratedLufs: -15, truePeakDbtp: -1 } }
  const deps = {
    reader: {
      info: async () => ({ data: { version: 'v1', size: 1000, contentType: 'audio/mp4' }, error: null }),
      createSignedUrl: async path => ({ data: { signedUrl: path }, error: null }),
    },
    cache: {
      download: async () => {
        downloads++
        if (downloads === MAX_CONCURRENT_CACHE_LOOKUPS) avisarOcho()
        await bloqueoCache
        return { data: null, error: null }
      },
      upload: async () => ({ error: null }),
    },
    reserveStorage: async () => {},
    decode: async () => features,
  }
  const solicitudes = Array.from({ length: MAX_CONCURRENT_CACHE_LOOKUPS }, (_, i) =>
    obtenerAnalisisMusical(`consulta${i}.m4a`, deps))
  const terminadas = Promise.allSettled(solicitudes)
  try {
    await ochoIniciadas
    await assert.rejects(obtenerAnalisisMusical('novena.m4a', deps),
      e => e instanceof AnalysisError && e.status === 429)
    assert.equal(downloads, MAX_CONCURRENT_CACHE_LOOKUPS)
  } finally {
    liberarCache()
    await terminadas
  }
})

test('loudness nulo con energía no se cachea; silencio verdadero sí', async () => {
  const files = new Map()
  const decodes = new Map()
  let uploads = 0
  const featuresSonoras = analizarPcm(pulsos(20, 120))
  const featuresSilencio = { ...analizarPcm(new Int16Array(ANALYSIS_SAMPLE_RATE * 2)), loudnessSilenceConfirmed: true }
  const featuresContrafaseConFallo = { ...featuresSilencio, loudnessSilenceConfirmed: false }
  const deps = {
    reader: {
      info: async () => ({ data: { version: 'v1', size: 1000, contentType: 'audio/mp4' }, error: null }),
      createSignedUrl: async path => ({ data: { signedUrl: path }, error: null }),
    },
    cache: {
      download: async path => ({ data: files.has(path) ? new Blob([files.get(path)]) : null, error: null }),
      upload: async (path, json) => { uploads++; files.set(path, json); return { error: null } },
    },
    reserveStorage: async () => {},
    decode: async path => {
      decodes.set(path, (decodes.get(path) ?? 0) + 1)
      return path === 'silencio.m4a' ? featuresSilencio
        : path === 'contrafase.m4a' ? featuresContrafaseConFallo : featuresSonoras
    },
  }
  await obtenerAnalisisMusical('sonoro.m4a', deps)
  await obtenerAnalisisMusical('sonoro.m4a', deps)
  assert.equal(decodes.get('sonoro.m4a'), 2)
  assert.equal(uploads, 0)

  await obtenerAnalisisMusical('contrafase.m4a', deps)
  await obtenerAnalisisMusical('contrafase.m4a', deps)
  assert.equal(decodes.get('contrafase.m4a'), 2)
  assert.equal(uploads, 0)

  await obtenerAnalisisMusical('silencio.m4a', deps)
  await obtenerAnalisisMusical('silencio.m4a', deps)
  assert.equal(decodes.get('silencio.m4a'), 1)
  assert.equal(uploads, 1)
})

test('un error devuelto por Storage deja el cálculo disponible pero obliga a recalcular', async () => {
  let decodes = 0, uploads = 0
  const features = { ...analizarPcm(pulsos(20, 120)), loudness: { integratedLufs: -15, truePeakDbtp: -1 } }
  const deps = {
    reader: {
      info: async () => ({ data: { version: 'v1', size: 1000, contentType: 'audio/mp4' }, error: null }),
      createSignedUrl: async () => ({ data: { signedUrl: 'firmada' }, error: null }),
    },
    cache: {
      download: async () => ({ data: null, error: null }),
      upload: async () => { uploads++; return { error: new Error('Storage rechazó') } },
    },
    reserveStorage: async () => {},
    decode: async () => { decodes++; return features },
  }
  const warnings = []
  const anterior = console.warn
  console.warn = message => warnings.push(message)
  try {
    const a = await obtenerAnalisisMusical('error.m4a', deps)
    const b = await obtenerAnalisisMusical('error.m4a', deps)
    assert.deepEqual(b, a)
    assert.equal(decodes, 2)
    assert.equal(uploads, 2)
    assert.equal(warnings.length, 2)
    assert.ok(warnings.every(message => !message.includes('firmada')))
  } finally { console.warn = anterior }
})

test('Storage recibe el JWT de la persona, nunca la service key en Authorization', async () => {
  let headers
  const client = clienteLecturaAudio('http://localhost:54321', 'service-secret', 'Bearer user-jwt', async (_url, init) => {
    headers = new Headers(init.headers)
    return new Response(JSON.stringify({ id: 'id', version: 'v1', name: 'song.m4a', bucket_id: 'songs', created_at: '2026-01-01', size: 1024 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
  const { data, error } = await client.storage.from('songs').info('song.m4a')
  assert.equal(error, null)
  assert.equal(data.version, 'v1')
  assert.equal(headers.get('Authorization'), 'Bearer user-jwt')
  assert.equal(headers.get('apikey'), 'service-secret')
})

test('admite la ruta final de una canción propia, pero no su cuarentena ni otros prefijos', () => {
  assert.equal(rutaAudioValida('propias/123e4567-e89b-12d3-a456-426614174000.flac'), true)
  assert.equal(rutaAudioValida('propias/123e4567-e89b-12d3-a456-426614174000/tema.flac'), false)
  assert.equal(rutaAudioValida('aportes/usuario/tema.m4a'), false)
  assert.equal(rutaAudioValida('analysis/v1/fingerprint.json'), false)
})
