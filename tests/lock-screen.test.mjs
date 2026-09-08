import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = ts.transpileModule(readFileSync('src/state/lockScreen.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

function montar() {
  const hooks = [], effects = [], publicaciones = [], remotos = []
  let cursor = 0
  const react = {
    useRef(value) {
      const i = cursor++
      return hooks[i] ?? (hooks[i] = { current: value })
    },
    useEffect(fn, deps) {
      const i = cursor++, prev = hooks[i]
      if (!prev || deps.some((d, j) => !Object.is(d, prev.deps[j]))) {
        effects.push(() => {
          prev?.cleanup?.()
          hooks[i] = { deps, cleanup: fn() }
        })
      }
    },
  }
  const player = { setActiveForLockScreen(...args) { publicaciones.push(args) } }
  const remote = {
    start() { remotos.push('start') }, stop() { remotos.push('stop') },
    addListener(name) { remotos.push(name); return { remove() { remotos.push('remove:' + name) } } },
  }
  const deps = {
    react,
    'react-native': { Platform: { OS: 'ios' } },
    'expo-audio': {},
    '../../modules/remote-commands': { RemoteCommands: remote },
    './playback': { pausePlayback() {}, playNext() {}, playPrevious() {}, resumePlayback() {}, seekToMs() {}, stopPlayback() {} },
  }
  const api = {}
  new Function('exports', 'require', source)(api, id => { assert.ok(id in deps, id); return deps[id] })
  const base = { title: 'K.', artist: 'Cigarettes After Sex', collection: 'Mi música', artworkUrl: 'https://img.test/k.jpg' }
  return {
    publicaciones, remotos,
    render(activa, patch = {}) {
      cursor = 0
      api.useLockScreen(player, { ...base, ...patch }, activa)
      effects.splice(0).forEach(run => run())
    },
  }
}

test('volver al frente republica Control Center sin desmontar ni reproducir', () => {
  const h = montar()
  h.render(true)
  assert.equal(h.publicaciones.length, 1)
  assert.equal(h.publicaciones[0][0], true)
  assert.deepEqual(h.publicaciones[0][2], { isLiveStream: false, showSeekForward: false, showSeekBackward: false })

  h.render(false)
  assert.equal(h.publicaciones.length, 1)
  assert.ok(!h.remotos.includes('stop'))

  h.render(true)
  assert.equal(h.publicaciones.length, 2)
  assert.equal(h.publicaciones[1][1].title, 'K.')
  assert.ok(h.remotos.filter(v => v === 'start').length >= 2)
})

test('cambiar canción reemplaza la ficha y limpia los comandos anteriores', () => {
  const h = montar()
  h.render(true)
  h.render(true, { title: 'Cry' })
  assert.equal(h.publicaciones.filter(p => p[0] === false).length, 1)
  assert.equal(h.publicaciones.at(-1)[1].title, 'Cry')
  assert.ok(h.remotos.includes('stop'))
})
