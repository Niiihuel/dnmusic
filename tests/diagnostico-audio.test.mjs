import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const compile = path => ts.transpileModule(readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const codigoStore = compile('src/state/store.ts')
const codigo = compile('src/state/diagnosticoAudio.ts')
const CLAVE = 'diagnostico-audio:v1'
const evento = (intento = 1, motivo = 'buffer-sin-progreso') => ({ tipo: 'fallo', motivo, enSegundoPlano: true, intento })
const diferida = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
const tick = () => new Promise(resolve => setImmediate(resolve))

function fixture({ storage = new Map(), read, failWrite = false, failRemove = false } = {}) {
  const store = {}, api = {}, operaciones = []
  const fallos = { write: failWrite, remove: failRemove }
  new Function('exports', 'require', codigoStore)(store, () => ({ useSyncExternalStore: (_subscribe, get) => get() }))
  const asyncStorage = {
    getItem: async key => { operaciones.push(['leer', key]); return read ? read(key) : storage.get(key) ?? null },
    setItem: async (key, value) => { operaciones.push(['guardar', key, value]); if (fallos.write) throw Error('fallo privado'); storage.set(key, value) },
    removeItem: async key => { operaciones.push(['borrar', key]); if (fallos.remove) throw Error('fallo privado'); storage.delete(key) },
  }
  new Function('exports', 'require', codigo)(api, id => {
    if (id === './store') return store
    assert.equal(id, '@react-native-async-storage/async-storage')
    return { __esModule: true, default: asyncStorage }
  })
  return { api, storage, operaciones, fallos }
}

test('persiste sólo los últimos 30 eventos, con timestamp propio, y los recupera al reabrir', async () => {
  const f = fixture(), antes = Date.now()
  await Promise.all(Array.from({ length: 35 }, (_, n) => f.api.registrarIncidenciaAudio({ ...evento(n), titulo: 'No guardar', usuario: 'No guardar' })))
  const filas = f.api.leerDiagnosticoAudio().incidencias
  assert.deepEqual(filas.map(f => f.intento), Array.from({ length: 30 }, (_, i) => i + 5))
  assert.ok(filas.every(f => f.timestamp >= antes && f.timestamp <= Date.now()))
  assert.ok(filas.every(f => !('titulo' in f) && !('usuario' in f)))
  assert.equal(f.operaciones.filter(([tipo]) => tipo === 'leer').length, 1)
  const otra = fixture({ storage: f.storage })
  await otra.api.cargarDiagnosticoAudio()
  assert.deepEqual(otra.api.leerDiagnosticoAudio().incidencias, filas)
})

test('clasifica errores y conserva códigos técnicos sin URLs, JWT, nombres, títulos ni tokens', async () => {
  const f = fixture()
  const secretos = ['tema privado', 'usuario privado', 'secreto123', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.firmaSuperSecreta']
  const texto = `Failed to load tema privado, usuario privado. HTTP 403 AVFoundationErrorDomain Code=-11800 https://host/user/song?token=secreto123 Authorization=Bearer ${secretos[3]} api_key="secreto123"`
  await f.api.registrarIncidenciaAudio(evento(1, texto))
  const motivo = f.api.leerDiagnosticoAudio().incidencias[0].motivo
  assert.match(motivo, /Acceso o firma del audio rechazados/)
  assert.match(motivo, /HTTP 403/)
  assert.match(motivo, /AVFoundationErrorDomain -11800/)
  const persistido = f.storage.get(CLAVE)
  const informe = f.api.crearInformeDiagnosticoAudio()
  for (const secreto of [...secretos, 'https://host', 'Authorization=', 'api_key=']) {
    assert.equal(persistido.includes(secreto), false)
    assert.equal(informe.includes(secreto), false)
  }
  assert.equal(f.api.sanitizarMotivoAudio('Una canción de Ana y su usuario @ana'), 'Incidencia de audio')
  assert.equal(f.api.sanitizarMotivoAudio(motivo), motivo)
})

test('los motivos del motor sobreviven a la persistencia sin perder su categoría', async () => {
  const f = fixture()
  const motivos = ['buffer-sin-progreso', 'renovar-fuente', 'audio-reanudado', 'reintentos-agotados', 'NSURLErrorDomain -1009', 'HTTP 404', 'decoder unsupported', 'network timeout']
  for (const motivo of motivos) await f.api.registrarIncidenciaAudio(evento(2, motivo))
  const guardado = f.api.leerDiagnosticoAudio().incidencias
  const otra = fixture({ storage: f.storage })
  await otra.api.cargarDiagnosticoAudio()
  assert.deepEqual(otra.api.leerDiagnosticoAudio().incidencias, guardado)
  assert.match(f.api.crearInformeDiagnosticoAudio(), /segundo plano \| intento 2/)
})

test('una carga tardía y escrituras en vuelo no resucitan eventos después de borrar', async () => {
  const lectura = diferida()
  const f = fixture({ read: () => lectura.promise })
  const guardarAnterior = f.api.registrarIncidenciaAudio(evento(1))
  const borrar = f.api.limpiarDiagnosticoAudio()
  const guardarNuevo = f.api.registrarIncidenciaAudio(evento(2, 'audio-reanudado'))
  await tick()
  lectura.resolve(JSON.stringify([{ ...evento(0, 'Audio sin avance'), timestamp: 1 }]))
  await Promise.all([guardarAnterior, borrar, guardarNuevo])
  assert.deepEqual(f.api.leerDiagnosticoAudio().incidencias.map(f => f.intento), [2])
  assert.deepEqual(JSON.parse(f.storage.get(CLAVE)).map(f => f.intento), [2])
  const orden = f.operaciones.map(([tipo]) => tipo)
  assert.ok(orden.indexOf('borrar') > orden.indexOf('guardar'))
  assert.equal(orden.at(-1), 'guardar')
})

test('fallos del almacenamiento no rechazan registros ni borran eventos antes de confirmar el borrado local', async () => {
  const f = fixture({ failWrite: true })
  await assert.doesNotReject(f.api.registrarIncidenciaAudio(evento(1)))
  assert.equal(f.api.leerDiagnosticoAudio().incidencias.length, 1)
  assert.match(f.api.leerDiagnosticoAudio().error, /No se pudo guardar/)
  f.fallos.write = false
  await f.api.registrarIncidenciaAudio(evento(2))
  assert.equal(JSON.parse(f.storage.get(CLAVE)).length, 2)
  f.fallos.remove = true
  assert.equal(await f.api.limpiarDiagnosticoAudio(), false)
  assert.equal(f.api.leerDiagnosticoAudio().incidencias.length, 2)
  f.fallos.remove = false
  assert.equal(await f.api.limpiarDiagnosticoAudio(), true)
  assert.deepEqual(f.api.leerDiagnosticoAudio().incidencias, [])
  assert.equal(f.storage.has(CLAVE), false)
})

test('descarta formatos corruptos y elimina campos desconocidos o sensibles al hidratar', async () => {
  const filas = [{ ...evento(1, 'Playback failed for private title'), timestamp: 1, user: 'private user' }, { ...evento(), timestamp: 'ayer' }, { ...evento(), timestamp: 1, tipo: 'desconocido' }]
  const f = fixture({ storage: new Map([[CLAVE, JSON.stringify(filas)]]) })
  await f.api.cargarDiagnosticoAudio()
  assert.equal(f.api.leerDiagnosticoAudio().incidencias.length, 1)
  assert.equal(f.storage.get(CLAVE).includes('private'), false)
  assert.equal(f.storage.get(CLAVE).includes('user'), false)
  const corrupto = fixture({ storage: new Map([[CLAVE, '{invalido']]) })
  await assert.doesNotReject(corrupto.api.cargarDiagnosticoAudio())
  assert.ok(corrupto.api.leerDiagnosticoAudio().cargado)
  await assert.doesNotReject(corrupto.api.registrarIncidenciaAudio(evento()))
  assert.equal(corrupto.api.leerDiagnosticoAudio().incidencias.length, 1)
})
