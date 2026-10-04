import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

test('Railway envía el análisis musical al API y reserva la SPA para páginas', async t => {
  const dist = await mkdtemp(join(tmpdir(), 'dnmusic-railway-test-'))
  const shell = '<!doctype html><title>Shell de prueba</title>'
  await writeFile(join(dist, 'index.html'), shell)

  const proceso = spawn(process.execPath, ['--import', 'tsx', 'scripts/serve-railway.ts'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: '0',
      WEB_DIST_DIR: dist,
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  t.after(async () => {
    if (proceso.exitCode === null && proceso.signalCode === null) {
      const cerrado = new Promise(resolve => proceso.once('exit', resolve))
      proceso.kill('SIGTERM')
      await cerrado
    }
    await rm(dist, { recursive: true, force: true })
  })

  let salida = ''
  let errores = ''
  proceso.stderr.on('data', chunk => { errores += chunk })
  const puerto = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Railway no inició: ${errores}`)), 20_000)
    proceso.stdout.on('data', chunk => {
      salida += chunk
      const match = salida.match(/web \+ api escuchando en :(\d+)/)
      if (match) {
        clearTimeout(timeout)
        resolve(Number(match[1]))
      }
    })
    proceso.once('error', error => { clearTimeout(timeout); reject(error) })
    proceso.once('exit', code => {
      clearTimeout(timeout)
      reject(new Error(`Railway terminó (${code}): ${errores}`))
    })
  })

  const base = `http://127.0.0.1:${puerto}`
  for (const ruta of ['/analysis?audioPath=demo.m4a', '/peaks?audioPath=demo.m4a']) {
    const respuesta = await fetch(`${base}${ruta}`)
    assert.equal(respuesta.status, 401, ruta)
    assert.match(respuesta.headers.get('content-type') ?? '', /application\/json/, ruta)
    assert.deepEqual(await respuesta.json(), { error: 'No autorizado' }, ruta)
  }

  const preflight = await fetch(`${base}/analysis`, { method: 'OPTIONS' })
  assert.equal(preflight.status, 204)

  const pagina = await fetch(`${base}/lista/mix`)
  assert.equal(pagina.status, 200)
  assert.match(pagina.headers.get('content-type') ?? '', /text\/html/)
  assert.equal(await pagina.text(), shell)
})
