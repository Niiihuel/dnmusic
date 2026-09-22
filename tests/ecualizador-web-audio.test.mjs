import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const code = ts.transpileModule(readFileSync('node_modules/expo-audio/src/AudioPlayer.web.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

function fixture(sampleRate = 48000, modern = true) {
  const nodes = [], media = []
  const param = (initial = 0) => ({
    value: initial, events: [],
    ...(modern ? { cancelAndHoldAtTime(time) { this.events.push(['hold', time]) } } : {}),
    cancelScheduledValues(time) { this.events.push(['cancel', time]) },
    setValueAtTime(value, time) { this.events.push(['value', value, time]) },
    setTargetAtTime(value, time, constant) { this.events.push(['target', value, time, constant]) },
  })
  const node = type => {
    const n = { type, edges: [], disconnections: 0, gain: param(type === 'preamp' ? 1 : 0),
      frequency: param(), Q: param(),
      connect(next) { this.edges.push(next); return next },
      disconnect() { this.disconnections++; this.edges = [] },
    }
    nodes.push(n)
    return n
  }
  const ctx = { state: 'running', currentTime: 3, sampleRate, destination: {},
    createMediaElementSource: element => Object.assign(node('source'), { element }),
    createGain: () => node('preamp'), createBiquadFilter: () => node('filter'),
    createAnalyser: () => Object.assign(node('analyser'), { frequencyBinCount: 1024 }),
  }
  class Audio {
    constructor(src) { this.src = src; this.paused = true; media.push(this) }
    pause() {}
    load() {}
    removeAttribute() {}
  }
  const api = {}
  vm.runInNewContext(code + '\nexports.headroom = equalizerHeadroom;', {
    exports: api, Audio, expo: { SharedObject: class { emit() {} } },
    URL, window: { location: { origin: 'https://test.local' } },
    require(id) {
      if (id === './AudioUtils.web') return { nextId: () => 'test', getSourceUri: src => src?.uri,
        preloadCache: new Map(), getAudioContext: () => ctx }
      if (id === './AudioModule.web') return { isAudioActive: true }
      if (id === './AudioEventKeys') return {}
      if (id === './MediaSessionController.web') return { mediaSessionController: { clear() {}, getActiveState() { return null } } }
      throw Error(id)
    },
  })
  return { api, nodes, media, player: new api.AudioPlayerWeb({ uri: 'https://test.local/song' }), ctx }
}

test('headroom compensa bandas superpuestas y nunca amplifica curvas planas o recortes', () => {
  const { api } = fixture()
  for (const sampleRate of [8000, 22050, 44100, 48000, 96000]) {
    assert.equal(api.headroom(Array(10).fill(0), sampleRate), 1)
    assert.equal(api.headroom(Array(10).fill(-12), sampleRate), 1)
    const single = [0, 0, 0, 0, 0, 6, 0, 0, 0, 0]
    const gain = api.headroom(single, sampleRate)
    assert.ok(Math.abs(20 * Math.log10(gain) + 7) < 0.05, `6 dB + 1 dB margen a ${sampleRate}`)
    const combined = api.headroom(Array(10).fill(12), sampleRate)
    assert.ok(Number.isFinite(combined) && combined > 0 && combined < 10 ** (-13 / 20))
  }
})

test('instala preamp antes de filtros una vez y automatiza sin reconectar por movimiento o bypass', () => {
  const f = fixture()
  f.player.setEqualizer(true, Array(10).fill(6))
  const source = f.nodes.find(n => n.type === 'source')
  const preamp = f.nodes.find(n => n.type === 'preamp')
  const filters = f.nodes.filter(n => n.type === 'peaking')
  assert.equal(filters.length, 10)
  assert.equal(source.edges[0], preamp)
  assert.equal(preamp.edges[0], filters[0])
  assert.equal(filters.at(-1).edges[0], f.ctx.destination)
  const disconnects = f.nodes.map(n => n.disconnections)
  f.player.setEqualizer(true, Array(10).fill(12))
  assert.deepEqual(f.nodes.map(n => n.disconnections), disconnects)
  assert.ok(preamp.gain.events.at(-1)[1] < 1)
  assert.equal(preamp.gain.events.at(-1)[3], 0.008)
  f.player.setEqualizer(false, Array(10).fill(12))
  assert.deepEqual(f.nodes.map(n => n.disconnections), disconnects)
  assert.deepEqual(preamp.gain.events.at(-1), ['target', 1, 3, 0.12])
  filters.forEach(n => assert.deepEqual(n.gain.events.at(-1), ['target', 0, 3, 0.03]))
  assert.equal(f.nodes.length, 12)
})

test('sampling mantiene preamp y filtros; replace libera el grafo y conecta el elemento nuevo', () => {
  const f = fixture()
  f.player.setEqualizer(true, Array(10).fill(4))
  const oldNodes = [...f.nodes]
  f.player.setAudioSamplingEnabled(true)
  const analyser = f.nodes.find(n => n.type === 'analyser')
  assert.equal(oldNodes.at(-1).edges[0], analyser)
  f.player.setAudioSamplingEnabled(false)
  assert.equal(oldNodes.at(-1).edges[0], f.ctx.destination)
  f.player.replace({ uri: 'https://test.local/new' })
  assert.ok(oldNodes.every(n => n.edges.length === 0))
  const newSource = f.nodes.filter(n => n.type === 'source').at(-1)
  assert.equal(newSource.element, f.media[1])
  assert.equal(newSource.edges[0].type, 'preamp')
  f.player.remove()
  assert.ok(f.nodes.every(n => n.edges.length === 0))
})

test('fallback AudioParam preserva valor actual y frecuencias quedan debajo de Nyquist', () => {
  const f = fixture(22050, false)
  f.player.setEqualizer(true, Array(10).fill(12))
  const preamp = f.nodes.find(n => n.type === 'preamp')
  assert.deepEqual(preamp.gain.events.slice(0, 2), [['cancel', 3], ['value', 1, 3]])
  assert.ok(f.nodes.filter(n => n.type === 'peaking').every(n => n.frequency.value < 11025))
})
