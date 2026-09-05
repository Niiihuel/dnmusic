const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { runInNewContext } = require('node:vm')
const { EventEmitter } = require('node:events')

function entorno() {
  const updater = new EventEmitter()
  const llamadas = { buscar: 0, descargar: 0, instalar: 0 }
  updater.checkForUpdates = async () => { llamadas.buscar++ }
  updater.downloadUpdate = async () => { llamadas.descargar++ }
  updater.quitAndInstall = () => { llamadas.instalar++ }
  const timers = new Set()
  const modulo = { exports: {} }
  runInNewContext(readFileSync(require.resolve('../dist/actualizador.js'), 'utf8'), {
    exports: modulo.exports,
    require: (nombre) => nombre === 'electron'
      ? { app: { isPackaged: true, getVersion: () => '1.9.0' }, BrowserWindow: { getAllWindows: () => [] } }
      : { autoUpdater: updater },
    process: { platform: 'linux', env: { APPIMAGE: '/tmp/app.AppImage' } },
    console: { log() {} },
    setTimeout: (fn) => { timers.add(fn); return fn },
    clearTimeout: (fn) => timers.delete(fn),
    setInterval() {},
  })
  const api = modulo.exports
  api.arrancarActualizador()
  timers.clear()
  return { api, updater, llamadas, timers }
}
const info = { version: '1.9.1', releaseNotes: '## Más a tu manera\n- Ajustes renovados\n_4 de septiembre de 2026_' }

test('no pierde la actualización lista al buscar de nuevo o volver a sonar audio', async () => {
  const { api, updater, llamadas } = entorno()
  await api.buscarAhora(true)
  updater.emit('update-available', info)
  updater.emit('update-downloaded', info)
  await api.buscarAhora(true)
  await api.buscarAhora()
  api.marcarSonando(true)
  assert.equal(api.estadoActual().fase, 'lista')
  assert.equal(llamadas.buscar, 1)
  assert.equal(llamadas.descargar, 1)
  assert.equal(api.instalarYReabrir(), true)
  assert.equal(api.instalarYReabrir(), false)
  assert.equal(llamadas.instalar, 1)
})

test('espera a que se pause la música, salvo descarga explícita, sin duplicarla', async () => {
  const { api, updater, llamadas } = entorno()
  api.marcarSonando(true)
  await api.buscarAhora(true)
  updater.emit('update-available', info)
  assert.equal(llamadas.descargar, 0)
  assert.equal(api.estadoActual().fase, 'esperando-silencio')
  await api.buscarAhora(true)
  assert.equal(llamadas.buscar, 1)
  api.descargarAhora()
  assert.equal(api.estadoActual().fase, 'bajando')
  api.descargarAhora()
  await api.buscarAhora(true)
  assert.equal(llamadas.descargar, 1)
  assert.equal(llamadas.buscar, 1)
})

test('la pausa breve no descarga; el silencio sostenido sí', () => {
  const { api, updater, llamadas, timers } = entorno()
  api.marcarSonando(true)
  updater.emit('update-available', info)
  api.marcarSonando(false)
  assert.equal(timers.size, 1)
  api.marcarSonando(true)
  assert.equal(timers.size, 0)
  assert.equal(llamadas.descargar, 0)
  api.marcarSonando(false)
  for (const fn of [...timers]) fn()
  assert.equal(llamadas.descargar, 1)
  assert.equal(api.estadoActual().fase, 'bajando')
})

test('un fallo de búsqueda automática no deja el estado bloqueado en buscando', async () => {
  const { api, updater, llamadas } = entorno()
  updater.checkForUpdates = async () => { throw new Error('offline') }
  await api.buscarAhora()
  assert.equal(api.estadoActual().fase, 'error')
  updater.checkForUpdates = async () => { llamadas.buscar++; updater.emit('update-not-available') }
  await api.buscarAhora(true)
  assert.equal(llamadas.buscar, 1)
  assert.equal(api.estadoActual().fase, 'sin-novedad')
})

test('buscar dos veces mientras responde el servidor hace una sola petición', async () => {
  const { api, llamadas } = entorno()
  await Promise.all([api.buscarAhora(true), api.buscarAhora(true)])
  assert.equal(llamadas.buscar, 1)
})
