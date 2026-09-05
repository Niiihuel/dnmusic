const { test } = require('node:test')
const assert = require('node:assert/strict')
const { fork } = require('node:child_process')
const { join } = require('node:path')

function ejecutar(t, videos) {
  const hijo = fork(join(__dirname, '../dist/resolutor-hijo.js'), [], {
    execArgv: ['--require', join(__dirname, 'fixtures/resolutor.cjs')],
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  })
  t.after(() => hijo.kill())
  const eventos = [], respuestas = []
  let stderr = ''
  hijo.stderr.on('data', data => { stderr += data })
  return new Promise((resolve, reject) => {
    hijo.on('error', reject)
    hijo.on('exit', code => { if (respuestas.length < videos.length) reject(new Error(`Hijo salió ${code}: ${stderr}`)) })
    hijo.on('message', m => {
      if (m.tipo === 'potoken') {
        eventos.push('token:' + m.binding)
        hijo.send({ tipo: 'potoken', id: m.id, token: 'token-de-prueba' })
      } else if (m.fixture) eventos.push(m.fixture + ':' + m.videoId)
      else {
        respuestas.push(m)
        if (respuestas.length === videos.length) resolve({ eventos, respuestas })
      }
    })
    videos.forEach((videoId, index) => hijo.send({ id: index + 1, opciones: {
      videoId, apiBase: 'https://example.test', token: 'credencial-de-prueba',
    } }))
  })
}

test('el hijo comparte duplicados, serializa descargas e intercambia tokens por IPC', { timeout: 5000 }, async t => {
  const { eventos, respuestas } = await ejecutar(t, ['video000001', 'video000001', 'video000002'])
  assert.deepEqual(eventos, [
    'inicio:video000001', 'token:video000001', 'fin:video000001',
    'inicio:video000002', 'token:video000002', 'fin:video000002',
  ])
  assert.equal(respuestas.filter(m => m.ok).length, 3)
  assert.deepEqual(respuestas.find(m => m.id === 1).aporte, respuestas.find(m => m.id === 2).aporte)
})

test('un 403 pausa también las canciones que estaban en cola', { timeout: 5000 }, async t => {
  const { eventos, respuestas } = await ejecutar(t, ['denied00000', 'video000002'])
  assert.deepEqual(eventos, ['inicio:denied00000'])
  assert.match(respuestas.find(m => m.id === 1).error, /403/)
  assert.match(respuestas.find(m => m.id === 2).error, /pausó las descargas/)
})
