const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { runInNewContext } = require('node:vm')
const { registrarPortapapeles } = require('../dist/portapapeles-ipc')

function escenario(writeText = () => {}) {
  const handlers = {}, escritos = []
  const frame = { url: 'app://dnmusic/lista/abc' }
  const contents = { mainFrame: frame, isDestroyed: () => false }
  const evento = { sender: contents, senderFrame: frame }
  registrarPortapapeles({ handle: (canal, fn) => { handlers[canal] = fn } }, {
    writeText: (...args) => { escritos.push(args); return writeText(...args) },
  }, () => contents)
  return { copiar: handlers['portapapeles:copiar'], escritos, frame, contents, evento }
}

test('copia al portapapeles común y espera la escritura nativa antes de devolver éxito', async () => {
  let completar
  const h = escenario(() => new Promise(resolve => { completar = resolve }))
  let terminada = false
  const pendiente = h.copiar(h.evento, 'https://dnmusic.test/lista/abc?colaborar=1').then(ok => { terminada = true; return ok })
  await Promise.resolve()
  assert.equal(terminada, false)
  assert.deepEqual(h.escritos, [['https://dnmusic.test/lista/abc?colaborar=1']], 'sin selection de Linux')
  completar()
  assert.equal(await pendiente, true)
})

test('errores del sistema y datos ajenos a texto nunca devuelven éxito', async () => {
  const h = escenario(() => { throw Error('portapapeles ocupado') })
  await assert.rejects(h.copiar(h.evento, 'link'), /ocupado/)
  for (const texto of [null, undefined, 42, {}, ['link']]) {
    await assert.rejects(h.copiar(h.evento, texto), /requiere texto/)
  }
  assert.equal(h.escritos.length, 1)
})

test('rechaza ventanas, subframes y orígenes externos sin tocar el portapapeles', async () => {
  const h = escenario()
  for (const evento of [
    { sender: {}, senderFrame: h.frame },
    { sender: h.contents, senderFrame: { url: h.frame.url } },
    { sender: h.contents, senderFrame: null },
  ]) await assert.rejects(h.copiar(evento, 'link'), /Emisor/)
  for (const url of ['app://dnmusic.evil/', 'https://dnmusic/', 'app://dnmusic:80/', 'app://user@dnmusic/', 'file:///tmp/app', 'inválido']) {
    h.frame.url = url
    await assert.rejects(h.copiar(h.evento, 'link'), /Emisor/, url)
  }
  h.frame.url = 'app://dnmusic/'
  h.contents.isDestroyed = () => true
  await assert.rejects(h.copiar(h.evento, 'link'), /Emisor/)
  assert.deepEqual(h.escritos, [])
})

test('preload expone sólo copiar texto en Linux y Windows y mantiene los resultados de IPC', async () => {
  for (const platform of ['linux', 'win32']) {
    let bridge
    const llamadas = []
    runInNewContext(readFileSync(require.resolve('../dist/preload.js'), 'utf8'), {
      process: { platform }, exports: {}, require(id) {
        assert.equal(id, 'electron')
        return {
          contextBridge: { exposeInMainWorld(nombre, api) { assert.equal(nombre, 'dnmusicEscritorio'); bridge = api } },
          ipcRenderer: { async invoke(...args) { llamadas.push(args); return true } },
        }
      },
    })
    assert.deepEqual(Object.keys(bridge.portapapeles), ['copiar'])
    assert.equal(await bridge.portapapeles.copiar('enlace'), true)
    assert.deepEqual(llamadas, [['portapapeles:copiar', 'enlace']])
  }
})
