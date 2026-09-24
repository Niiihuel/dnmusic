import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = ts.transpileModule(readFileSync('src/lib/crossfade.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const module = { exports: {} }
const platform = { OS: 'ios' }
new Function('exports', 'require', source)(module.exports, id => {
  if (id === 'react-native') return { Platform: platform }
  throw Error(`Unexpected runtime dependency: ${id}`)
})
const { iniciarCrossfade } = module.exports

function player() {
  const listeners = new Set()
  return {
    duration: 10, currentTime: 5, isLoaded: true, playing: true, volume: 0.8,
    pauseCalls: 0, playCalls: 0, cancelCalls: 0,
    addListener(_name, fn) { listeners.add(fn); return { remove: () => listeners.delete(fn) } },
    emit(status) { for (const fn of [...listeners]) fn(status) },
    play() { this.playCalls++; this.playing = true },
    pause() { this.pauseCalls++; this.playing = false },
    seekTo(seconds) { this.currentTime = seconds; return Promise.resolve() },
    cancelCrossfade() { this.cancelCalls++ },
  }
}

test('handoff iOS conserva el volumen actualizado y no emite una segunda pausa', async () => {
  const from = player(), to = player()
  to.playing = false
  let completed = 0
  let received = null
  from.scheduleCrossfade = async (_to, options) => { received = options; return true }
  const cancel = iniciarCrossfade(from, to, {
    durationSeconds: 2, fromStartSeconds: 7, toStartSeconds: 0.5,
    volumeLaw: 'equal_power', volumeIn: [{ t: 0, value: 0 }, { t: 1, value: 1 }],
  }, () => completed++)
  await Promise.resolve()
  assert.equal(received.fromStartSeconds, 7)
  assert.equal(received.volumeLaw, 'equal_power')
  from.volume = 0.35; to.volume = 0.42
  from.emit({ didJustCrossfade: true })
  from.emit({ didJustCrossfade: true })
  cancel()
  assert.equal(completed, 1)
  assert.equal(from.pauseCalls, 0)
  assert.equal(from.volume, 0.35)
  assert.equal(to.volume, 0.42)
})

test('Android recibe cues y efectos temporales para sus dos decks PCM', async () => {
  platform.OS = 'android'
  const from = player(), to = player()
  to.playing = false
  let received = null
  from.scheduleCrossfade = async (_to, options) => { received = options; return true }
  const cancel = iniciarCrossfade(from, to, {
    durationSeconds: 2, fromStartSeconds: 7, volumeLaw: 'equal_power',
    eqSettings: { version: 1, enabled: true, out: {}, in: {} },
    filterSettings: { version: 1, enabled: true, out: null, in: null },
  }, () => {})
  await Promise.resolve()
  assert.equal(received.fromStartSeconds, 7)
  assert.equal(received.eqSettings.enabled, true)
  assert.equal(received.filterSettings.enabled, true)
  cancel()
  platform.OS = 'ios'
})

test('el prearm confirma el scheduler antes de arrancar y descarta respuestas tras cancelar', async () => {
  const from = player(), to = player()
  to.playing = false
  let accept
  let armed = []
  from.scheduleCrossfade = () => new Promise(resolve => { accept = resolve })
  const cancel = iniciarCrossfade(from, to, {
    durationSeconds: 2, fromStartSeconds: 0, volumeLaw: 'linear',
  }, () => {}, () => {}, result => armed.push(result))
  assert.deepEqual(armed, [])
  accept(true)
  await Promise.resolve()
  assert.deepEqual(armed, [true])
  cancel()

  const cancelSecond = iniciarCrossfade(from, to, {
    durationSeconds: 2, fromStartSeconds: 0, volumeLaw: 'linear',
  }, () => {}, () => {}, result => armed.push(result))
  cancelSecond()
  accept(true)
  await Promise.resolve()
  assert.deepEqual(armed, [true])
})

test('un EQ temporal no cae silenciosamente al fundido JS sin DSP', async () => {
  const from = player(), to = player()
  to.playing = false
  from.scheduleCrossfade = async () => false
  let unavailable = 0
  iniciarCrossfade(from, to, {
    durationSeconds: 2, fromStartSeconds: 7,
    volumeLaw: 'equal_power',
    eqSettings: { version: 1, enabled: true, out: {}, in: {} },
  }, () => {}, () => unavailable++)
  await Promise.resolve()
  assert.equal(unavailable, 1)
  assert.equal(to.playCalls, 0)
})

test('web sin grafo de audio continúa con el fin normal, sin solapar dos elementos', async () => {
  platform.OS = 'web'
  try {
    const from = player(), to = player()
    to.playing = false
    from.scheduleCrossfade = async () => false
    let unavailable = 0
    iniciarCrossfade(from, to, {
      durationSeconds: 2, fromStartSeconds: 7, volumeLaw: 'equal_power',
    }, () => {}, () => unavailable++)
    await Promise.resolve()
    assert.equal(unavailable, 1)
    assert.equal(to.playCalls, 0)
    assert.equal(from.pauseCalls, 0)
  } finally {
    platform.OS = 'ios'
  }
})

test('rechazo nativo pasa al fundido de respaldo y entrega una vez', async () => {
  const from = player(), to = player()
  from.currentTime = 9.75
  to.playing = false
  let completed = 0
  from.scheduleCrossfade = async () => false
  iniciarCrossfade(from, to, { durationSeconds: 0.25, fromStartSeconds: 9.75,
    toStartSeconds: 0, volumeLaw: 'linear' }, () => completed++)
  await new Promise(resolve => setTimeout(resolve, 400))
  assert.equal(to.playCalls, 1)
  assert.equal(completed, 1)
  assert.equal(from.pauseCalls, 1)
  assert.equal(from.volume, 0.8)
  assert.equal(to.volume, 0.8)
})

test('cancelar un plan nativo conserva el deck saliente y no avanza', async () => {
  const from = player(), to = player()
  let completed = 0
  from.scheduleCrossfade = async () => true
  const cancel = iniciarCrossfade(from, to, { durationSeconds: 2, fromStartSeconds: 7,
    volumeLaw: 'linear' }, () => completed++)
  await Promise.resolve()
  cancel()
  from.emit({ didJustCrossfade: true })
  assert.equal(completed, 0)
  assert.equal(from.pauseCalls, 0)
  assert.equal(from.cancelCalls, 1)
})

test('el respaldo pausa ambos decks y congela el progreso del fundido', async () => {
  const from = player(), to = player()
  to.playing = false
  let completed = 0
  const cancel = iniciarCrossfade(from, to, { durationSeconds: 0.25, fromStartSeconds: 5,
    volumeLaw: 'linear' }, () => completed++)
  await new Promise(resolve => setTimeout(resolve, 70))
  from.playing = false
  await new Promise(resolve => setTimeout(resolve, 160))
  assert.equal(to.playing, false)
  assert.equal(completed, 0)
  from.playing = true
  await new Promise(resolve => setTimeout(resolve, 300))
  assert.equal(completed, 1)
  assert.ok(to.playCalls >= 2, 'el deck entrante se reanuda junto al saliente')
  cancel()
})
