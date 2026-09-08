const { test } = require('node:test')
const assert = require('node:assert/strict')
const { request } = require('node:http')
const { readFileSync } = require('node:fs')
const { runInNewContext } = require('node:vm')
const { EventEmitter } = require('node:events')
const { GoogleOAuthEscritorio } = require('../dist/oauth-google.js')
const { registrarGoogleOAuth } = require('../dist/oauth-google-ipc.js')
const origin = 'https://test-auth.supabase.co'
function armar(oauth, inicio) {
  const redirect = new URL(inicio.redirectTo); redirect.searchParams.set('dn_state', '12345678-1234-1234-1234-123456789012'); redirect.searchParams.set('sb_flow_id', 'flow-0123456789abcdef')
  const url = new URL(origin + '/auth/v1/authorize')
  url.searchParams.set('provider', 'google'); url.searchParams.set('redirect_to', redirect.href); url.searchParams.set('code_challenge', 'a'.repeat(43)); url.searchParams.set('code_challenge_method', 's256')
  return { url: url.href, cb: code => { const cb = new URL(redirect); cb.searchParams.set('code', code); return cb } }
}
function get(url, headers = {}) {
  return new Promise((resolve, reject) => { const req = request(url, { headers }, res => {
    let body = ''; res.on('data', data => body += data); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
  }); req.on('error', reject); req.end() })
}
function fixture(t, extras = {}) {
  const opened = [], focused = []
  const oauth = new GoogleOAuthEscritorio({ origen: origin, abrirExterno: async url => opened.push(url), alCompletar: () => focused.push(true), ...extras })
  t.after(() => oauth.cancelar())
  return { oauth, opened, focused }
}

test('loopback real sólo recibe el callback de la transacción y devuelve código por IPC, sin tokens', async t => {
  const h = fixture(t), inicio = await h.oauth.preparar(), a = armar(h.oauth, inicio)
  assert.match(inicio.redirectTo, /^http:\/\/127\.0\.0\.1:\d+\/auth\/callback\/[a-f0-9]{48}$/)
  const pending = h.oauth.abrir({ id: inicio.id, url: a.url })
  assert.equal(h.opened[0], a.url)
  const cb = a.cb('valid-code'), reply = await get(cb)
  assert.equal(reply.status, 200); assert.equal(reply.headers['cache-control'], 'no-store')
  assert.ok(!reply.body.includes('valid-code')); assert.match(reply.headers['content-security-policy'], /default-src 'none'/)
  assert.deepEqual(await pending, { type: 'success', url: cb.href }); assert.equal(h.focused.length, 1)
  await assert.rejects(get(cb))
})

test('callback rechaza Host/Origin ajenos, nonce incorrecto, tokens y duplicados sin consumir transacción', async t => {
  const h = fixture(t), inicio = await h.oauth.preparar(), a = armar(h.oauth, inicio)
  const pending = h.oauth.abrir({ id: inicio.id, url: a.url }), cb = a.cb('valid-code')
  assert.equal((await get(cb, { Host: 'evil.test' })).status, 400)
  assert.equal((await get(cb, { Origin: 'https://evil.test' })).status, 400)
  for (const raw of [cb.href.replace('dn_state=123', 'dn_state=456'), cb.href + '&access_token=secret', cb.href + '&code=otra', cb.href.replace(inicio.id, 'otro')]) assert.equal((await get(raw)).status, 400)
  assert.equal((await get(cb)).status, 200); assert.equal((await pending).type, 'success')
})

test('no abre URL arbitraria, otro proveedor, PKCE plain ni callback de otro puerto', async t => {
  const h = fixture(t), inicio = await h.oauth.preparar(), a = armar(h.oauth, inicio)
  const urls = [a.url.replace('test-auth.supabase.co', 'evil.test'), a.url.replace('provider=google', 'provider=github'), a.url.replace('method=s256', 'method=plain'), a.url + '&redirect_to=https://evil.test']
  const otra = new URL(a.url); otra.searchParams.set('redirect_to', 'http://127.0.0.1:1/auth/callback/otro'); urls.push(otra.href)
  for (const url of urls) await assert.rejects(h.oauth.abrir({ id: inicio.id, url }))
  assert.equal(h.opened.length, 0)
  const p = h.oauth.abrir({ id: inicio.id, url: a.url }); h.oauth.cancelar(inicio.id); assert.deepEqual(await p, { type: 'cancel' })
})

test('cancelación, vencimiento y fallo al abrir liberan receptor; doble inicio no pisa la transacción', async t => {
  const h = fixture(t), inicio = await h.oauth.preparar(), a = armar(h.oauth, inicio)
  await assert.rejects(h.oauth.preparar(), /curso/)
  const p = h.oauth.abrir({ id: inicio.id, url: a.url }); h.oauth.cancelar('id-ajeno'); h.oauth.cancelar(inicio.id); assert.deepEqual(await p, { type: 'cancel' })
  await assert.rejects(get(a.cb('code')))
  const expire = fixture(t, { timeoutMs: 20 }), start = await expire.oauth.preparar()
  assert.deepEqual(await expire.oauth.abrir({ id: start.id, url: armar(expire.oauth, start).url }), { type: 'cancel' })
  const fail = fixture(t, { abrirExterno: async () => { throw new Error('navegador no disponible') } }), f = await fail.oauth.preparar()
  await assert.rejects(fail.oauth.abrir({ id: f.id, url: armar(fail.oauth, f).url }), /navegador/)
  await fail.oauth.preparar()
})

test('Google denegado vuelve como callback verificado sin reflejar error HTML arbitrario', async t => {
  const h = fixture(t), inicio = await h.oauth.preparar(), a = armar(h.oauth, inicio)
  const pending = h.oauth.abrir({ id: inicio.id, url: a.url }), cb = new URL(new URL(a.url).searchParams.get('redirect_to'))
  cb.searchParams.set('error', 'access_denied'); cb.searchParams.set('error_description', '<script>ataque</script>')
  const reply = await get(cb); assert.equal(reply.status, 200); assert.ok(!reply.body.includes('<script>'))
  assert.equal((await pending).url, cb.href)
})

test('IPC valida mainFrame local antes y después de esperar el navegador', async () => {
  const handlers = {}, frame = { url: 'app://dnmusic/sign-in' }, wc = { isDestroyed: () => false, mainFrame: frame }, e = { sender: wc, senderFrame: frame }
  let completar
  registrarGoogleOAuth({ handle: (name, fn) => { handlers[name] = fn } }, { preparar: async () => ({ id: 'local' }), abrir: () => new Promise(r => { completar = r }), cancelar: () => {} }, () => wc)
  for (const event of [{ sender: {}, senderFrame: frame }, { sender: wc, senderFrame: { url: frame.url } }]) await assert.rejects(async () => handlers['oauthGoogle:preparar'](event), /Emisor/)
  assert.deepEqual(await handlers['oauthGoogle:preparar'](e), { id: 'local' })
  const pending = handlers['oauthGoogle:abrir'](e, {}); frame.url = 'https://evil.test'; completar({ type: 'success', url: 'private-code' })
  await assert.rejects(pending, /Emisor/)
})

test('preload conserva audioOffline, OAuth y el almacén nativo de sesión', async () => {
  const calls = [], ipc = new EventEmitter(); ipc.invoke = async (...args) => { calls.push(args); return {} }
  let bridge
  runInNewContext(readFileSync(require.resolve('../dist/preload.js'), 'utf8'), { exports: {}, require: id => {
    assert.equal(id, 'electron'); return { contextBridge: { exposeInMainWorld: (_, b) => { bridge = b } }, ipcRenderer: ipc }
  } })
  assert.deepEqual(Object.keys(bridge.oauthGoogle), ['preparar', 'abrir', 'cancelar']); assert.ok(bridge.audioOffline.descargar)
  assert.deepEqual(Object.keys(bridge.authStorage), ['getItem', 'setItem', 'removeItem'])
  await bridge.oauthGoogle.preparar(); await bridge.oauthGoogle.abrir({ id: 'id', url: 'url' }); await bridge.oauthGoogle.cancelar('id')
  await bridge.authStorage.getItem('sb-test-auth-token'); await bridge.authStorage.setItem('sb-test-auth-token', 'sesion'); await bridge.authStorage.removeItem('sb-test-auth-token')
  assert.deepEqual(calls.map(c => c[0]), ['oauthGoogle:preparar', 'oauthGoogle:abrir', 'oauthGoogle:cancelar', 'authStorage:get', 'authStorage:set', 'authStorage:remove'])
})


test('cerrar o navegar durante preparar cancela el receptor aún antes de obtener puerto', async t => {
  const h = fixture(t), pending = h.oauth.preparar()
  h.oauth.cancelar()
  await assert.rejects(pending, /cancelado/)
  const siguiente = await h.oauth.preparar()
  assert.ok(siguiente.redirectTo); assert.equal(h.opened.length, 0)
})
