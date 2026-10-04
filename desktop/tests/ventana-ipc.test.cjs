const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { registrarVentana } = require('../dist/ventana-ipc')
function fixture() {
  const handlers = new Map(), enviados = [], acciones = []
  const ipc = { handle: (name, fn) => handlers.set(name, fn), removeHandler: name => handlers.delete(name) }
  const contents = { isDestroyed: () => false, mainFrame: { url: 'app://dnmusic/' }, send: (...args) => enviados.push(args) }
  const win = Object.assign(new EventEmitter(), {
    webContents: contents, isDestroyed: () => false, maximizada: false, completa: false,
    isMaximized() { return this.maximizada }, isFullScreen() { return this.completa },
    minimize() { acciones.push('minimizar') }, close() { acciones.push('cerrar') },
    maximize() { this.maximizada = true; this.emit('maximize') },
    unmaximize() { this.maximizada = false; this.emit('unmaximize') },
  })
  registrarVentana(ipc, win)
  const event = { sender: contents, senderFrame: contents.mainFrame }
  return { win, handlers, enviados, acciones, event, call: (name, ...args) => handlers.get('ventana:'+name)(event, ...args) }
}
test('controles minimizan, alternan maximizar/restaurar y cierran por la vía normal', () => {
  const f = fixture()
  assert.deepEqual(f.call('estado'), { maximizada: false, pantallaCompleta: false })
  f.call('accion', 'minimizar')
  f.call('accion', 'maximizar'); assert.equal(f.call('estado').maximizada, true)
  f.call('accion', 'maximizar'); assert.equal(f.call('estado').maximizada, false)
  f.call('accion', 'cerrar')
  assert.deepEqual(f.acciones, ['minimizar', 'cerrar'])
  assert.equal(f.enviados.length, 2)
  assert.throws(() => f.call('accion', 'ejecutar'), /Acción/)
})
test('rechaza iframes, ventanas ajenas, orígenes externos y la ventana destruida', () => {
  const f = fixture()
  for (const event of [{ ...f.event, sender: {} }, { ...f.event, senderFrame: { url: 'app://dnmusic/' } }]) {
    for (const name of ['estado', 'accion']) assert.throws(() => f.handlers.get('ventana:'+name)(event, 'cerrar'), /Emisor/)
  }
  for (const url of ['https://dnmusic/', 'app://dnmusic.evil/', 'app://dnmusic:123/', 'app://user@dnmusic/']) {
    f.event.senderFrame.url = url
    assert.throws(() => f.call('accion', 'cerrar'), /Emisor/)
  }
  f.event.senderFrame.url = 'app://dnmusic/'
  f.event.sender.isDestroyed = () => true
  assert.throws(() => f.call('estado'), /Emisor/)
  assert.deepEqual(f.acciones, [])
})
test('cambios del sistema actualizan los controles y cerrar libera handlers y suscripciones', () => {
  const f = fixture()
  f.win.completa = true; f.win.emit('enter-full-screen')
  assert.deepEqual(f.enviados.at(-1), ['ventana:cambio', { maximizada: false, pantallaCompleta: true }])
  f.win.completa = false; f.win.emit('leave-full-screen')
  assert.equal(f.enviados.at(-1)[1].pantallaCompleta, false)
  f.win.emit('closed')
  assert.equal(f.handlers.size, 0)
  for (const name of ['maximize','unmaximize','enter-full-screen','leave-full-screen']) assert.equal(f.win.listenerCount(name), 0)
})

test('preload activa controles propios sólo en Linux y no filtra eventos privilegiados', async () => {
  const { readFileSync } = require('node:fs'), { runInNewContext } = require('node:vm')
  for (const platform of ['linux', 'win32', 'darwin']) {
    let bridge
    const ipc = new EventEmitter(), calls = [], estados = []
    ipc.invoke = async (...args) => { calls.push(args); return {} }
    runInNewContext(readFileSync(require.resolve('../dist/preload'), 'utf8'), {
      process: { platform }, exports: {}, require: name => {
        assert.equal(name, 'electron')
        return { contextBridge: { exposeInMainWorld: (_, value) => { bridge = value } }, ipcRenderer: ipc }
      },
    })
    assert.equal(bridge.ventana.controlesPropios, platform === 'linux')
    const off = bridge.ventana.alCambiar(value => estados.push(value))
    const estado = { maximizada: true, pantallaCompleta: false }
    ipc.emit('ventana:cambio', { sender: 'privilegiado' }, estado)
    assert.deepEqual(estados, [estado])
    off(); assert.equal(ipc.listenerCount('ventana:cambio'), 0)
    await bridge.ventana.estado(); await bridge.ventana.accion('minimizar')
    assert.deepEqual(calls, [['ventana:estado'], ['ventana:accion', 'minimizar']])
  }
})
