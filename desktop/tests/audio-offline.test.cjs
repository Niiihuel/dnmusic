const { test } = require('node:test')
const assert = require('node:assert/strict')
const { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink } = require('node:fs/promises')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { createHash } = require('node:crypto')
const { DiscoAudioOffline, validarUrlAudio } = require('../dist/audio-offline.js')
const { origenAudioConfigurado } = require('../dist/audio-offline-origen.js')
const ORIGEN = 'https://test-project.supabase.co'
const key = 'folder/音楽 %/track.m4a'
const signed = (key = 'song.m4a', origin = ORIGEN) => `${origin}/storage/v1/object/sign/songs/${key.split('/').map(encodeURIComponent).join('/')}?token=local-test-only`
const hash = key => createHash('sha256').update(key).digest('hex')
const body = () => new Response(Buffer.from('0123456789'), { headers: { 'content-type': 'audio/mp4', 'content-length': '10' } })
async function fixture(t, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'dn-offline-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const config = { origen: ORIGEN, fetch: async () => body(), espacioLibre: async () => 1024 ** 3, ...options }
  const folder = join(dir, 'audio-offline')
  return { dir, folder, config, disk: new DiscoAudioOffline(folder, config) }
}

test('descarga en stream, deduplica, publica commit y lista tras reiniciar sin URL firmada persistida', async t => {
  let fetches = 0
  const progress = []
  const f = await fixture(t, { fetch: async (url, init) => {
    fetches++
    assert.equal(url, signed(key)); assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit')
    return body()
  } })
  const a = f.disk.descargar({ key, url: signed(key) }, p => progress.push(p))
  const b = f.disk.descargar({ key, url: signed(key) })
  assert.equal(a, b)
  const result = await a
  assert.deepEqual(result, { key, uri: `app://dnmusic/_audio/${hash(key)}.m4a`, bytes: 10 })
  assert.equal(fetches, 1)
  assert.deepEqual(progress.at(-1), { key, bytesWritten: 10, totalBytes: 10 })
  assert.deepEqual(await f.disk.listar(), [result])
  assert.equal(await readFile(join(f.folder, `${hash(key)}.m4a`), 'utf8'), '0123456789')
  assert.doesNotMatch(await readFile(join(f.folder, `${hash(key)}.json`), 'utf8'), /token|https/)
  assert.equal((await readdir(f.folder)).some(n => n.endsWith('.part')), false)
  const again = new DiscoAudioOffline(f.folder, f.config)
  assert.deepEqual(await again.listar(), [result])
  await again.descargar({ key, url: signed(key) })
  assert.equal(fetches, 1)
})

test('Range/HEAD sirven bytes exactos y sólo archivos completados de la ruta cerrada', async t => {
  const f = await fixture(t), result = await f.disk.descargar({ key, url: signed(key) })
  for (const [range, status, expected, contentRange] of [
    [null, 200, '0123456789', null], ['bytes=2-5', 206, '2345', 'bytes 2-5/10'],
    ['bytes=7-', 206, '789', 'bytes 7-9/10'], ['bytes=-3', 206, '789', 'bytes 7-9/10'],
    ['bytes=8-99', 206, '89', 'bytes 8-9/10'],
  ]) {
    const response = await f.disk.servir(new Request(result.uri, { headers: range ? { Range: range } : {} }))
    assert.equal(response.status, status); assert.equal(response.headers.get('content-range'), contentRange)
    assert.equal(response.headers.get('content-length'), String(expected.length))
    assert.equal(response.headers.get('accept-ranges'), 'bytes')
    assert.equal(await response.text(), expected)
  }
  for (const range of ['bytes=99-', 'bytes=5-2', 'bytes=-0', 'bytes=0-1,4-5', 'bytes=-999999999999999999999', 'not-range']) {
    const response = await f.disk.servir(new Request(result.uri, { headers: { Range: range } }))
    assert.equal(response.status, 416); assert.equal(response.headers.get('content-range'), 'bytes */10')
  }
  const head = await f.disk.servir(new Request(result.uri, { method: 'HEAD' }))
  assert.equal(head.status, 200); assert.equal(head.headers.get('content-length'), '10'); assert.equal(await head.text(), '')
  for (const url of ['app://other/_audio/' + hash(key) + '.m4a', 'app://dnmusic/_audio/%2e%2e%2Fprivate', 'app://dnmusic/_audio/' + hash(key) + '.json', 'app://dnmusic/_audio/' + '0'.repeat(64) + '.m4a']) {
    assert.equal((await f.disk.servir(new Request(url))).status, 404)
  }
  assert.equal((await f.disk.servir(new Request(result.uri, { method: 'POST' }))).status, 405)
  await f.disk.quitar(key)
  assert.deepEqual(await f.disk.listar(), [])
  assert.equal((await f.disk.servir(new Request(result.uri))).status, 404)
})

test('cancelar durante stream elimina temporales y permite reintentar', async t => {
  let signal, began, count = 0
  const started = new Promise(resolve => { began = resolve })
  const f = await fixture(t, { fetch: async (_, init) => {
    if (++count > 1) return body()
    signal = init.signal
    return new Response(new ReadableStream({ start(c) { c.enqueue(Buffer.from('abc')); began() } }), { headers: { 'content-type': 'audio/mp4' } })
  } })
  const pending = f.disk.descargar({ key, url: signed(key) })
  const rejection = assert.rejects(pending, /cancelada/)
  await started
  await f.disk.cancelar(key)
  await rejection
  assert.equal(signal.aborted, true)
  assert.deepEqual(await f.disk.listar(), [])
  assert.deepEqual(await readdir(f.folder), [])
  assert.equal((await f.disk.descargar({ key, url: signed(key) })).bytes, 10)
})

test('fallos HTTP, stream truncado, timeout y disco lleno no publican archivos parciales', async t => {
  const cases = [
    { fetch: async () => new Response('denied', { status: 403 }) },
    { fetch: async () => new Response('abc', { headers: { 'content-type': 'audio/mp4', 'content-length': '10' } }) },
    { fetch: async () => new Response('abc', { headers: { 'content-type': 'constructor' } }) },
    { fetch: async () => new Response('abc', { headers: { 'content-type': 'audio/mp4', 'content-length': '0' } }) },
    { fetch: async () => new Response('<html/>', { headers: { 'content-type': 'text/html' } }) },
    { timeoutMs: 10, fetch: async () => new Response(new ReadableStream({}), { headers: { 'content-type': 'audio/mp4' } }) },
    { espacioLibre: async () => 300 * 1024 * 1024 + 5 },
  ]
  for (const options of cases) {
    const f = await fixture(t, options)
    await assert.rejects(f.disk.descargar({ key, url: signed(key) }))
    assert.deepEqual(await f.disk.listar(), [])
    assert.deepEqual(await readdir(f.folder), [])
  }
})

test('stream sin longitud comprueba reserva por chunk y fallos no bloquean la cola', async t => {
  let spaceCalls = 0
  const f = await fixture(t, {
    espacioLibre: async () => ++spaceCalls < 3 ? 1024 ** 3 : 300 * 1024 * 1024,
    fetch: async () => new Response(Buffer.from('123'), { headers: { 'content-type': 'audio/webm' } }),
  })
  await assert.rejects(f.disk.descargar({ key, url: signed(key) }), /300 MB/)
  assert.deepEqual(await readdir(f.folder), [])
  f.config.espacioLibre = async () => null // Filesystems without statfs still attempt the write.
  const result = await f.disk.descargar({ key, url: signed(key) })
  assert.match(result.uri, /\.webm$/)
  assert.equal(result.bytes, 3)
})

test('startup limpia part/orphans, ignora hashes/extensiones corruptas y listar verifica tamaño', async t => {
  const f = await fixture(t)
  const result = await f.disk.descargar({ key, url: signed(key) })
  await writeFile(join(f.folder, `${'a'.repeat(64)}.m4a.part`), 'part')
  await writeFile(join(f.folder, `${'b'.repeat(64)}.m4a`), 'orphan')
  await writeFile(join(f.folder, `${'c'.repeat(64)}.json`), JSON.stringify({ key, bytes: 10, mime: 'audio/mp4', extension: '../../private' }))
  const again = new DiscoAudioOffline(f.folder, f.config)
  assert.deepEqual(await again.listar(), [result])
  const entries = await readdir(f.folder)
  assert.equal(entries.some(n => n.endsWith('.part')), false)
  assert.equal(entries.includes(`${'b'.repeat(64)}.m4a`), false)
  await writeFile(join(f.folder, `${hash(key)}.m4a`), 'bad')
  assert.deepEqual(await again.listar(), [])
})

test('symlinks no exponen archivos externos al directorio offline', { skip: process.platform === 'win32' }, async t => {
  const f = await fixture(t), result = await f.disk.descargar({ key, url: signed(key) })
  const outside = join(f.dir, 'private')
  await writeFile(outside, '0123456789')
  await rm(join(f.folder, `${hash(key)}.m4a`))
  await symlink(outside, join(f.folder, `${hash(key)}.m4a`))
  assert.equal((await f.disk.servir(new Request(result.uri))).status, 404)
  assert.deepEqual(await f.disk.listar(), [])
})

test('URL valida origen exacto, bucket songs, clave y firma; rechaza red privada y redirects', () => {
  assert.equal(validarUrlAudio(signed(key), key, ORIGEN).origin, ORIGEN)
  for (const url of [signed(key, 'http://127.0.0.1:80'), signed(key, ORIGEN + '.evil.test'), signed(key, 'https://another.supabase.co'), signed('other.m4a'), signed(key).replace('/songs/', '/avatars/'), signed(key).replace('?token=local-test-only', '')]) {
    assert.throws(() => validarUrlAudio(url, key, ORIGEN))
  }
  const local = 'http://127.0.0.1:54321'
  assert.throws(() => validarUrlAudio(signed(key, local), key, local))
  assert.equal(validarUrlAudio(signed(key, local), key, local, true).origin, local)
  assert.throws(() => validarUrlAudio(signed(key, 'http://127.0.0.1:54322'), key, local, true))
  assert.throws(() => validarUrlAudio(signed(key), key, 'https://supabase.co.evil.test'))
})

test('origen sale de config main/export confiable; localhost sólo dev explícito, ambigüedad falla cerrada', async t => {
  const f = await fixture(t), web = join(f.dir, 'dist'), chunks = join(web, '_expo/static/js/web')
  await mkdir(chunks, { recursive: true })
  await writeFile(join(chunks, 'entry.js'), `const url="${ORIGEN}"`)
  assert.equal(await origenAudioConfigurado(web, true, ''), ORIGEN)
  await writeFile(join(f.dir, '.env.local'), 'EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321')
  assert.equal(await origenAudioConfigurado(web, false, ''), 'http://127.0.0.1:54321')
  assert.equal(await origenAudioConfigurado(web, true, ''), ORIGEN)
  assert.equal(await origenAudioConfigurado(web, true, 'http://127.0.0.1:54321'), null)
  await writeFile(join(chunks, 'other.js'), 'const url="https://second.supabase.co"')
  assert.equal(await origenAudioConfigurado(web, true, ''), null)
  assert.equal(await origenAudioConfigurado(web, true, ORIGEN), ORIGEN)
})

test('Railway propio configura Auth y Storage; dominios vecinos no amplían la allowlist', async t => {
  const railway = 'https://envoy-production-2fb6.up.railway.app'
  const f = await fixture(t), web = join(f.dir, 'dist'), chunks = join(web, '_expo/static/js/web')
  await mkdir(chunks, { recursive: true })
  await writeFile(join(chunks, 'entry.js'), `const url="${railway}"`)
  assert.equal(await origenAudioConfigurado(web, true, ''), railway)
  assert.equal(await origenAudioConfigurado(web, true, railway), railway)
  assert.equal(validarUrlAudio(signed(key, railway), key, railway).origin, railway)
  for (const invalid of [railway + '.evil.test', railway + ':444', railway.replace('https:', 'http:'),
    'https://another.up.railway.app', 'https://dnmusic-production-c3f4.up.railway.app',
    'https://user:password@envoy-production-2fb6.up.railway.app']) {
    assert.equal(await origenAudioConfigurado(web, true, invalid), null)
    await writeFile(join(chunks, 'entry.js'), `const url="${invalid}"`)
    assert.equal(await origenAudioConfigurado(web, true, ''), null)
    assert.throws(() => validarUrlAudio(signed(key, invalid), key, railway))
    assert.throws(() => validarUrlAudio(signed(key, invalid), key, invalid))
  }
  await writeFile(join(chunks, 'entry.js'), `const urls=["${railway}","${ORIGEN}"]`)
  assert.equal(await origenAudioConfigurado(web, true, ''), null)
  assert.equal(await origenAudioConfigurado(web, true, railway), railway)
})

test('quitar aborta descarga en curso y una nueva alta espera al borrado', async t => {
  let began, attempts = 0
  const started = new Promise(resolve => { began = resolve })
  const f = await fixture(t, { fetch: async () => {
    if (++attempts > 1) return body()
    began()
    return new Response(new ReadableStream({}), { headers: { 'content-type': 'audio/mp4' } })
  } })
  const first = f.disk.descargar({ key, url: signed(key) })
  const rejected = assert.rejects(first, /eliminada/)
  await started
  const deleted = f.disk.quitar(key)
  const second = f.disk.descargar({ key, url: signed(key) })
  await deleted; await rejected
  const result = await second
  assert.deepEqual(await f.disk.listar(), [result])
  assert.equal(attempts, 2)
})
