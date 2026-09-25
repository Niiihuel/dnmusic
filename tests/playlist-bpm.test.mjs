import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync('src/lib/playlistBpm.ts', 'utf8')
const code = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText
const exports = {}
new Function('exports', code)(exports)
const { PlaylistBpmQueue, bpmConfiable, tempoDeLista } = exports

function analysis(bpm = 120, confidence = 0.9) {
  return { version: 1, durationMs: 60_000,
    rhythm: { bpm, confidence, beatMs: Array.from({ length: 32 }, (_, i) => i * 500) } }
}
const flush = () => new Promise(resolve => setImmediate(resolve))

test('BPM se muestra sólo con pulso real y confianza suficiente', () => {
  assert.equal(bpmConfiable(analysis(122.6)), 123)
  assert.equal(bpmConfiable(analysis(120, 0.74)), null)
  assert.equal(bpmConfiable({ ...analysis(), rhythm: null }), null)
  assert.equal(bpmConfiable(analysis(240)), null)
  const unordered = analysis()
  unordered.rhythm.beatMs[4] = unordered.rhythm.beatMs[3]
  assert.equal(bpmConfiable(unordered), null)
})

test('tempo aproximado medido se distingue de la rejilla rítmica', () => {
  const measured = { ...analysis(), rhythm: null, tempo: {
    bpm: 96.4, minBpm: 92.2, maxBpm: 99.8, confidence: 0.67, varying: true, alternateBpm: null,
  } }
  assert.deepEqual(tempoDeLista(measured), {
    bpm: 96, approximate: true, minBpm: 92, maxBpm: 100, varying: true,
  })
  assert.equal(bpmConfiable(measured), null)
  assert.equal(tempoDeLista({ ...measured, tempo: { ...measured.tempo, bpm: 250 } }), null)
  assert.deepEqual(tempoDeLista(analysis(122.6)), {
    bpm: 123, approximate: false, minBpm: 123, maxBpm: 123, varying: false,
  })
})

test('la lista comparte caché, no duplica rutas y limita análisis simultáneos a dos', async () => {
  const pending = new Map()
  const started = []
  const queue = new PlaylistBpmQueue((path, signal) => new Promise((resolve, reject) => {
    started.push(path)
    pending.set(path, { resolve, reject, signal })
  }))
  const seen = []
  const stopA = queue.subscribe(['a.m4a', 'b.m4a', 'a.m4a', 'c.m4a'], () => seen.push('a'))
  const stopB = queue.subscribe(['a.m4a'], () => seen.push('b'))
  assert.deepEqual(started, ['a.m4a', 'b.m4a'])
  pending.get('a.m4a').resolve(analysis(126))
  await flush()
  assert.deepEqual(started, ['a.m4a', 'b.m4a', 'c.m4a'])
  assert.deepEqual(queue.read('a.m4a'), {
    bpm: 126, approximate: false, minBpm: 126, maxBpm: 126, varying: false,
  })
  assert.ok(seen.includes('a') && seen.includes('b'))
  pending.get('b.m4a').resolve(analysis(88, 0.6))
  pending.get('c.m4a').resolve(analysis(132))
  await flush()
  assert.equal(queue.read('b.m4a'), null)
  assert.equal(queue.read('c.m4a')?.bpm, 132)
  const stopCached = queue.subscribe(['a.m4a'], () => {})
  await flush()
  assert.equal(started.length, 3)
  stopCached(); stopA(); stopB()
})

test('al abandonar la lista cancela trabajos y no guarda resultados tardíos', async () => {
  const signals = new Map()
  const started = []
  const queue = new PlaylistBpmQueue((path, signal) => new Promise(resolve => {
    started.push(path)
    signals.set(path, { signal, resolve })
  }))
  const stop = queue.subscribe(['a.m4a', 'b.m4a', 'c.m4a'], () => {})
  assert.deepEqual(started, ['a.m4a', 'b.m4a'])
  stop()
  assert.equal(signals.get('a.m4a').signal.aborted, true)
  assert.equal(signals.get('b.m4a').signal.aborted, true)
  signals.get('a.m4a').resolve(analysis())
  signals.get('b.m4a').resolve(analysis())
  await flush()
  assert.deepEqual(started, ['a.m4a', 'b.m4a'])
  assert.equal(queue.read('a.m4a'), null)
})
