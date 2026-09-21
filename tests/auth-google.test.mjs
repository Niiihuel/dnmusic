import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { createClient } from '@supabase/supabase-js'
import { createHash, randomFillSync } from 'node:crypto'
const tick = () => new Promise(r => setImmediate(r))
const code = (path) => ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
const origen = 'https://test-auth.supabase.co'
const user = { id: 'local-google-user', email: 'persona@example.test' }
function montar({ linkUser = { id: 'legacy' }, linkedUser = { id: 'legacy', identities: [{ provider: 'google' }] }, linkError, linkURL, currentSession, os = 'web', oauthError, result, exchange, desktop, signedURL, oauthImplementation, plain = false, memory = new Map(), leerStorage } = {}) {
  const calls = [], browsed = [], replaced = [], assigned = []
  let pendingResult, closed = 0, signups = 0, exchangeCount = 0
  const storage = { getItem: async k => leerStorage ? leerStorage(k, memory.get(k) ?? null) : memory.get(k) ?? null, setItem: async (k, v) => { memory.set(k, v) }, removeItem: async k => { memory.delete(k) } }
  const location = { origin: 'https://app.example.test', href: 'https://app.example.test/sign-in', pathname: '/sign-in', assign: url => assigned.push(url) }
  const ventana = { location, sessionStorage: { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v), removeItem: k => memory.delete(k) }, history: { replaceState(_, __, path) { replaced.push(path); location.href = location.origin + path } } }
  const supabase = { rpc: async (_, params) => ({ data: params.p_username === 'renombrado' ? 'antiguo@flora.local' : null, error: null }), auth: {
    async signInWithOAuth({ provider, options }) {
      calls.push(['oauth', provider, options]); if (oauthImplementation) return oauthImplementation({ provider, options }); if (oauthError) return { data: {}, error: oauthError }
      const redirect = new URL(options.redirectTo); redirect.searchParams.set('sb_flow_id', 'flow-local-0123456789')
      const u = new URL(origen + '/auth/v1/authorize'); u.searchParams.set('provider', provider); u.searchParams.set('redirect_to', redirect.href)
      u.searchParams.set('code_challenge', 'a'.repeat(plain ? 112 : 43)); u.searchParams.set('code_challenge_method', plain ? 'plain' : 's256')
      return { data: { url: signedURL ?? u.href, flowId: 'flow-local-0123456789' }, error: null }
    },
    async getUser() { return { data: { user: linkUser }, error: null } },
    async getSession() { return { data: { session: { user: currentSession ?? linkUser } } } },
    async linkIdentity({ provider, options }) {
      calls.push(['link', provider, options]);
      const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      u.searchParams.set('redirect_uri', origen + '/auth/v1/callback'); u.searchParams.set('response_type', 'code');
      u.searchParams.set('client_id', 'test.apps.googleusercontent.com'); u.searchParams.set('state', 'signed-server-state');
      return { data: { url: linkURL ?? u.href, flowId: 'flow-local-0123456789' }, error: linkError };
    },
    async exchangeCodeForSession(c, options) { exchangeCount++; calls.push(['exchange', c, options]); return exchange ? exchange() : { data: { user: calls.some(c => c[0] === 'link') ? linkedUser : user, session: { user } }, error: null } },
    async signInWithPassword(credentials) { calls.push(['password', credentials]); return { data: { user: { id: 'legacy' } }, error: null } },
    async signUp() { signups++; assert.fail('No crear cuentas por contraseña') }, async signOut(options) { calls.push(['logout', options]); return { error: null } },
  } }
  const deps = {
    '@react-native-async-storage/async-storage': storage, 'react-native': { Platform: { OS: os } },
    'expo-linking': { getInitialURL: async () => location.href },
    'expo-web-browser': { openAuthSessionAsync: async (url, redirectTo) => { browsed.push([url, redirectTo]); return result ? result(url, redirectTo) : new Promise(r => { pendingResult = r }) }, dismissAuthSession: () => { closed++; pendingResult?.({ type: 'cancel' }) } },
    'expo-auth-session': { makeRedirectUri: () => 'dnmusic://auth/callback' }, 'expo-crypto': { randomUUID: () => '12345678-1234-1234-1234-123456789012', digestStringAsync: async (_, v) => createHash('sha256').update(v).digest('base64'), CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, CryptoEncoding: { BASE64: 'base64' } },
    '../lib/supabase': { getSupabase: () => supabase },
  }
  const exports = {}
  new Function('exports', 'require', 'window', 'globalThis', 'process', code('src/services/auth.ts'))(exports, k => { assert.ok(k in deps, k); return deps[k] }, ventana, desktop ? { dnmusicEscritorio: { oauthGoogle: desktop } } : {}, { env: { EXPO_PUBLIC_SUPABASE_URL: origen } })
  return { api: exports, memory, calls, assigned, browsed, replaced, location, get closed() { return closed }, get signups() { return signups }, get exchanges() { return exchangeCount },
    callback(params = {}) {
      const p = JSON.parse(memory.get('auth:google:pendiente:v1')), u = new URL(p.redirectTo)
      u.searchParams.set('dn_state', p.nonce); u.searchParams.set('sb_flow_id', p.flowId); u.searchParams.set('code', 'code-valid')
      for (const [k, v] of Object.entries(params)) { if (v === null) u.searchParams.delete(k); else u.searchParams.set(k, v) }
      return u.href
    }, terminar(result) { pendingResult(result) },
  }
}

test('web prepara PKCE Google y redirige; callback validado intercambia una sola vez y limpia URL', async () => {
  const h = montar(); assert.equal(await h.api.signInWithGoogle(), null)
  assert.equal(h.assigned.length, 1); assert.equal(h.browsed.length, 0); assert.equal(h.calls[0][1], 'google')
  const cb = h.callback(); h.location.href = cb; h.location.pathname = '/auth/callback'
  const [a, b] = await Promise.all([h.api.completarGoogleCallback(cb), h.api.completarGoogleCallback(cb)])
  assert.deepEqual(a, user); assert.deepEqual(b, user); assert.equal(h.exchanges, 1)
  assert.deepEqual(h.calls[1], ['exchange', 'code-valid', { flowId: 'flow-local-0123456789' }])
  assert.equal(h.memory.size, 0); assert.deepEqual(h.replaced, ['/auth/callback'])
})

for (const os of ['ios', 'android']) test(`${os}: navegador del sistema, callback/cancelación y dedup de inicio`, async () => {
  const h = montar({ os }); const a = h.api.signInWithGoogle(); assert.equal(h.api.signInWithGoogle(), a); await tick()
  assert.equal(h.browsed.length, 1); assert.equal(h.browsed[0][1], 'dnmusic://auth/callback')
  h.terminar({ type: 'success', url: h.callback() }); assert.deepEqual(await a, user)
  const cancel = montar({ os }); const p = cancel.api.signInWithGoogle(); await tick(); await cancel.api.cancelarGoogle(); assert.equal(await p, null)
  assert.equal(cancel.exchanges, 0); assert.equal(cancel.memory.size, 0); assert.equal(cancel.closed, 1)
})

test('rechaza callback sin inicio, nonce incorrecto, destino ajeno, tokens y parámetros duplicados', async () => {
  const h = montar(); await assert.rejects(h.api.completarGoogleCallback('https://app.example.test/auth/callback?code=x'), /venció/)
  await h.api.signInWithGoogle()
  const valid = h.callback()
  for (const url of [valid.replace('app.example.test', 'evil.example.test'), valid.replace('/auth/callback', '/otro'), valid + '#access_token=token', valid + '&refresh_token=token', valid + '&code=otro', h.callback({ dn_state: 'ajeno' }), h.callback({ sb_flow_id: 'ajeno' })]) await assert.rejects(h.api.completarGoogleCallback(url))
  assert.equal(h.exchanges, 0); assert.ok(h.memory.size)
  assert.deepEqual(await h.api.completarGoogleCallback(valid), user)
})

test('callback expirado y destino almacenado arbitrario no crean sesión', async () => {
  const h = montar(); await h.api.signInWithGoogle()
  const p = JSON.parse(h.memory.get('auth:google:pendiente:v1')); p.vence = 1; h.memory.set('auth:google:pendiente:v1', JSON.stringify(p))
  await assert.rejects(h.api.completarGoogleCallback(h.callback()), /venció/)
  p.vence = Date.now() + 60000; p.redirectTo = 'https://evil.example.test/auth/callback'; h.memory.set('auth:google:pendiente:v1', JSON.stringify(p))
  await assert.rejects(h.api.completarGoogleCallback(h.callback()), /destino/); assert.equal(h.exchanges, 0)
})

test('denegación del proveedor devuelve cancelación; fallo de intercambio no reusa código', async () => {
  const h = montar(); await h.api.signInWithGoogle()
  assert.equal(await h.api.completarGoogleCallback(h.callback({ code: null, error: 'access_denied' })), null)
  assert.equal(h.exchanges, 0); assert.equal(h.memory.size, 0)
  const fallo = montar({ exchange: async () => ({ data: {}, error: new Error('código vencido') }) }); await fallo.api.signInWithGoogle()
  const cb = fallo.callback(); await assert.rejects(fallo.api.completarGoogleCallback(cb), /vencido/); await assert.rejects(fallo.api.completarGoogleCallback(cb))
  assert.equal(fallo.exchanges, 1); assert.equal(fallo.memory.size, 0)
})

test('proveedor deshabilitado o URL OAuth ajena no abren navegador ni dejan transacción', async () => {
  for (const opts of [{ oauthError: new Error('provider disabled') }, { signedURL: 'https://evil.example.test/auth/v1/authorize' }]) {
    const h = montar(opts); await assert.rejects(h.api.signInWithGoogle()); assert.equal(h.assigned.length, 0); assert.equal(h.browsed.length, 0); assert.equal(h.memory.size, 0)
  }
})

test('Electron usa IPC y callback loopback exacto; nunca abre Google dentro del renderer', async () => {
  const desktop = { preparar: async () => ({ id: 'local-desktop-id', redirectTo: 'http://127.0.0.1:34567/auth/callback/local-desktop-id' }), cancelar: async () => {},
    abrir: async ({ url }) => { const u = new URL(new URL(url).searchParams.get('redirect_to')); u.searchParams.set('code', 'desktop-code'); return { type: 'success', url: u.href } } }
  const h = montar({ desktop }); assert.deepEqual(await h.api.signInWithGoogle(), user)
  assert.equal(h.assigned.length, 0); assert.equal(h.browsed.length, 0); assert.equal(h.exchanges, 1)
})

test('contraseñas legacy y altas nuevas están bloqueadas sin invocar Auth', async () => {
  const h = montar(); await assert.rejects(h.api.signIn('renombrado', 'password-local'), /Google/)
  assert.deepEqual(h.calls, [])
  await assert.rejects(h.api.signUp('nuevo', 'password-local'), /Google/); assert.equal(h.signups, 0)
  assert.equal(h.api.emailToUsername('antes@flora.local'), ''); assert.equal(h.api.emailToUsername('persona@example.test'), '')
  assert.equal(h.api.isInternalAuthEmail('antes@flora.local'), true)
  assert.equal(h.api.isInternalAuthEmail('legacy-id@auth.dnmusic.invalid'), true)
  assert.equal(h.api.isInternalAuthEmail('persona@example.test'), false)
})

test('cliente Supabase usa PKCE sin detección automática de sesiones por URL', () => {
  let config
  const exports = {}, deps = { 'react-native-url-polyfill/auto': {}, 'expo-crypto': {}, '@react-native-async-storage/async-storage': {}, '@supabase/supabase-js': { createClient: (_, __, options) => { config = options; return {} } }, 'react-native': { Platform: { OS: 'web' } } }
  new Function('exports', 'require', 'process', code('src/lib/supabase.ts'))(exports, k => deps[k], { env: { EXPO_PUBLIC_SUPABASE_URL: origen, EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-test-key' } })
  exports.getSupabase(); assert.equal(config.auth.flowType, 'pkce'); assert.equal(config.auth.detectSessionInUrl, false)
})


test('Hermes sin SubtleCrypto: convierte desafío interno plain a SHA-256 antes del navegador', async () => {
  const h = montar({ os: 'ios', plain: true }); const p = h.api.signInWithGoogle(); await tick()
  const url = new URL(h.browsed[0][0])
  assert.equal(url.searchParams.get('code_challenge_method'), 's256')
  assert.equal(url.searchParams.get('code_challenge'), createHash('sha256').update('a'.repeat(112)).digest('base64url'))
  assert.ok(!h.browsed[0][0].includes('a'.repeat(112)), 'el verificador no sale del dispositivo')
  h.terminar({ type: 'cancel' }); await p
})

test('cliente nativo provee CSPRNG sin fingir SubtleCrypto', () => {
  const exports = {}, globals = {}, deps = { 'react-native-url-polyfill/auto': {}, 'expo-crypto': { getRandomValues: randomFillSync }, '@react-native-async-storage/async-storage': {}, '@supabase/supabase-js': { createClient: () => ({}) }, 'react-native': { Platform: { OS: 'ios' } } }
  new Function('exports', 'require', 'process', 'globalThis', code('src/lib/supabase.ts'))(exports, k => deps[k], { env: { EXPO_PUBLIC_SUPABASE_URL: origen, EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-test-key' } }, globals)
  exports.getSupabase(); assert.equal(globals.crypto.getRandomValues, randomFillSync); assert.equal(globals.crypto.subtle, undefined)
})


test('cancelación durante lectura del callback impide el intercambio; uno ya iniciado termina antes de logout', async () => {
  const h = montar(); await h.api.signInWithGoogle()
  const callback = h.api.completarGoogleCallback(h.callback())
  const cancel = h.api.cancelarGoogle()
  await assert.rejects(callback, /cancelado/); await cancel; assert.equal(h.exchanges, 0)
  let completar
  const committed = montar({ exchange: () => new Promise(r => { completar = r }) }); await committed.api.signInWithGoogle()
  const session = committed.api.completarGoogleCallback(committed.callback()); await tick()
  const logout = committed.api.logOut(); await tick(); assert.ok(!committed.calls.some(c => c[0] === 'logout'))
  completar({ data: { user, session: { user } }, error: null })
  await session; await logout; assert.equal(committed.calls.at(-1)[0], 'logout'); assert.equal(committed.memory.size, 0)
})


test('logout invalida callback detenido en storage, incluso si empieza otro intento antes de resolver la lectura vieja', async () => {
  let lecturaVieja, demorar = false
  const h = montar({ os: 'ios', leerStorage: (_, value) => demorar ? new Promise(r => { lecturaVieja = () => r(value); demorar = false }) : value })
  const inicio = h.api.signInWithGoogle(); await tick()
  const cb = h.callback(); demorar = true
  const viejo = h.api.completarGoogleCallback(cb); await tick()
  await h.api.logOut(); assert.equal(await inicio, null)
  const nuevo = h.api.signInWithGoogle(); await tick()
  lecturaVieja(); await assert.rejects(viejo, /cancelado/)
  assert.equal(h.exchanges, 0)
  h.terminar({ type: 'success', url: h.callback() }); assert.deepEqual(await nuevo, user)
  assert.equal(h.exchanges, 1)
})

test('logout llamado por el SDK al comenzar intercambio espera el resultado antes de cerrar sesión', async () => {
  let logout, completar, h
  h = montar({ exchange: () => { logout = h.api.logOut(); return new Promise(r => { completar = r }) } })
  await h.api.signInWithGoogle()
  const callback = h.api.completarGoogleCallback(h.callback()); await tick()
  assert.ok(!h.calls.some(c => c[0] === 'logout'))
  // Una pulsación nueva durante el intercambio comparte el trabajo y no reemplaza su generación.
  const duplicado = h.api.signInWithGoogle()
  assert.equal(h.calls.filter(c => c[0] === 'oauth').length, 1)
  completar({ data: { user, session: { user } }, error: null })
  await callback; await duplicado; await logout
  assert.equal(h.calls.at(-1)[0], 'logout'); assert.equal(h.exchanges, 1)
})


test('Electron migra localStorage al almacén nativo y lo usa para las sesiones siguientes', async () => {
  let config
  const local = new Map([['sb-proyecto-auth-token', 'sesion-anterior']])
  const nativo = new Map()
  const globals = {
    dnmusicEscritorio: { authStorage: {
      getItem: async clave => nativo.get(clave) ?? null,
      setItem: async (clave, valor) => { nativo.set(clave, valor) },
      removeItem: async clave => { nativo.delete(clave) },
    } },
    localStorage: {
      getItem: clave => local.get(clave) ?? null,
      setItem: (clave, valor) => { local.set(clave, valor) },
      removeItem: clave => { local.delete(clave) },
    },
  }
  const deps = {
    'react-native-url-polyfill/auto': {},
    'expo-crypto': {},
    '@react-native-async-storage/async-storage': {},
    '@supabase/supabase-js': { createClient: (_, __, options) => { config = options; return {} } },
    'react-native': { Platform: { OS: 'web' } },
  }
  const exports = {}
  new Function('exports', 'require', 'process', 'globalThis', code('src/lib/supabase.ts'))(
    exports,
    id => deps[id],
    { env: { EXPO_PUBLIC_SUPABASE_URL: origen, EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-test-key' } },
    globals,
  )
  exports.getSupabase()
  assert.equal(await config.auth.storage.getItem('sb-proyecto-auth-token'), 'sesion-anterior')
  assert.equal(nativo.get('sb-proyecto-auth-token'), 'sesion-anterior')
  assert.equal(local.has('sb-proyecto-auth-token'), false)
  await config.auth.storage.setItem('sb-proyecto-auth-token', 'sesion-nueva')
  assert.equal(nativo.get('sb-proyecto-auth-token'), 'sesion-nueva')
  await config.auth.storage.removeItem('sb-proyecto-auth-token')
  assert.equal(nativo.has('sb-proyecto-auth-token'), false)
})

for (const os of ['web', 'ios']) test(`${os}: conecta Google a la cuenta existente y vuelve a Ajustes`, async () => {
  const h = montar({ os });
  const pending = h.api.conectarGoogle('legacy'); await tick();
  assert.equal(h.calls.filter(c => c[0] === 'link').length, 1);
  assert.equal(h.calls.filter(c => c[0] === 'oauth').length, 0);
  assert.equal(await h.api.destinoTrasGoogle(), '/ajustes?seccion=cuenta');
  if (os === 'ios') h.terminar({ type: 'success', url: h.callback() });
  else { await pending; await h.api.completarGoogleCallback(h.callback()); }
  if (os === 'ios') assert.equal((await pending).id, 'legacy');
  assert.equal(h.exchanges, 1);
  assert.equal(h.memory.size, 0);
  assert.equal(await h.api.destinoTrasGoogle(), '/ajustes?seccion=cuenta');
});

test('vincular: sesión incorrecta, ya conectado y errores no abren otro login', async () => {
  const changed = montar(); await assert.rejects(changed.api.conectarGoogle('other'), /sesión cambió/); assert.equal(changed.calls.length, 0);
  const linked = montar({ linkUser: { id: 'legacy', identities: [{ provider: 'google' }] } });
  assert.equal((await linked.api.conectarGoogle('legacy')).id, 'legacy'); assert.equal(linked.calls.length, 0);
  const disabled = montar({ linkError: new Error('manual_linking_disabled') }); await assert.rejects(disabled.api.conectarGoogle('legacy'), /manual_linking/);
  assert.equal(disabled.assigned.length, 0); assert.equal(disabled.memory.size, 0);
  const invalid = montar({ linkURL: 'https://evil.test/' }); await assert.rejects(invalid.api.conectarGoogle('legacy'), /vinculación/); assert.equal(invalid.assigned.length, 0);
});

test('vincular: cancelar conserva sesión y rechaza intercambio tras cambiar de cuenta', async () => {
  const cancel = montar({ os: 'ios' }); const pending = cancel.api.conectarGoogle('legacy'); await tick(); await cancel.api.cancelarGoogle(); assert.equal(await pending, null);
  assert.equal(cancel.calls.filter(c => c[0] === 'logout').length, 0);
  const changed = montar({ currentSession: { id: 'other' } }); await changed.api.conectarGoogle('legacy');
  await assert.rejects(changed.api.completarGoogleCallback(changed.callback()), /sesión cambió/); assert.equal(changed.exchanges, 0);
  const wrong = montar({ linkedUser: { id: 'other', identities: [{ provider: 'google' }] } }); await wrong.api.conectarGoogle('legacy');
  await assert.rejects(wrong.api.completarGoogleCallback(wrong.callback()), /cuenta original/);
  assert.equal(wrong.calls.filter(c => c[0] === 'logout').length, 1);
  const missing = montar({ linkedUser: { id: 'legacy', identities: [] } }); await missing.api.conectarGoogle('legacy');
  await assert.rejects(missing.api.completarGoogleCallback(missing.callback()), /No se confirmó/);
});

test('Electron vincula mediante navegador externo y exige puente compatible', async () => {
  let h;
  const desktop = { preparar: async () => ({ id: 'local-desktop-id', redirectTo: 'http://127.0.0.1:34567/auth/callback/local-desktop-id' }), cancelar: async () => {},
    abrir: async () => assert.fail('No iniciar otro usuario'),
    abrirVinculacion: async ({ url, retorno }) => {
      assert.equal(new URL(url).origin, 'https://accounts.google.com');
      const cb = new URL(retorno); cb.searchParams.set('code', 'valid-code'); return { type: 'success', url: cb.href };
    } };
  h = montar({ desktop }); assert.equal((await h.api.conectarGoogle('legacy')).id, 'legacy'); assert.equal(h.assigned.length, 0);
  const old = montar({ desktop: { ...desktop, abrirVinculacion: undefined } }); await assert.rejects(old.api.conectarGoogle('legacy'), /Actualizá/);
});

// El SDK real devuelve flowId aunque no lo añada al redirect por defecto.
// Los dobles anteriores siempre lo agregaban y ocultaban este fallo.
test('el cliente real de Supabase prepara un retorno que DMusic acepta en web y escritorio', async () => {
  const exports = {}, deps = {
    'react-native-url-polyfill/auto': {}, 'expo-crypto': {},
    '@react-native-async-storage/async-storage': {},
    '@supabase/supabase-js': { createClient }, 'react-native': { Platform: { OS: 'web' } },
  }
  new Function('exports', 'require', 'process', code('src/lib/supabase.ts'))(exports, k => deps[k], { env: { EXPO_PUBLIC_SUPABASE_URL: origen, EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-test-key' } })
  const client = exports.getSupabase()
  try {
    for (const desktop of [undefined, {
      preparar: async () => ({ id: 'desktop-test', redirectTo: 'http://127.0.0.1:32123/auth/callback/desktop-test' }),
      abrir: async ({ url }) => {
        const u = new URL(url), retorno = new URL(u.searchParams.get('redirect_to'))
        assert.ok(retorno.searchParams.get('sb_flow_id'))
        assert.ok(retorno.searchParams.get('dn_state'))
        assert.equal(u.searchParams.get('code_challenge_method'), 's256')
        return { type: 'cancel' }
      },
      cancelar: async () => {},
    }]) {
      let generado
      const h = montar({ desktop, oauthImplementation: async credentials => {
        generado = await client.auth.signInWithOAuth(credentials)
        return generado
      } })
      assert.equal(await h.api.signInWithGoogle(), null)
      assert.equal(generado.error, null)
      const retorno = new URL(new URL(generado.data.url).searchParams.get('redirect_to'))
      assert.equal(retorno.searchParams.get('sb_flow_id'), generado.data.flowId)
      if (!desktop) assert.equal(h.assigned.length, 1)
    }
  } finally { await client.auth.stopAutoRefresh() }
})


test('cerrar sesión afecta solo a esta instalación y conserva las sesiones de otros dispositivos', async () => {
  const h = montar()
  await h.api.logOut()
  assert.deepEqual(h.calls.filter(c => c[0] === 'logout'), [['logout', { scope: 'local' }]])
})
