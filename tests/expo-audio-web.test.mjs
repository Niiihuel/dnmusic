import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const compile = name => ts.transpileModule(readFileSync(`node_modules/expo-audio/src/${name}.ts`, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const playerCode = compile('AudioPlayer.web')
const utilsCode = compile('AudioUtils.web')

// Executes the installed SDK player and status implementation. Only the DOM,
// Expo event transport and MediaSession side effects are replaced by fakes.
function fixture() {
  const media = [], events = [], session = []
  class Audio {
    constructor(src) {
      this.src = src; this.currentTime = 0; this.duration = 10
      this.paused = true; this.ended = false; this.readyState = 4
      this.playbackRate = 1; this.muted = false; this.loop = false
      media.push(this)
    }
    play() { this.paused = false; this.ended = false; this.onplay?.(); return Promise.resolve() }
    pause() { this.paused = true; this.onpause?.() }
    removeAttribute() {}
    load() {}
    finish() { this.currentTime = this.duration; this.ended = true; this.paused = true; this.onended?.() }
  }
  class SharedObject { emit(name, status) { events.push({ name, status }) } }
  const utils = {}
  vm.runInNewContext(utilsCode, { exports: utils, require: () => ({ Asset: {} }) })
  const api = {}
  const mediaSessionController = {
    updatePlaybackState(player) { session.push({ kind: 'playback', playing: player.playing }) },
    updatePositionState(player) { session.push({ kind: 'position', currentTime: player.currentTime }) },
    clear() {},
  }
  vm.runInNewContext(playerCode, {
    exports: api, Audio, expo: { SharedObject },
    requestAnimationFrame() { assert.fail('No debe depender de frames de animación para finalizar') },
    require(id) {
      if (id === './AudioUtils.web') return utils
      if (id === './AudioEventKeys') return { PLAYBACK_STATUS_UPDATE: 'playbackStatusUpdate', AUDIO_SAMPLE_UPDATE: 'audioSampleUpdate' }
      if (id === './AudioModule.web') return { isAudioActive: true }
      if (id === './MediaSessionController.web') return { mediaSessionController }
      assert.fail(`Import inesperado: ${id}`)
    },
  })
  const player = new api.AudioPlayerWeb({ uri: 'https://example.test/audio' }, { updateInterval: 500 })
  return { player, media: media[0], events, session }
}

test('ended entrega fin y playing=false sin timeupdate ni frames y mantiene MediaSession', () => {
  const f = fixture()
  f.player.play(); f.events.length = 0; f.session.length = 0
  assert.equal(f.player.playing, true)
  f.media.finish()
  assert.equal(f.events.length, 1)
  assert.equal(f.events[0].name, 'playbackStatusUpdate')
  assert.equal(f.events[0].status.didJustFinish, true)
  assert.equal(f.events[0].status.playing, false)
  assert.equal(f.events[0].status.currentTime, 10)
  assert.equal(f.events[0].status.id, f.player.id)
  assert.equal(f.player.playing, false)
  assert.deepEqual(f.session, [{ kind: 'playback', playing: false }])
})

test('una pausa normal no finaliza; ended sigue llegando si el navegador pausó antes', () => {
  const f = fixture()
  f.player.play(); f.media.currentTime = 4; f.player.pause()
  assert.equal(f.events.at(-1).status.didJustFinish, false)
  assert.equal(f.events.at(-1).status.playing, false)
  f.media.finish()
  assert.equal(f.events.at(-1).status.didJustFinish, true)
  assert.equal(f.player.playing, false)
})

test('timeupdate final y ended pueden notificar el mismo fin: consumidor debe deduplicar por reproducción', () => {
  const f = fixture()
  f.player.play(); f.events.length = 0
  f.media.currentTime = 10; f.media.ended = true; f.media.paused = true
  f.media.ontimeupdate()
  f.media.onended()
  const finishes = f.events.filter(event => event.status.didJustFinish)
  assert.equal(finishes.length, 2)
  assert.equal(finishes[0].status.id, finishes[1].status.id)
  assert.ok(finishes.every(event => event.status.playing === false))
  assert.equal(f.player.playing, false)
})

test('volver a reproducir permite otro fin y liberar quita el handler anterior', () => {
  const f = fixture()
  f.player.play(); f.media.finish()
  f.media.currentTime = 0; f.player.play(); f.events.length = 0
  assert.equal(f.player.playing, true)
  assert.equal(f.events.length, 0)
  f.media.finish()
  assert.equal(f.events.filter(event => event.status.didJustFinish).length, 1)
  f.player.release()
  const afterRelease = f.events.length
  f.media.finish()
  assert.equal(f.events.length, afterRelease)
  assert.equal(f.media.onended, null)
})
