import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const compile = name => ts.transpileModule(readFileSync(`node_modules/expo-audio/src/${name}.ts`, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
// Metro/Electron import `build/`, not `src/`. Exercise the shipped runtime so a
// source-only SDK patch cannot silently disable the crossfade again.
const playerCode = ts.transpileModule(readFileSync('node_modules/expo-audio/build/AudioPlayer.web.js', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, allowJs: true },
}).outputText
const utilsCode = compile('AudioUtils.web')

function fixture({ webAudio = true, crossOrigin = 'anonymous', delayedIncomingPlay = false } = {}) {
  const media = [], events = [], contexts = []
  class Media {
    constructor(src) {
      this.src = src; this._currentTime = 0; this.duration = 10
      this.paused = true; this.ended = false; this.readyState = 4
      this.playbackRate = 1; this.volume = 1; this.muted = false; this.loop = false
      this.listeners = new Map(); media.push(this)
    }
    get currentTime() { return this._currentTime }
    set currentTime(value) {
      this._currentTime = value
      this.onseeked?.()
      this.dispatch('seeked')
    }
    addEventListener(name, callback) {
      const callbacks = this.listeners.get(name) ?? new Set()
      callbacks.add(callback); this.listeners.set(name, callbacks)
    }
    removeEventListener(name, callback) { this.listeners.get(name)?.delete(callback) }
    dispatch(name) { for (const callback of this.listeners.get(name) ?? []) callback() }
    play() {
      this.paused = false; this.ended = false; this.onplay?.()
      if (delayedIncomingPlay && media.indexOf(this) === 1) {
        return new Promise(resolve => { this.resolvePlay = resolve })
      }
      return Promise.resolve()
    }
    pause() { if (this.paused) return; this.paused = true; this.onpause?.() }
    advanceTo(value) { this._currentTime = value; this.ontimeupdate?.() }
    finish() { this._currentTime = this.duration; this.ended = true; this.paused = true; this.onended?.() }
    removeAttribute() {}
    load() {}
  }
  class Param {
    constructor(value = 1) { this.value = value; this.events = [] }
    cancelAndHoldAtTime(time) { this.events.push(['hold', time]) }
    cancelScheduledValues(time) { this.events.push(['cancel', time]) }
    setValueAtTime(value, time) { this.value = value; this.events.push(['set', value, time]) }
    linearRampToValueAtTime(value, time) { this.events.push(['ramp', value, time]) }
    setTargetAtTime(value, time, constant) { this.events.push(['target', value, time, constant]) }
  }
  class Node {
    constructor() { this.connections = [] }
    connect(node) { this.connections.push(node); return node }
    disconnect() { this.connections = [] }
  }
  class Context {
    constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 48000; this.destination = new Node(); contexts.push(this) }
    createMediaElementSource() { return new Node() }
    createGain() { const node = new Node(); node.gain = new Param(); return node }
    createBiquadFilter() { const node = new Node(); node.gain = new Param(0); node.frequency = new Param(); node.Q = new Param(); return node }
    createAnalyser() { const node = new Node(); node.fftSize = 2048; node.frequencyBinCount = 1024; return node }
    resume() { this.state = 'running'; return Promise.resolve() }
  }
  class SharedObject { emit(name, status) { events.push({ name, status }) } }
  const utils = {}
  vm.runInNewContext(utilsCode, { exports: utils, require: () => ({ Asset: {} }), ...(webAudio ? { AudioContext: Context } : {}) })
  const api = {}
  const mediaSessionController = {
    updatePlaybackState() {}, updatePositionState() {}, clear() {},
  }
  vm.runInNewContext(playerCode, {
    exports: api, Audio: Media, expo: { SharedObject }, URL,
    window: { location: { origin: 'https://dnmusic.test' } },
    navigator: { userAgent: 'Chrome' },
    setTimeout, clearTimeout,
    setInterval() { assert.fail('La ganancia no debe depender de intervalos JS') },
    requestAnimationFrame() { assert.fail('La mezcla no debe depender de frames de UI') },
    require(id) {
      if (id === './AudioUtils.web') return utils
      if (id === './AudioEventKeys') return { PLAYBACK_STATUS_UPDATE: 'playbackStatusUpdate', AUDIO_SAMPLE_UPDATE: 'audioSampleUpdate' }
      if (id === './AudioModule.web') return { isAudioActive: true }
      if (id === './MediaSessionController.web') return { mediaSessionController }
      assert.fail(`Import inesperado: ${id}`)
    },
  })
  const options = crossOrigin ? { crossOrigin } : {}
  const from = new api.AudioPlayerWeb({ uri: 'https://media.test/from.mp3' }, options)
  const to = new api.AudioPlayerWeb({ uri: 'https://media.test/to.mp3' }, options)
  media[0].onloadeddata(); media[1].onloadeddata()
  return { from, to, media, events, contexts }
}

const flush = () => new Promise(resolve => setImmediate(resolve))

test('web programa ambas ganancias en AudioParam y entrega un solo handoff', async () => {
  const f = fixture()
  f.from.volume = 0.4; f.to.volume = 0.7
  f.from.play()
  assert.equal(await f.from.scheduleCrossfade(f.to, { durationSeconds: 2 }), true)
  assert.equal(f.media[1].paused, true)
  f.media[0].advanceTo(8)
  await flush()
  const outgoingRamps = f.from.crossfadeGain.gain.events.filter(event => event[0] === 'ramp')
  const incomingRamps = f.to.crossfadeGain.gain.events.filter(event => event[0] === 'ramp')
  assert.equal(outgoingRamps.at(-1)[1], 0)
  assert.equal(incomingRamps.at(-1)[1], 1)
  assert.equal(f.from.volume, 0.4)
  assert.equal(f.to.volume, 0.7)
  f.media[0].advanceTo(9.96)
  assert.equal(f.events.filter(event => event.status.didJustCrossfade).length, 1)
  assert.equal(f.media[0].paused, true)
  assert.equal(f.media[1].paused, false)
  f.media[0].finish()
  assert.equal(f.events.filter(event => event.status.didJustFinish).length, 0)
})

test('curvas personalizadas y equal power se programan sin escribir volume', async () => {
  const f = fixture()
  f.from.play()
  assert.equal(await f.from.scheduleCrossfade(f.to, {
    durationSeconds: 4, volumeLaw: 'equal_power',
    volumeOut: [{ t: 0, value: 1 }, { t: 0.25, value: 0.2 }, { t: 1, value: 0 }],
  }), true)
  f.media[0].advanceTo(6)
  await flush()
  const out = f.from.crossfadeGain.gain.events.filter(event => event[0] === 'ramp')
  const incoming = f.to.crossfadeGain.gain.events.filter(event => event[0] === 'ramp')
  assert.ok(out.some(event => event[1] === 0.2))
  assert.ok(incoming.length >= 64)
  assert.ok(incoming.some(event => Math.abs(event[1] - Math.SQRT1_2) < 0.01))
  f.from.cancelCrossfade()
})

test('el GainNode del cruce queda después del ecualizador existente', async () => {
  const f = fixture()
  f.from.setEqualizer(true, Array(10).fill(0))
  f.from.play()
  assert.equal(await f.from.scheduleCrossfade(f.to, { durationSeconds: 2 }), true)
  assert.equal(f.from.equalizerNodes.at(-1).connections[0], f.from.crossfadeGain)
  f.from.cancelCrossfade()
})

test('cancelación y pausa dejan intacta la canción saliente', async () => {
  const f = fixture()
  f.from.play()
  assert.equal(await f.from.scheduleCrossfade(f.to, { durationSeconds: 2 }), true)
  f.media[0].advanceTo(8)
  await flush()
  f.from.pause()
  assert.equal(f.media[0].paused, true)
  assert.equal(f.media[1].paused, true)
  f.from.play()
  await flush()
  assert.equal(f.media[0].paused, false)
  assert.equal(f.media[1].paused, false)
  f.from.cancelCrossfade()
  assert.equal(f.media[0].paused, false)
  assert.equal(f.media[1].paused, true)
  assert.equal(f.events.some(event => event.status.didJustCrossfade), false)
  assert.ok(f.from.crossfadeGain.gain.events.some(event => event[0] === 'ramp' && event[1] === 1))
})

test('pausar mientras el play entrante está pendiente no deja un deck audible', async () => {
  const f = fixture({ delayedIncomingPlay: true })
  f.from.play()
  assert.equal(await f.from.scheduleCrossfade(f.to, { durationSeconds: 2 }), true)
  f.media[0].advanceTo(8)
  f.from.pause()
  assert.equal(f.media[1].paused, true)
  f.media[1].resolvePlay()
  await flush()
  assert.equal(f.media[0].paused, true)
  assert.equal(f.media[1].paused, true)
  f.from.cancelCrossfade()
})

test('cue de entrada y stall cancelan el cruce sin detener la salida', async () => {
  const f = fixture()
  f.from.play()
  assert.equal(await f.from.scheduleCrossfade(f.to, {
    durationSeconds: 2, toStartSeconds: 3,
  }), true)
  assert.equal(f.to.currentTime, 3)
  f.media[0].advanceTo(8)
  await flush()
  f.media[1].onwaiting()
  assert.equal(f.media[0].paused, false)
  assert.equal(f.media[1].paused, true)
  assert.equal(f.events.some(event => event.status.didJustCrossfade), false)
})

test('CORS, WebAudio ausente y curvas inválidas devuelven false', async () => {
  const cors = fixture({ crossOrigin: null })
  cors.from.play()
  assert.equal(await cors.from.scheduleCrossfade(cors.to, { durationSeconds: 2 }), false)
  assert.equal(cors.contexts.length, 0)
  const absent = fixture({ webAudio: false })
  absent.from.play()
  assert.equal(await absent.from.scheduleCrossfade(absent.to, { durationSeconds: 2 }), false)
  const invalid = fixture()
  invalid.from.play()
  assert.equal(await invalid.from.scheduleCrossfade(invalid.to, {
    durationSeconds: 2, volumeOut: [{ t: 0, value: 1 }, { t: 1, value: 0.5 }],
  }), false)
})

test('el modo sin pausa de 250 ms puede completar su ventana abreviada', async () => {
  const f = fixture()
  f.from.play()
  assert.equal(await f.from.scheduleCrossfade(f.to, { durationSeconds: 0.25 }), true)
  f.media[0].advanceTo(9.75)
  await flush()
  assert.ok(f.from.crossfadeGain.gain.events.some(event => event[0] === 'ramp' && event[1] === 0))
  f.media[0].advanceTo(9.96)
  assert.equal(f.events.filter(event => event.status.didJustCrossfade).length, 1)
})

test('EQ de tres bandas y filtro web se automatizan dentro del cruce y se retiran al finalizar', async () => {
  const f = fixture()
  const flat = [{ t: 0, value: 0 }, { t: 1, value: 0 }]
  const eqSettings = {
    version: 1, enabled: true,
    out: { low: [{ t: 0, value: 0 }, { t: 1, value: 12 }], mid: flat, high: flat },
    in: { low: flat, mid: flat, high: [{ t: 0, value: -12 }, { t: 1, value: 0 }] },
  }
  const filterSettings = {
    version: 1, enabled: true,
    out: { kind: 'lowpass', cutoff: [{ t: 0, value: 20000 }, { t: 1, value: 200 }] },
    in: { kind: 'highpass', cutoff: [{ t: 0, value: 2000 }, { t: 1, value: 20 }] },
  }
  f.from.setEqualizer(true, Array(10).fill(0))
  f.from.play()
  assert.equal(await f.from.scheduleCrossfade(f.to, {
    durationSeconds: 2, eqSettings, filterSettings,
  }), true)
  assert.equal(f.from.transitionEqNodes.length, 0)
  f.media[0].advanceTo(8)
  await flush()
  assert.equal(f.from.transitionEqNodes.length, 3)
  assert.equal(f.from.transitionEqNodes[0].type, 'lowshelf')
  assert.equal(f.from.transitionEqNodes[1].type, 'peaking')
  assert.equal(f.from.transitionEqNodes[2].type, 'highshelf')
  assert.equal(f.from.transitionFilterNode.type, 'lowpass')
  assert.equal(f.to.transitionFilterNode.type, 'highpass')
  assert.equal(f.from.equalizerNodes.at(-1).connections.length, 2)
  assert.ok(f.from.transitionEqNodes[0].gain.events.some(event => event[0] === 'ramp' && event[1] === 12))
  assert.ok(f.from.transitionFilterNode.frequency.events.some(event => event[0] === 'ramp' && event[1] === 200))
  assert.ok(f.from.transitionPreamp.gain.events.some(event => event[0] === 'ramp' && event[1] < 1))
  assert.ok(f.from.transitionWet.gain.events.some(event => event[0] === 'ramp' && event[1] === 0))
  f.from.pause()
  assert.ok(f.from.transitionFilterNode.frequency.events.some(event => event[0] === 'hold'))
  f.from.play()
  await flush()
  f.media[0].advanceTo(9.96)
  assert.equal(f.events.filter(event => event.status.didJustCrossfade).length, 1)
  assert.equal(f.from.transitionEqNodes.length, 0)
  assert.equal(f.to.transitionEqNodes.length, 0)
  assert.equal(f.from.equalizerNodes.at(-1).connections[0], f.from.crossfadeGain)
})

test('versiones y curvas de EQ/filtro desconocidas no programan efectos', async () => {
  const f = fixture()
  f.from.play()
  const flat = [{ t: 0, value: 0 }, { t: 1, value: 0 }]
  const eqSettings = { version: 2, enabled: true,
    out: { low: flat, mid: flat, high: flat }, in: { low: flat, mid: flat, high: flat } }
  assert.equal(await f.from.scheduleCrossfade(f.to, { durationSeconds: 2, eqSettings }), false)
  const filterSettings = { version: 1, enabled: true,
    out: { kind: 'lowpass', cutoff: [{ t: 0, value: 0 }, { t: 1, value: 200 }] }, in: null }
  assert.equal(await f.from.scheduleCrossfade(f.to, { durationSeconds: 2, filterSettings }), false)
  assert.equal(f.from.transitionEqNodes.length, 0)
})

test('cancelar un filtro activo libera el efecto con AudioParam y conserva la salida', async () => {
  const f = fixture()
  f.from.play()
  const filterSettings = { version: 1, enabled: true,
    out: { kind: 'lowpass', cutoff: [{ t: 0, value: 20000 }, { t: 1, value: 200 }] }, in: null }
  assert.equal(await f.from.scheduleCrossfade(f.to, { durationSeconds: 2, filterSettings }), true)
  f.media[0].advanceTo(8)
  await flush()
  const dry = f.from.transitionDry.gain
  const wet = f.from.transitionWet.gain
  f.from.cancelCrossfade()
  assert.equal(f.media[0].paused, false)
  assert.ok(dry.events.some(event => event[0] === 'ramp' && event[1] === 1))
  assert.ok(wet.events.some(event => event[0] === 'ramp' && event[1] === 0))
  await new Promise(resolve => setTimeout(resolve, 25))
  assert.equal(f.from.transitionFilterNode, null)
})

test('A→B→A reutiliza el elemento saliente y A vuelve a emitir su fin natural', async () => {
  const f = fixture()
  f.from.play()
  assert.equal(await f.from.scheduleCrossfade(f.to, { durationSeconds: 2 }), true)
  f.media[0].advanceTo(8)
  await flush()
  f.media[0].advanceTo(9.96)
  assert.equal(f.events.filter(event => event.status.didJustCrossfade).length, 1)
  assert.equal(f.from.crossfadedMedia, f.media[0])

  assert.equal(await f.to.scheduleCrossfade(f.from, { durationSeconds: 2 }), true)
  f.media[1].advanceTo(8)
  await flush()
  assert.equal(f.from.crossfadedMedia, null)
  f.media[1].advanceTo(9.96)
  assert.equal(f.events.filter(event => event.status.didJustCrossfade).length, 2)

  f.media[0].finish()
  assert.equal(f.events.filter(event => event.status.didJustFinish).length, 1)
})

test('cue cero arranca al inicio y rechaza un armado tardío', async () => {
  const immediate = fixture()
  immediate.from.play()
  assert.equal(await immediate.from.scheduleCrossfade(immediate.to, {
    durationSeconds: 2, fromStartSeconds: 0,
  }), true)
  await flush()
  assert.equal(immediate.media[1].paused, false)
  assert.ok(immediate.to.crossfadeGain.gain.events.some(event => event[0] === 'ramp'))
  immediate.from.cancelCrossfade()

  const late = fixture()
  late.from.play()
  late.media[0].advanceTo(0.2)
  assert.equal(await late.from.scheduleCrossfade(late.to, {
    durationSeconds: 2, fromStartSeconds: 0,
  }), false)
  assert.equal(late.media[1].paused, true)
})
