import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const MB = 1024 * 1024
const tick = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)) }
const track = (id = 'uno', path = `${id}.m4a`) => ({ id, videoId: id, audioPath: path, title: `Tema ${id}`, artist: 'Artista', artistId: null, artworkUrl: '', artworkPath: null, durationMs: 180000 })
const done = (id, temporal = false, uso = 1, bytes = MB) => ({ ...track(id), estado: 'lista', progreso: 1, bytes, arte: false, temporal, ultimoUso: uso, error: null, intentos: 0, uri: `local:${id}.m4a` })
const source = ts.transpileModule(readFileSync('src/state/descargas.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
function montar({ datos = new Map(), archivos = new Map(), red = { conectada: true, segura: true }, soloWifi = true, leerRed, resolver, guardar, quitar, listar, desktop = false, libre = 5000 * MB } = {}) {
  const jobs = [], resolves = [], timer = new Map(), borrados = [], escritos = []
  let now = 100000, tid = 0, networkChange, settings = soloWifi, free = libre
  const adapter = {
    hayAlmacenAudio: true, escritorioAudio: desktop, RESERVA_AUDIO: 300 * MB,
    audioV1: k => archivos.get(k) ?? null, arteGuardado: () => null, guardarArte: async () => null, quitarPausa: async () => {}, limpiarParciales: async () => {},
    listarAudio: async () => listar ? listar() : [...archivos.values()], espacioLibreAudio: () => free,
    estadoRedAudio: async () => leerRed ? leerRed() : red, escucharRedAudio: cb => { networkChange = cb },
    quitarAudio: async k => { borrados.push(k); if (quitar) await quitar(k); archivos.delete(k) },
    transferirAudio: (key, url, progreso, pausa) => {
      let resolve, reject
      const resultado = new Promise((a, b) => { resolve = a; reject = b })
      const j = { key, url, pausa, progreso, cancelada: false, pausada: false,
        completar(bytes = MB) { const f = { key, uri: `local:${key}`, bytes }; archivos.set(key, f); resolve(f) },
        fallar(e = new Error('falló conexión')) { reject(e) } }
      jobs.push(j)
      return { resultado,
        cancelar() { j.cancelada = true; reject(new Error('cancelada')) },
        async pausar() { j.pausada = true; resolve(null); return { fileUri: 'partial:uno', resumeData: 'snapshot', url, isDirectory: false } },
      }
    },
  }
  const storage = { getItem: async k => datos.get(k) ?? null, setItem: async (k, v) => { escritos.push(JSON.parse(v)); if (guardar) await guardar(k, v); datos.set(k, v) } }
  const deps = {
    '@react-native-async-storage/async-storage': storage,
    '../lib/artwork': { artworkRemoto: () => null, registerArteLocal: () => {} }, '../lib/mensajeError': { mensajeError: e => e.message },
    '../lib/almacenAudio': adapter, '../services/music': { signedUrl: async k => `signed:${k}`, resolveSong: async (t, s) => { resolves.push(t.videoId); return resolver ? resolver(t, s) : { path: `${t.videoId}.m4a`, artworkPath: null } } },
    './ajustes': { leerAjustes: () => ({ soloWifi: settings }) },
    './store': { createStore(initial) { let state = initial; const listeners = new Set(); return { get: () => state, set(patch) { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; for (const f of [...listeners]) f() }, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) } } }, useStore: (s, fn) => fn(s.get()) },
  }
  const exports = {}
  new Function('exports', 'require', 'setTimeout', 'clearTimeout', 'Date', source)(exports, k => { assert.ok(k in deps, `Dependencia no simulada: ${k}`); return deps[k] }, (fn, ms) => { timer.set(++tid, { fn, at: now + ms }); return tid }, id => timer.delete(id), class extends Date { static now() { return now } })
  return { api: exports, jobs, resolves, datos, archivos, borrados, escritos, async iniciar() { await exports.cargarDescargas(); await tick() },
    async avanzar(ms) { now += ms; for (const [id, t] of [...timer]) if (t.at <= now) { timer.delete(id); t.fn() }; await tick() },
    async red(next) { Object.assign(red, next); networkChange?.(); await tick() }, setWifi(v) { settings = v }, setLibre(v) { free = v },
    get items() { return exports.getDescargas().items }, get timers() { return [...timer.values()] } }
}
function persistido(items, cola = Object.keys(items), limiteCacheMB = 250) { return new Map([['descargas:v2', JSON.stringify({ version: 2, items, cola, limiteCacheMB })]]) }

test('inicio único y migración v1: reconcilia archivos, conserva fijadas y restaura faltantes en cola', async () => {
  let listarCount = 0
  const a = { key: 'uno.m4a', uri: 'local:uno', bytes: MB }
  const h = montar({ datos: new Map([['descargas:v1', JSON.stringify([done('uno'), done('dos')])]]), archivos: new Map([['uno.m4a', a]]), listar: async () => { listarCount++; return [a] }, red: { conectada: false, segura: false } })
  const first = h.api.cargarDescargas(); assert.equal(first, h.api.cargarDescargas()); await first; await tick()
  assert.equal(listarCount, 1)
  assert.equal(h.api.rutaLocal('uno.m4a'), 'local:uno')
  assert.equal(h.items['uno.m4a'].temporal, false)
  assert.equal(h.items['dos.m4a'].estado, 'espera')
  assert.equal(h.api.rutaLocal('dos.m4a'), null)
  assert.equal(h.api.getDescargas().esperandoRed, true)
})

test('agregar durante carga no pisa metadatos restaurados', async () => {
  let permitir
  const h = montar({ datos: persistido({ 'uno.m4a': done('uno') }), archivos: new Map([['uno.m4a', { key: 'uno.m4a', uri: 'local:uno', bytes: MB }]]), listar: () => new Promise(r => { permitir = r }) })
  const loading = h.api.cargarDescargas(); h.api.descargar(track('dos')); await tick()
  permitir([{ key: 'uno.m4a', uri: 'local:uno', bytes: MB }]); await loading; await tick()
  assert.ok(h.items['uno.m4a']); assert.ok(h.items['dos.m4a'])
  assert.equal(h.jobs.length, 1)
})

test('sin audioPath conserva identidad video, resuelve una vez y mueve la clave sin perder cola', async () => {
  const h = montar(); await h.iniciar()
  h.api.descargar(track('uno', '')); h.api.descargar(track('uno', '')); await tick()
  assert.deepEqual(h.resolves, ['uno'])
  assert.equal(h.items['video:uno'], undefined)
  h.jobs[0].completar(); await tick()
  assert.equal(h.api.rutaLocal('uno.m4a'), 'local:uno.m4a')
  assert.equal(h.items['uno.m4a'].estado, 'lista')
})

test('error se persiste tras tres intentos con espera exponencial; reintento explícito recupera', async () => {
  const h = montar(); await h.iniciar(); h.api.descargar(track()); await tick()
  h.jobs[0].fallar(); await tick()
  assert.equal(h.items['uno.m4a'].intentos, 1)
  await h.avanzar(999); assert.equal(h.jobs.length, 1)
  await h.avanzar(1); assert.equal(h.jobs.length, 2)
  h.jobs[1].fallar(); await tick(); await h.avanzar(1999); assert.equal(h.jobs.length, 2)
  await h.avanzar(1); h.jobs[2].fallar(); await tick(); await h.avanzar(99999)
  assert.equal(h.jobs.length, 3); assert.equal(h.items['uno.m4a'].estado, 'error')
  const restored = montar({ datos: h.datos }); await restored.iniciar()
  assert.equal(restored.jobs.length, 0); assert.equal(restored.items['uno.m4a'].estado, 'error')
  restored.api.reintentarDescarga('uno.m4a'); await tick(); restored.jobs[0].completar(); await tick()
  assert.equal(restored.items['uno.m4a'].estado, 'lista')
})

test('offline no consume intentos; WiFi desconocida bloquea fijadas pero no caché autorizada', async () => {
  const h = montar({ red: { conectada: false, segura: false } }); await h.iniciar(); h.api.descargar(track('manual')); await tick()
  await h.avanzar(60000); assert.equal(h.jobs.length, 0); assert.equal(h.items['manual.m4a'].intentos, 0)
  await h.red({ conectada: true, segura: false }); assert.equal(h.jobs.length, 0); assert.equal(h.api.getDescargas().esperandoWifi, true)
  const p = h.api.prepararCache(track('cache')); await tick(); assert.equal(h.jobs[0].key, 'cache.m4a')
  h.jobs[0].completar(); assert.equal(await p, 'local:cache.m4a'); await tick()
  await h.red({ segura: true }); assert.equal(h.jobs[1].key, 'manual.m4a')
})

test('pausa/reinicio restaura snapshot y cancelar no elimina completadas', async () => {
  const h = montar(); await h.iniciar(); h.api.descargar(track()); await tick()
  h.api.pausarDescarga('uno.m4a'); await tick()
  assert.equal(h.jobs[0].pausada, true); assert.equal(h.items['uno.m4a'].estado, 'pausada')
  const r = montar({ datos: h.datos }); await r.iniciar(); assert.equal(r.jobs.length, 0)
  r.api.reanudarDescarga('uno.m4a'); await tick(); assert.equal(r.jobs[0].pausa.resumeData, 'snapshot')
  r.jobs[0].completar(); await tick(); r.api.cancelarDescarga('uno.m4a'); await tick()
  assert.equal(r.api.rutaLocal('uno.m4a'), 'local:uno.m4a'); assert.equal(r.borrados.length, 0)
})

test('prioridad pausa y retoma background, conserva completadas y no duplica trabajos', async () => {
  const h = montar(); await h.iniciar(); h.api.descargarLista([track('uno'), track('dos')]); await tick()
  h.api.priorizarReproduccion(true); await tick(); assert.equal(h.jobs[0].pausada, true); assert.equal(h.jobs.length, 1)
  h.api.priorizarReproduccion(false); h.api.priorizarReproduccion(false); await tick(); assert.equal(h.jobs.length, 2)
  h.jobs[1].completar(); await tick(); assert.equal(h.jobs[2].key, 'dos.m4a'); assert.equal(h.items['uno.m4a'].estado, 'lista')
})

test('cancelar resolución tardía no descarga ni resucita entrada', async () => {
  let resolver
  const h = montar({ resolver: () => new Promise(r => { resolver = r }) }); await h.iniciar(); h.api.descargar(track('uno', '')); await tick()
  h.api.cancelarDescarga('video:uno'); await tick(); resolver({ path: 'uno.m4a' }); await tick()
  assert.equal(h.jobs.length, 0); assert.deepEqual(h.items, {})
})

test('commit persistido antes de publicar URI; cancelación durante commit no resucita', async () => {
  let confirmar, bloquear = false
  const h = montar({ guardar: (_, json) => {
    if (bloquear && JSON.parse(json).items['uno.m4a']?.estado === 'lista') { bloquear = false; return new Promise(r => { confirmar = r }) }
  } }); await h.iniciar(); h.api.descargar(track()); await tick(); bloquear = true; h.jobs[0].completar(); await tick()
  assert.equal(h.api.rutaLocal('uno.m4a'), null)
  h.api.cancelarDescarga('uno.m4a'); await tick(); confirmar(); await tick()
  assert.equal(h.api.rutaLocal('uno.m4a'), null); assert.equal(h.archivos.has('uno.m4a'), false)
  const restored = montar({ datos: h.datos, archivos: h.archivos }); await restored.iniciar(); assert.deepEqual(restored.items, {})
})

test('reinicio entre movimiento y commit reconcilia como completa sin descargar otra vez', async () => {
  const parcial = { ...done('uno'), estado: 'bajando', bytes: 0, progreso: .5 }
  const h = montar({ datos: persistido({ 'uno.m4a': parcial }), archivos: new Map([['uno.m4a', { key: 'uno.m4a', uri: 'local:uno', bytes: MB }]]) }); await h.iniciar()
  assert.equal(h.api.rutaLocal('uno.m4a'), 'local:uno'); assert.equal(h.jobs.length, 0)
})

test('caché compartida: dos consumidores, aborto individual y promoción sin segunda descarga', async () => {
  const h = montar(); await h.iniciar(); const a = new AbortController(), b = new AbortController()
  const p1 = h.api.prepararCache(track(), a.signal), p2 = h.api.prepararCache(track(), b.signal); await tick()
  assert.equal(h.jobs.length, 1); a.abort(); assert.equal(await p1, null); assert.equal(h.jobs[0].cancelada, false)
  h.api.descargar(track()); await tick(); assert.equal(h.items['uno.m4a'].temporal, false)
  h.jobs[0].completar(); assert.equal(await p2, 'local:uno.m4a'); await tick(); b.abort(); await tick()
  assert.equal(h.api.rutaLocal('uno.m4a'), 'local:uno.m4a'); assert.equal(h.jobs.length, 1)
})

test('aborto del último consumidor cancela pendiente, pero no archivo ya completo', async () => {
  const h = montar(); await h.iniciar(); const a = new AbortController()
  const p = h.api.prepararCache(track(), a.signal); await tick(); a.abort(); assert.equal(await p, null); await tick()
  assert.equal(h.jobs[0].cancelada, true); assert.deepEqual(h.items, {})
  const b = new AbortController(); const p2 = h.api.prepararCache(track('dos'), b.signal); await tick(); h.jobs[1].completar(); await p2; b.abort(); await tick()
  assert.equal(h.api.rutaLocal('dos.m4a'), 'local:dos.m4a')
})

test('LRU sólo elimina temporales no protegidas, mantiene pins y usa bytes reales', async () => {
  const items = { 'vieja.m4a': done('vieja', true, 1, 4 * MB), 'nueva.m4a': done('nueva', true, 2, 4 * MB), 'pin.m4a': done('pin', false, 0, 6 * MB) }
  const archivos = new Map(Object.entries(items).map(([key, d]) => [key, { key, uri: d.uri, bytes: d.bytes }]))
  const h = montar({ datos: persistido(items, [], 8), archivos }); h.api.protegerDescargas(['nueva.m4a']); await h.iniciar()
  h.api.setLimiteCacheMB(4); await tick()
  assert.deepEqual(h.borrados, ['vieja.m4a']); assert.ok(h.items['pin.m4a']); assert.ok(h.items['nueva.m4a'])
  h.api.limpiarCache(); await tick(); assert.deepEqual(h.borrados, ['vieja.m4a'])
  h.api.protegerDescargas([]); h.api.limpiarCache(); await tick(); assert.equal(h.items['nueva.m4a'], undefined); assert.ok(h.items['pin.m4a'])
})

test('reserva 300 MB impide iniciar y limita consumo durante progreso', async () => {
  const h = montar({ libre: 305 * MB }); await h.iniciar(); h.api.descargar(track()); await tick(); assert.equal(h.jobs.length, 0)
  h.setLibre(500 * MB); h.api.reintentarDescarga('uno.m4a'); await tick(); assert.equal(h.jobs.length, 1)
  h.setLibre(301 * MB); h.jobs[0].progreso({ bytesWritten: MB, totalBytes: 5 * MB }); await tick(); assert.equal(h.jobs[0].cancelada, true)
  assert.equal(h.api.rutaLocal('uno.m4a'), null)
})

test('límites por dispositivo y preferencia editada durante init no se sobrescriben', async () => {
  const h = montar({ desktop: true }); assert.equal(h.api.getLimiteCacheMB(), 1024)
  h.api.setLimiteCacheMB(100); await h.iniciar(); assert.equal(h.api.getLimiteCacheMB(), 100)
  const m = montar(); assert.equal(m.api.getLimiteCacheMB(), 250)
})

test('quitar archivo en reproducción difiere borrado hasta liberar protección; puede fijarse otra vez', async () => {
  const f = { key: 'uno.m4a', uri: 'local:uno', bytes: MB }
  const h = montar({ datos: persistido({ 'uno.m4a': done('uno') }), archivos: new Map([['uno.m4a', f]]) })
  h.api.protegerDescargas(['uno.m4a']); await h.iniciar()
  h.api.quitarDescarga('uno.m4a'); await tick(); assert.equal(h.api.rutaLocal('uno.m4a'), f.uri); assert.equal(h.borrados.length, 0)
  h.api.descargar(track()); await tick(); h.api.protegerDescargas([]); await tick()
  assert.equal(h.borrados.length, 0); assert.equal(h.items['uno.m4a'].temporal, false)
  h.api.protegerDescargas(['uno.m4a']); h.api.quitarDescarga('uno.m4a'); await tick(); h.api.protegerDescargas([]); await tick()
  assert.deepEqual(h.borrados, ['uno.m4a']); assert.equal(h.api.rutaLocal('uno.m4a'), null)
})

test('promoción durante borrado no promete una URI eliminada y reencola la intención fijada', async () => {
  let borrar
  const h = montar({ datos: persistido({ 'uno.m4a': done('uno', true) }), archivos: new Map([['uno.m4a', { key: 'uno.m4a', uri: 'local:uno', bytes: MB }]]), quitar: () => new Promise(r => { borrar = r }) })
  await h.iniciar(); h.api.limpiarCache(); await tick(); assert.equal(h.api.rutaLocal('uno.m4a'), null)
  h.api.descargar(track()); await tick(); borrar(); await tick()
  assert.equal(h.items['uno.m4a'].temporal, false); assert.equal(h.jobs.length, 1)
  h.jobs[0].completar(); await tick(); assert.equal(h.api.rutaLocal('uno.m4a'), 'local:uno.m4a')
})

test('fallo de lectura no sobrescribe catálogo y permite recuperar la hidratación en otro intento', async () => {
  const datos = new Map([['descargas:v2', '{incompleto']])
  const h = montar({ datos }); await h.api.cargarDescargas(); await tick()
  assert.equal(h.api.useDescargasCargadas(), false); assert.match(h.api.useDescargasError(), /recuperar/); assert.equal(h.escritos.length, 0)
  h.api.descargar(track()); await tick(); assert.equal(h.escritos.length, 0)
  datos.set('descargas:v2', JSON.stringify({ version: 2, items: {}, cola: [] })); await h.iniciar()
  assert.equal(h.api.useDescargasCargadas(), true); assert.equal(h.api.useDescargasError(), null)
})

test('red perdida pausa sin consumir intentos y retoma al reconectar', async () => {
  const h = montar(); await h.iniciar(); h.api.descargar(track()); await tick()
  await h.red({ conectada: false }); assert.equal(h.jobs[0].pausada, true); assert.equal(h.items['uno.m4a'].intentos, 0)
  assert.equal(h.api.getDescargas().esperandoRed, true)
  await h.red({ conectada: true }); assert.equal(h.jobs.length, 2); h.jobs[1].completar(); await tick()
  assert.equal(h.items['uno.m4a'].estado, 'lista')
})

test('rutaLocal es lookup puro; marcarAudioUsado registra LRU desde el efecto', async () => {
  const h = montar({ datos: persistido({ 'uno.m4a': done('uno', true, 1) }), archivos: new Map([['uno.m4a', { key: 'uno.m4a', uri: 'local:uno', bytes: MB }]]) }); await h.iniciar()
  const writes = h.escritos.length, estado = h.api.getDescargas()
  for (let i = 0; i < 50; i++) assert.equal(h.api.rutaLocal('uno.m4a'), 'local:uno')
  await tick(); assert.equal(h.escritos.length, writes); assert.equal(h.api.getDescargas(), estado)
  h.api.marcarAudioUsado('uno.m4a'); await tick()
  assert.equal(h.items['uno.m4a'].ultimoUso, 100000); assert.equal(h.escritos.length, writes + 1)
})

test('precarga abortada todavía protegida no arranca después; liberar protección cancela huérfana', async () => {
  const h = montar(); await h.iniciar(); const c = new AbortController()
  h.api.protegerDescargas(['uno.m4a']); h.api.priorizarReproduccion(true)
  const p = h.api.prepararCache(track(), c.signal); await tick(); c.abort(); assert.equal(await p, null)
  h.api.priorizarReproduccion(false); await tick(); assert.equal(h.jobs.length, 0)
  assert.ok(h.items['uno.m4a'])
  h.api.protegerDescargas(['dos.m4a']); await tick(); assert.equal(h.items['uno.m4a'], undefined); assert.equal(h.jobs.length, 0)
})

test('restaurar caché pendiente espera un consumidor nuevo; una descarga fijada sigue autónoma', async () => {
  const items = { 'uno.m4a': { ...done('uno', true), estado: 'bajando', uri: undefined }, 'dos.m4a': { ...done('dos'), estado: 'espera', uri: undefined } }
  const h = montar({ datos: persistido(items) }); await h.iniciar(); assert.equal(h.jobs[0].key, 'dos.m4a')
  h.jobs[0].completar(); await tick(); assert.equal(h.jobs.length, 1)
  const p = h.api.prepararCache(track()); await tick(); assert.equal(h.jobs[1].key, 'uno.m4a'); h.jobs[1].completar(); assert.equal(await p, 'local:uno.m4a')
})

test('pausar durante comprobación de red posterior a fallo no se convierte en reintento automático', async () => {
  let comprobar, consultas = 0
  const h = montar({ leerRed: async () => ++consultas === 2 ? new Promise(r => { comprobar = r }) : { conectada: true, segura: true } })
  await h.iniciar(); h.api.descargar(track()); await tick(); h.jobs[0].fallar(); await tick()
  h.api.pausarDescarga('uno.m4a'); await tick(); comprobar({ conectada: true, segura: true }); await tick(); await h.avanzar(60000)
  assert.equal(h.items['uno.m4a'].estado, 'pausada'); assert.equal(h.jobs.length, 1)
})

test('motor y fragmento protegen la unión; borrado diferido espera al último propietario', async () => {
  const items = { 'uno.m4a': done('uno', true), 'dos.m4a': done('dos', true) }
  const archivos = new Map(Object.entries(items).map(([key, d]) => [key, { key, uri: d.uri, bytes: d.bytes }]))
  const h = montar({ datos: persistido(items), archivos }), fragmento = Symbol('fragmento')
  h.api.protegerDescargas(['uno.m4a'])
  h.api.protegerDescargas(['uno.m4a', 'dos.m4a'], fragmento)
  await h.iniciar(); h.api.limpiarCache(); await tick(); assert.deepEqual(h.borrados, [])
  h.api.protegerDescargas([]); await tick()
  assert.deepEqual(h.borrados, []); assert.ok(h.api.rutaLocal('uno.m4a')); assert.ok(h.api.rutaLocal('dos.m4a'))
  h.api.protegerDescargas(['dos.m4a'], fragmento); await tick()
  assert.deepEqual(h.borrados, ['uno.m4a']); assert.ok(h.api.rutaLocal('dos.m4a'))
  h.api.protegerDescargas([], fragmento); await tick()
  assert.deepEqual(h.borrados, ['uno.m4a', 'dos.m4a']); assert.deepEqual(h.items, {})
})

test('propietarios Symbol con mismo nombre no se pisan; LRU espera la liberación de ambos', async () => {
  const h = montar({ datos: persistido({ 'uno.m4a': done('uno', true) }), archivos: new Map([['uno.m4a', { key: 'uno.m4a', uri: 'local:uno', bytes: MB }]]) })
  const a = Symbol('fragmento'), b = Symbol('fragmento')
  const rutas = ['uno.m4a']
  h.api.protegerDescargas(rutas, a); h.api.protegerDescargas(['uno.m4a'], b); rutas.length = 0
  await h.iniciar(); h.api.setLimiteCacheMB(0); await tick(); assert.deepEqual(h.borrados, [])
  h.api.protegerDescargas([], a); await tick(); assert.deepEqual(h.borrados, [])
  h.api.protegerDescargas([], 'motor'); await tick(); assert.deepEqual(h.borrados, [])
  h.api.protegerDescargas([], b); await tick(); assert.deepEqual(h.borrados, ['uno.m4a'])
})
