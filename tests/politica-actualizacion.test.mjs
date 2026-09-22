import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const transpile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
function moduleAt(path, dependencies = {}, globals = {}, suffix = '') {
  const exports = {}
  new Function('exports', 'require', ...Object.keys(globals), transpile(readFileSync(path, 'utf8') + suffix))(
    exports, name => { if (!(name in dependencies)) throw Error(`Missing mock: ${name}`); return dependencies[name] }, ...Object.values(globals))
  return exports
}
const core = moduleAt('src/services/politicaActualizacion.ts')
const destination = 'https://github.com/Niihuel/dnmusic-releases/releases/latest'
const policy = (patch = {}) => ({ platform: 'windows', latest_version: '1.12.0', minimum_version: '0.0.0', update_url: destination, enabled: true, revision: 1, ...patch })
const installed = version => ({ platform: 'windows', version })
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const tick = () => new Promise(resolve => setImmediate(resolve))

test('compara versiones numéricas y exige releases estables acotados', () => {
  assert.equal(core.compararVersiones('1.10.0', '1.9.9'), 1)
  assert.equal(core.compararVersiones('2.0.0', '10.0.0'), -1)
  assert.equal(core.compararVersiones('1.12.0', '1.12.0'), 0)
  for (const v of ['', '1.2', '1.2.3-beta', 'v1.2.3', '01.2.3', '1.2.3+build', '1000000.0.0']) assert.throws(() => core.compararVersiones(v, '1.0.0'))
})
test('opcional descartable por plataforma y versión; mínimo siempre prevalece', () => {
  const p = policy(), dismissed = core.claveAviso(p)
  assert.equal(core.evaluarPolitica(p, installed('1.11.0'), null), 'opcional')
  assert.equal(core.evaluarPolitica(p, installed('1.11.0'), dismissed), 'ninguna')
  assert.equal(core.evaluarPolitica(policy({ minimum_version: '1.12.0', revision: 2 }), installed('1.11.0'), dismissed), 'obligatoria')
  assert.equal(core.evaluarPolitica(policy({ latest_version: '1.13.0', minimum_version: '1.12.0' }), installed('1.12.0'), null), 'opcional')
  assert.equal(core.evaluarPolitica(policy({ latest_version: '1.13.0' }), installed('1.11.0'), dismissed), 'opcional')
  for (const version of ['1.12.0', '1.13.0']) assert.equal(core.evaluarPolitica(p, installed(version), null), 'ninguna')
  assert.equal(core.evaluarPolitica(policy({ enabled: false }), installed('1.0.0'), null), 'ninguna')
  assert.equal(core.evaluarPolitica(p, { platform: 'ios', version: '1.0.0' }, null), 'ninguna')
  assert.equal(core.politicaCubreAviso(p, installed('1.11.0')), true)
  assert.equal(core.politicaCubreAviso(null, installed('1.11.0')), false)
})
test('destinos admitidos y rechazo de esquemas, credenciales, puertos, host impostor y plataforma equivocada', () => {
  const accepted = [['windows', destination], ['linux', `${destination.replace('/latest', '/download/v1.12.0/dnmusic.AppImage')}`], ['ios', 'https://testflight.apple.com/join/Ab123'], ['ios', 'https://apps.apple.com/ar/app/dmusic/id12345'], ['android', 'https://play.google.com/store/apps/details?id=com.nihuel.dnmusic'], ['web', 'https://dnmusic-app.vercel.app/?v=1.12.0'], ['web', 'https://dnmusic-production-c3f4.up.railway.app/?v=1.12.0']]
  for (const [platform, url] of accepted) assert.equal(core.esDestinoActualizacion(platform, url), true, url)
  for (const url of ['javascript:alert(1)', 'http://github.com/Niihuel/dnmusic-releases/releases/latest', destination + '#x', destination + '\n', destination.replace('github.com', 'github.com.evil.test'), destination.replace('github.com', 'github.com@evil.test'), destination.replace('github.com', 'github.com:443'), destination.replace('Niihuel', 'someone'), 'file:///tmp/update', 'https://example.com/']) assert.equal(core.esDestinoActualizacion('windows', url), false, url)
  assert.equal(core.esDestinoActualizacion('ios', destination), false)
  assert.equal(core.esDestinoActualizacion('web', destination), false)
  for (const patch of [{ minimum_version: '2.0.0' }, { enabled: 'true' }, { revision: 0 }, { revision: 1.1 }, { platform: 'unknown' }, { update_url: 'javascript:alert(1)' }]) assert.throws(() => core.leerPolitica(policy(patch)))
})
test('plataforma nativa, Electron por OS y navegador móvil como web', () => {
  for (const [ua, expected] of [['Windows NT 10.0', 'windows'], ['X11; Linux x86_64', 'linux'], ['Macintosh; Intel Mac OS X', 'macos']]) assert.equal(core.detectarPlataforma('web', true, ua), expected)
  assert.equal(core.detectarPlataforma('web', false, 'iPhone'), 'web')
  assert.equal(core.detectarPlataforma('ios', false), 'ios')
  assert.equal(core.detectarPlataforma('android', false), 'android')
  assert.equal(core.detectarPlataforma('web', true, 'unknown'), null)
})

function stateFixture({ initialCache = null, dismissal = null, fetch = async () => policy(), cacheRead, identity = async () => installed('1.11.0') } = {}) {
  const disk = new Map([['dmusic.update-policy.v1', initialCache], ['dmusic.update-dismissal.v1', dismissal]])
  const changes = [], callbacks = new Map(), intervals = new Set()
  let state, calls = 0, appListener, removed = 0
  const api = moduleAt('src/state/politicaActualizacion.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: key => cacheRead ? cacheRead(key) : Promise.resolve(disk.get(key)), setItem: async (key, value) => disk.set(key, value), removeItem: async key => disk.delete(key) } },
    'react-native': { Platform: { OS: 'web' }, AppState: { currentState: 'active', addEventListener: (_, listener) => { appListener = listener; return { remove: () => removed++ } } } },
    './store': { createStore: initial => { state = initial; return { get: () => state, set: patch => { state = { ...state, ...patch }; changes.push(state) } } }, useStore: (_, select) => select(state) },
    '../services/actualizacionesRemotas': { consultarPolitica: async platform => { calls++; assert.equal(platform, 'windows'); return fetch() } },
    '../services/instalacionActual': { obtenerInstalacion: identity },
    '../services/politicaActualizacion': core,
  }, { globalThis: { document: { visibilityState: 'visible', addEventListener: (key, cb) => callbacks.set(key, cb), removeEventListener: key => callbacks.delete(key) }, addEventListener: (key, cb) => callbacks.set(key, cb), removeEventListener: key => callbacks.delete(key) }, setInterval: fn => { intervals.add(fn); return fn }, clearInterval: fn => intervals.delete(fn) })
  return { api, disk, changes, callbacks, intervals, state: () => state, calls: () => calls, resume: () => appListener('active'), removed: () => removed }
}
test('arranque libera Chrome tras caché, sin esperar la red; deduplica consultas', async () => {
  const remote = deferred(), f = stateFixture({ fetch: () => remote.promise })
  const first = f.api.refrescarPolitica(), second = f.api.refrescarPolitica()
  assert.equal(first, second)
  await tick()
  assert.equal(f.state().iniciada, true)
  assert.equal(f.state().consultando, true)
  assert.equal(f.calls(), 1)
  remote.resolve(policy()); await first
  const polling = f.api.refrescarPolitica()
  assert.equal(f.state().iniciada, true, 'polling never returns to splash')
  await polling
})
test('caché obligatoria bloquea antes de respuesta y sobrevive timeout, descarte y reinicio offline', async () => {
  const mandatory = policy({ minimum_version: '1.12.0' }), network = deferred()
  const f = stateFixture({ initialCache: JSON.stringify(mandatory), dismissal: core.claveAviso(mandatory), fetch: () => network.promise })
  const work = f.api.refrescarPolitica(); await tick()
  assert.equal(core.evaluarPolitica(f.state().politica, f.state().instalacion, f.state().descartada), 'obligatoria')
  f.api.descartarPolitica()
  network.reject(Error('offline')); await work
  assert.equal(f.state().politica.minimum_version, '1.12.0')
  const restarted = stateFixture({ initialCache: f.disk.get('dmusic.update-policy.v1'), fetch: async () => { throw Error('offline') } })
  await restarted.api.refrescarPolitica()
  assert.equal(core.evaluarPolitica(restarted.state().politica, restarted.state().instalacion, null), 'obligatoria')
})
test('revocación confirmada retira caché; error o plataforma ajena no la reemplazan', async () => {
  const f = stateFixture({ initialCache: JSON.stringify(policy({ minimum_version: '1.12.0' })), fetch: async () => null })
  await f.api.refrescarPolitica(); await tick()
  assert.equal(f.state().politica, null)
  assert.equal(f.disk.has('dmusic.update-policy.v1'), false)
  const bad = stateFixture({ initialCache: JSON.stringify(policy({ platform: 'ios' })), fetch: async () => { throw Error('missing RPC') } })
  await bad.api.refrescarPolitica()
  assert.equal(bad.state().politica, null)
  assert.match(bad.state().error, /missing RPC/)
})
test('descarte opcional se persiste sin ignorar un mínimo elevado después', async () => {
  let next = policy()
  const f = stateFixture({ fetch: async () => next })
  await f.api.refrescarPolitica(); f.api.descartarPolitica(); await tick()
  assert.equal(f.disk.get('dmusic.update-dismissal.v1'), 'windows:1.12.0')
  next = policy({ minimum_version: '1.12.0', revision: 2 })
  await f.api.refrescarPolitica()
  assert.equal(core.evaluarPolitica(f.state().politica, f.state().instalacion, f.state().descartada), 'obligatoria')
})
test('arranque/resume/período/foco/online usan un único reloj y limpian listeners', async () => {
  const f = stateFixture(), stop1 = f.api.iniciarPoliticaActualizacion(), stop2 = f.api.iniciarPoliticaActualizacion()
  await tick(); assert.equal(f.calls(), 1); assert.equal(f.intervals.size, 1)
  for (const fn of [f.resume, ...f.intervals, ...f.callbacks.values()]) { fn(); await tick() }
  assert.equal(f.calls(), 6)
  stop1(); stop1(); assert.equal(f.intervals.size, 1)
  stop2(); assert.equal(f.intervals.size, 0); assert.equal(f.callbacks.size, 0); assert.equal(f.removed(), 1)
})

function rpcFixture(result) {
  const calls = []
  const api = moduleAt('src/services/actualizacionesRemotas.ts', {
    '../lib/supabase': { getSupabase: () => ({ rpc: (name, args) => { calls.push([name, args]); return { abortSignal: signal => { assert.ok(signal instanceof AbortSignal); return result(name, args) } } } }) },
    './politicaActualizacion': core,
  })
  return { api, calls }
}
test('RPC valida contratos, distingue falta de política/fallo y guarda con revisión esperada', async () => {
  const f = rpcFixture(async name => ({ data: name === 'admin_update_policies' ? [policy()] : policy(), error: null }))
  await f.api.consultarPolitica('windows'); await f.api.listarPoliticas(); await f.api.guardarPolitica(policy(), 0)
  assert.deepEqual(f.calls.at(-1), ['admin_save_update_policy', { p_platform: 'windows', p_latest_version: '1.12.0', p_minimum_version: '0.0.0', p_update_url: destination, p_enabled: true, p_expected_revision: 0 }])
  await assert.rejects(rpcFixture(async () => ({ data: policy({ platform: 'linux' }) })).api.consultarPolitica('windows'), /otra plataforma/)
  await assert.rejects(rpcFixture(async () => ({ error: { code: 'PGRST202' } })).api.consultarPolitica('windows'), /migración/)
  assert.equal(await rpcFixture(async () => ({ data: null })).api.consultarPolitica('windows'), null)
  await assert.rejects(f.api.guardarPolitica(policy(), 3), /confirmar/)
})

const jsx = (type, props) => ({ type, props })
const flatten = n => Array.isArray(n) ? n.flatMap(flatten) : n && typeof n === 'object' ? [n, ...flatten(n.props?.children)] : []
function uiFixture(path, dependencies, names = []) {
  const slots = [], effects = []; let index = 0
  const react = {
    useState(initial) { const i = index++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => slots[i] = typeof value === 'function' ? value(slots[i]) : value] },
    useRef(initial) { const i = index++; return slots[i] ??= { current: initial } },
    useEffect(fn) { effects.push(fn) }, useCallback: fn => fn,
  }
  const components = Object.fromEntries(['View','Text','Modal','ScrollView','ActivityIndicator','Pressable','Switch'].map(n => [n,n]))
  const native = { ...components, Platform: { OS: 'web' }, BackHandler: { addEventListener: () => ({ remove() {} }) }, Linking: { openURL: async () => {} } }
  const api = moduleAt(path, { 'react': react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native, './Ajustes': Object.fromEntries(['ListaAjustes', 'GrupoAjustes', 'FilaAccion', 'FilaDato'].map(n => [n, n])), './Button': { PrimaryButton: 'PrimaryButton', GhostButton: 'GhostButton' }, '../lib/compartir': { SITIO: 'https://dnmusic-production-c3f4.up.railway.app' }, ...dependencies }, {}, names.length ? `\nexport { ${names.join(',')} };` : '')
  return { render(name, props) { index = 0; return flatten(api[name](props)) }, effects }
}
test('gate: bloqueo sin children ni salida, preferencia desactivada y descarte nunca lo evitan', () => {
  let state = { iniciada: true, politica: policy({ minimum_version: '1.12.0' }), instalacion: installed('1.11.0'), descartada: 'windows:1.12.0' }, preference = false
  const f = uiFixture('src/ui/ControlActualizaciones.tsx', {
    './EncabezadoHoja': { EncabezadoHoja: 'EncabezadoHoja', BotonHoja: 'BotonHoja' },
    './Dialogo': { Dialogo: 'Modal' }, './ModalContext': { useDentroModalPC: () => false },
    '../state/ajustes': { usePreferencia: () => preference },
    '../state/actualizacion': { useActualizacion: () => ({ fase: 'inactivo' }) },
    '../state/politicaActualizacion': { usePoliticaActualizacion: () => state, iniciarPoliticaActualizacion: () => () => {}, descartarPolitica() {}, refrescarPolitica() {} },
    '../services/politicaActualizacion': core,
  }, ['AvisoPolitica'])
  let ui = f.render('ControlActualizaciones', { children: { type: 'APP' } })
  assert.equal(ui.some(n => n.type === 'APP'), false)
  const mandatory = ui.find(n => n.props?.obligatoria)
  assert.ok(mandatory)
  ui = f.render('AvisoPolitica', mandatory.props)
  assert.equal(ui.some(n => n.props?.label === 'Más adelante'), false)
  assert.equal(ui.some(n => n.type === 'Modal'), false, 'mandatory is a replacement, not dismissible overlay')
  state = { ...state, politica: policy(), descartada: null }
  assert.equal(f.render('ControlActualizaciones', { children: { type: 'APP' } }).some(n => n.type === 'APP'), true)
  preference = true
  ui = f.render('ControlActualizaciones', { children: { type: 'APP' } })
  assert.ok(ui.find(n => n.type === 'Modal').props.onRequestClose)
  assert.equal(f.render('AvisoActualizacionSinPolitica', { children: { type: 'LEGACY' } }).some(n => n.type === 'LEGACY'), false)
  state = { ...state, politica: null }
  assert.equal(f.render('AvisoActualizacionSinPolitica', { children: { type: 'LEGACY' } }).some(n => n.type === 'LEGACY'), true)
})
test('admin: formulario revisable, confirmación explícita, una sola escritura y error sin éxito ficticio', async () => {
  const request = deferred(), saves = []; let saved = false
  const f = uiFixture('src/ui/AdministrarActualizaciones.tsx', {
    './Ajustes': { GrupoAjustes: 'GrupoAjustes', FilaAccion: 'FilaAccion', FilaDato: 'FilaDato', FilaOpciones: 'FilaOpciones', FilaTexto: 'FilaTexto', FilaInterruptor: 'FilaInterruptor' }, './Confirmar': { Confirmar: 'Confirmar' },
    '../state/session': { useAuthUser: () => ({ id: 'owner' }), useIsAccessAdmin: () => true },
    '../services/actualizacionesRemotas': { guardarPolitica: (p, revision) => { saves.push([p, revision]); return request.promise } },
    '../services/politicaActualizacion': core, '../state/politicaActualizacion': { refrescarPolitica: async () => {} },
  }, ['EditorPolitica'])
  const render = () => f.render('EditorPolitica', { plataforma: 'windows', actual: policy(), onGuardada: () => saved = true })
  let ui = render()
  ui.find(n => n.props?.rotulo === 'Igualar la mínima a la última').props.onPress()
  ui = render(); assert.equal(ui.find(n => n.props?.rotulo === 'Mínima soportada').props.valor, '1.12.0')
  ui.find(n => n.props?.rotulo === 'Revisar y guardar').props.onPress()
  ui = render(); const confirmation = ui.find(n => n.type === 'Confirmar')
  assert.equal(confirmation.props.visible, true); assert.match(confirmation.props.mensaje, /menores a 1.12.0 quedarán bloqueadas/)
  assert.equal(saves.length, 0)
  confirmation.props.onConfirmar(); confirmation.props.onConfirmar()
  assert.equal(saves.length, 1); assert.equal(saves[0][1], 1)
  request.reject(Error('42501 permiso denegado')); await tick()
  ui = render(); assert.equal(saved, false)
  // El error vive al pie de su bloque, no en un cartel suelto entre los campos.
  assert.ok(ui.some(n => n.type === 'GrupoAjustes' && /42501/.test(n.props.error ?? '')))
})

test('caché lenta tiene deadline de 1.5s y la red pendiente nunca bloquea el arranque', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const f = stateFixture({ cacheRead: () => new Promise(() => {}), fetch: () => new Promise(() => {}) })
  void f.api.refrescarPolitica(); await tick()
  assert.equal(f.state().iniciada, false)
  t.mock.timers.tick(1500); await tick()
  assert.equal(f.state().iniciada, true)
  assert.equal(f.state().consultando, true)
})
test('RPC aborta al vencer 12s y deja un error visible en vez de fingir ausencia', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const api = moduleAt('src/services/actualizacionesRemotas.ts', {
    '../lib/supabase': { getSupabase: () => ({ rpc: () => ({ abortSignal: signal => new Promise(resolve => signal.addEventListener('abort', () => resolve({ error: { code: 'ABORT' } }))) }) }) },
    './politicaActualizacion': core,
  })
  const work = api.consultarPolitica('windows')
  const rejected = assert.rejects(work, /ABORT/)
  t.mock.timers.tick(12_000)
  await rejected
})
test('versión instalada móvil procede del binario y escritorio del puente, nunca del bundle web', async () => {
  for (const [os, bridge, ua, expected] of [
    ['ios', undefined, '', { platform: 'ios', version: '1.10.0' }],
    ['web', { version: async () => '1.12.0' }, 'Windows NT', { platform: 'windows', version: '1.12.0' }],
    ['web', undefined, 'iPhone', { platform: 'web', version: '1.15.0' }],
  ]) {
    const api = moduleAt('src/services/instalacionActual.ts', {
      'react-native': { Platform: { OS: os } }, 'expo-constants': { __esModule: true, default: { expoConfig: { version: '1.15.0' } } },
      'expo-application': { nativeApplicationVersion: '1.10.0' }, './politicaActualizacion': core,
    }, { globalThis: { dnmusicEscritorio: bridge, navigator: { userAgent: ua } } })
    assert.deepEqual(await api.obtenerInstalacion(), expected)
  }
})

test('el panel admin ignora carga inicial tardía tras salir y permite reintentar un fallo', async () => {
  const first = deferred(); let request = first.promise
  const f = uiFixture('src/ui/AdministrarActualizaciones.tsx', {
    './Ajustes': { GrupoAjustes: 'GrupoAjustes', FilaAccion: 'FilaAccion', FilaDato: 'FilaDato', FilaOpciones: 'FilaOpciones', FilaTexto: 'FilaTexto', FilaInterruptor: 'FilaInterruptor' }, './Confirmar': { Confirmar: 'Confirmar' },
    '../state/session': {}, '../services/politicaActualizacion': core,
    '../services/actualizacionesRemotas': { listarPoliticas: () => request },
    '../state/politicaActualizacion': {},
  }, ['PanelPoliticas'])
  let ui = f.render('PanelPoliticas')
  // Mientras consulta, la fila está ocupada —con su rueda— y no dice «sin publicar».
  assert.equal(ui.find(n => n.props?.rotulo === 'Recargar políticas').props.busy, true)
  assert.equal(ui.find(n => n.props?.rotulo === 'Publicado').props.valor, 'Consultando…')
  const cleanup = f.effects.shift()()
  first.reject(Error('RPC missing')); await tick()
  ui = f.render('PanelPoliticas')
  assert.ok(ui.some(n => n.type === 'GrupoAjustes' && /RPC missing/.test(n.props.error ?? '')))
  request = Promise.resolve([policy()])
  ui.find(n => n.props?.rotulo === 'Recargar políticas').props.onPress()
  await tick()
  ui = f.render('PanelPoliticas')
  assert.equal(ui.find(n => n.props?.rotulo === 'Publicado').props.valor, 'Revisión 1 · activa')
  assert.ok(ui.some(n => n.props?.actual?.revision === 1))
  cleanup()
  // Another mount: completion after cleanup cannot reveal private data.
  const late = deferred()
  const g = uiFixture('src/ui/AdministrarActualizaciones.tsx', {
    './Ajustes': { GrupoAjustes: 'GrupoAjustes', FilaAccion: 'FilaAccion', FilaDato: 'FilaDato', FilaOpciones: 'FilaOpciones', FilaTexto: 'FilaTexto', FilaInterruptor: 'FilaInterruptor' }, './Confirmar': {}, '../state/session': {},
    '../services/politicaActualizacion': core,
    '../services/actualizacionesRemotas': { listarPoliticas: () => late.promise },
    '../state/politicaActualizacion': {},
  }, ['PanelPoliticas'])
  g.render('PanelPoliticas'); g.effects.shift()()()
  late.resolve([policy()]); await tick()
  assert.equal(g.render('PanelPoliticas').some(n => n.props?.actual), false)
})
