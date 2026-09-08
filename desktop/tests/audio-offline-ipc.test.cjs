const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { runInNewContext } = require('node:vm')
const { EventEmitter } = require('node:events')
const { registrarAudioOffline, emisorAudioValido } = require('../dist/audio-offline-ipc.js')

function emitter() {
  const sent = []
  const frame = { url: 'app://dnmusic/profile', send: (...p) => sent.push(p) }
  const contents = { mainFrame: frame, isDestroyed: () => false }
  return { contents, frame, sent, event: { sender: contents, senderFrame: frame } }
}
test('IPC sólo acepta mainFrame de la ventana propia y progreso no cruza una navegación externa', async () => {
  const f = emitter(), handlers = {}, calls = []
  const disk = {
    listar: async () => [], cancelar: async key => calls.push(['cancelar', key]), quitar: async key => calls.push(['quitar', key]),
    descargar: async (pedido, fn) => {
      calls.push(['descargar', pedido]); fn({ key: pedido.key, bytesWritten: 1, totalBytes: 2 })
      f.frame.url = 'https://outside.test/'
      fn({ key: pedido.key, bytesWritten: 2, totalBytes: 2 })
      return { key: pedido.key, bytes: 2, uri: 'app://dnmusic/_audio/test.m4a' }
    },
  }
  registrarAudioOffline({ handle: (channel, fn) => { handlers[channel] = fn } }, disk, () => f.contents)
  for (const event of [{ sender: {}, senderFrame: f.frame }, { sender: f.contents, senderFrame: { url: f.frame.url } }, { sender: f.contents, senderFrame: null }]) {
    for (const fn of Object.values(handlers)) assert.throws(() => fn(event, 'key'), /Emisor/)
  }
  for (const url of ['app://dnmusic.evil/', 'https://dnmusic/', 'app://dnmusic:8080/', 'file:///private', 'http://127.0.0.1:8081']) {
    f.frame.url = url; assert.equal(emisorAudioValido(f.event, f.contents), false)
  }
  f.frame.url = 'app://dnmusic/'
  assert.deepEqual(await handlers['audioOffline:listar'](f.event), [])
  await handlers['audioOffline:cancelar'](f.event, 'key')
  await handlers['audioOffline:quitar'](f.event, 'key')
  const result = await handlers['audioOffline:descargar'](f.event, { key: 'key', url: 'signed' })
  assert.equal(result.bytes, 2)
  assert.equal(f.sent.length, 1)
  assert.equal(f.sent[0][0], 'audioOffline:progreso')
  assert.equal(calls.length, 3)
})

test('preload expone el contrato exacto, desacopla eventos Electron y desuscribe progreso', async () => {
  const ipc = new EventEmitter(), calls = []
  ipc.invoke = async (...p) => { calls.push(p); return [] }
  let bridge
  const exports = {}
  runInNewContext(readFileSync(require.resolve('../dist/preload.js'), 'utf8'), { exports, require: id => {
    assert.equal(id, 'electron', 'el preload sandbox no carga módulos Node de disco')
    return { contextBridge: { exposeInMainWorld: (name, api) => { assert.equal(name, 'dnmusicEscritorio'); bridge = api } }, ipcRenderer: ipc }
  } })
  assert.deepEqual(Object.keys(bridge.audioOffline), ['listar', 'descargar', 'cancelar', 'quitar', 'alProgreso'])
  const audio = bridge.audioOffline, avances = []
  const off = audio.alProgreso(p => avances.push(p))
  const progreso = { key: 'key', bytesWritten: 4, totalBytes: 8 }
  ipc.emit('audioOffline:progreso', { privileged: true }, progreso)
  off(); off()
  ipc.emit('audioOffline:progreso', {}, progreso)
  assert.deepEqual(avances, [progreso])
  assert.equal(ipc.listenerCount('audioOffline:progreso'), 0)
  await audio.listar(); await audio.descargar({ key: 'key', url: 'signed' }); await audio.cancelar('key'); await audio.quitar('key')
  assert.deepEqual(calls.map(c => c[0]), ['audioOffline:listar', 'audioOffline:descargar', 'audioOffline:cancelar', 'audioOffline:quitar'])
  assert.ok(bridge.descargas.guardarLista, 'las exportaciones mantienen su API separada')
})

test('protocolo enruta audio antes del fallback SPA y rechaza otros hosts', async () => {
  let handle
  const called = []
  const exports = {}
  runInNewContext(readFileSync(require.resolve('../dist/protocolo.js'), 'utf8'), { exports, URL, Response, Headers, process, __dirname: __dirname, require: id => id === 'electron'
    ? { app: {}, protocol: { handle: (_, fn) => { handle = fn } }, net: { fetch: () => assert.fail('Audio no se resuelve como archivo web') } }
    : require(id) })
  exports.servirWeb('/nonexistent/web', async req => { called.push(req.url); return new Response(null, { status: 206 }) })
  const uri = 'app://dnmusic/_audio/' + 'a'.repeat(64) + '.m4a'
  assert.equal((await handle(new Request(uri))).status, 206)
  assert.equal((await handle(new Request(uri.replace('dnmusic/', 'evil/')))).status, 404)
  assert.deepEqual(called, [uri])
  exports.servirWeb('/nonexistent/web')
  assert.equal((await handle(new Request(uri))).status, 404)
})
