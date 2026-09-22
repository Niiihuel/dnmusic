import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const source = ts.transpileModule(readFileSync('src/lib/almacenAudio.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
function montar({ desktop, navigatorMock = { onLine: true }, red = { type: 'WIFI', isConnected: true, isInternetReachable: true } } = {}) {
  const files = new Map(), tasks = [], carpetas = new Set(), backups = []
  let libre = 1e9
  class Directory {
    constructor(...parts) { this.uri = parts.map(x => typeof x === 'string' ? x.replace(/\/$/, '') : x.uri.replace(/\/$/, '')).join('/') + '/' }
    create() { carpetas.add(this.uri) }
    list() { return [...files.keys()].filter(k => k.startsWith(this.uri)).map(k => new File(k)) }
  }
  class File {
    constructor(...parts) { this.uri = parts.map(x => typeof x === 'string' ? x.replace(/\/$/, '') : x.uri.replace(/\/$/, '')).join('/') }
    get exists() { return files.has(this.uri) }
    get size() { return files.get(this.uri) ?? 0 }
    get name() { return this.uri.split('/').at(-1) }
    delete() { files.delete(this.uri) }
    move(other) { files.set(other.uri, this.size); files.delete(this.uri); this.uri = other.uri }
    static createDownloadTask(url, dest, options) { const t = new DownloadTask(url, dest, options); tasks.push(t); return t }
    static async downloadFileAsync(_, f) { files.set(f.uri, 12); return f }
  }
  class DownloadTask {
    state = 'idle'
    constructor(url, dest, options) { Object.assign(this, { url, dest, options }) }
    downloadAsync() { this.state = 'active'; this.resultado = new Promise((a, b) => { this.resolve = a; this.reject = b }); return this.resultado }
    resumeAsync() { this.resumed = true; return this.downloadAsync() }
    progress(bytes, totalBytes) { files.set(this.dest.uri, bytes); this.options.onProgress?.({ bytesWritten: bytes, totalBytes }) }
    complete(bytes) { files.set(this.dest.uri, bytes); this.state = 'completed'; this.resolve(this.dest) }
    cancel() { if (this.state === 'active') { this.state = 'cancelled'; this.reject(new Error('cancelada')) } }
    async pauseAsync() { this.state = 'paused'; this.resolve(null); await this.resultado }
    savable() { assert.equal(this.state, 'paused'); return { url: this.url, fileUri: this.dest.uri, resumeData: 'resume', isDirectory: false } }
    release() { this.released = true }
    static fromSavable(state, options) { const t = new DownloadTask(state.url, new File(state.fileUri), options); t.state = 'paused'; tasks.push(t); return t }
  }
  const deps = {
    'react-native': { Platform: { OS: desktop ? 'web' : 'ios' } },
    '../../modules/backup-exclusion': { excluirDeCopias: uri => backups.push(uri) },
    'expo-file-system': { File, Directory, DownloadTask, Paths: { document: 'file:///docs', get availableDiskSpace() { return libre } } },
    'expo-network': { getNetworkStateAsync: async () => red, NetworkStateType: { NONE: 'NONE', UNKNOWN: 'UNKNOWN', WIFI: 'WIFI', ETHERNET: 'ETHERNET' }, addNetworkStateListener: () => ({ remove() {} }) },
  }
  const exports = {}
  new Function('exports', 'require', 'globalThis', 'navigator', source)(exports, k => { assert.ok(k in deps, k); return deps[k] }, desktop ? { dnmusicEscritorio: { audioOffline: desktop } } : {}, navigatorMock)
  return { api: exports, tasks, files, backups, setLibre(v) { libre = v } }
}

test('nativo sólo anuncia final después del movimiento; progreso parcial nunca aparece en listar', async () => {
  const h = montar(); const tarea = h.api.transferirAudio('audio/ruta.m4a', 'signed:url', () => {})
  assert.equal(h.tasks[0].options.sessionType, 'background')
  h.tasks[0].progress(10, 20); assert.deepEqual(await h.api.listarAudio(), [])
  h.tasks[0].complete(20); const final = await tarea.resultado
  assert.equal(final.bytes, 20); assert.equal(final.key, 'audio/ruta.m4a')
  assert.ok(final.uri.includes('audio-audio%2Fruta.m4a'))
  assert.deepEqual(await h.api.listarAudio(), [final]); assert.equal(h.files.size, 1)
  assert.equal(h.backups.length, 1)
})

test('iOS restaura pausa con la misma URL y conserva su parcial', async () => {
  const h = montar(); const a = h.api.transferirAudio('uno.m4a', 'url:vieja', () => {})
  h.tasks[0].progress(10, 20); const pausa = await a.pausar(); assert.equal(await a.resultado, null)
  assert.ok(h.files.has(pausa.fileUri))
  const b = h.api.transferirAudio('uno.m4a', 'url:vieja', () => {}, pausa)
  assert.equal(h.tasks[1].url, 'url:vieja'); assert.equal(h.tasks[1].resumed, true)
  assert.equal(h.tasks[1].dest.uri, pausa.fileUri); assert.ok(h.files.has(pausa.fileUri))
  h.tasks[1].complete(20); assert.equal((await b.resultado).bytes, 20)
})

test('cancelación y falta de reserva limpian parcial y nunca publican un final', async () => {
  const h = montar(); const a = h.api.transferirAudio('uno.m4a', 'url', () => {})
  h.tasks[0].progress(10, 20); a.cancelar(); await assert.rejects(a.resultado)
  assert.equal(h.files.size, 0)
  const b = h.api.transferirAudio('dos.m4a', 'url', () => {})
  h.setLibre(299 * 1024 * 1024); h.tasks[1].complete(20); await assert.rejects(b.resultado, /espacio/)
  assert.deepEqual(await h.api.listarAudio(), []); assert.equal(h.files.size, 0)
})

test('rutas distintas no colisionan; snapshots fuera de la carpeta no se restauran', async () => {
  const h = montar(); const a = h.api.transferirAudio('a/b.m4a', 'url', () => {})
  h.tasks[0].complete(10); await a.resultado
  const b = h.api.transferirAudio('a_b.m4a', 'url', () => {}, { fileUri: 'file:///otro/sensible', resumeData: 'x', isDirectory: false, url: 'x' })
  assert.equal(h.tasks[1].resumed, undefined); h.tasks[1].complete(20); await b.resultado
  assert.equal((await h.api.listarAudio()).length, 2)
})

test('red desconocida/desconectada no se considera WiFi; conexión y tipo son comprobaciones separadas', async () => {
  for (const [state, expected] of [
    [{ type: 'WIFI', isConnected: false }, { conectada: false, segura: true }],
    [{ type: 'UNKNOWN', isConnected: true }, { conectada: true, segura: false }],
    [{ type: 'WIFI', isConnected: true, isInternetReachable: false }, { conectada: false, segura: true }],
    [{ type: 'ETHERNET', isConnected: true }, { conectada: true, segura: true }],
  ]) assert.deepEqual(await montar({ red: state }).api.estadoRedAudio(), expected)
})

test('escritorio usa contrato del puente, filtra progreso y desuscribe al completar/cancelar', async () => {
  let listener, off = 0, calls = 0, cancel = 0
  const puente = { listar: async () => [], descargar: async ({ key }) => { calls++; listener({ key: 'otro', bytesWritten: 1, totalBytes: 2 }); listener({ key, bytesWritten: 2, totalBytes: 2 }); return { key, uri: 'local:bridge', bytes: 2 } }, cancelar: () => cancel++, quitar: async () => {}, alProgreso: fn => { listener = fn; return () => off++ } }
  const h = montar({ desktop: puente }), progresos = []
  assert.equal(h.api.hayAlmacenAudio, true)
  const a = h.api.transferirAudio('uno', 'url', p => progresos.push(p)); assert.equal((await a.resultado).uri, 'local:bridge')
  assert.equal(progresos.length, 1); assert.equal(off, 1)
  const b = h.api.transferirAudio('dos', 'url', () => {}); b.cancelar(); assert.equal(await b.resultado, null)
  assert.equal(calls, 1); assert.equal(off, 2); assert.equal(cancel, 1)
})

test('escritorio Chromium permite tipo ausente con conexión, pero no celular conocida ni desconexión', async () => {
  assert.deepEqual(await montar({ desktop: {}, navigatorMock: { onLine: true } }).api.estadoRedAudio(), { conectada: true, segura: true })
  assert.deepEqual(await montar({ desktop: {}, navigatorMock: { onLine: true, connection: { type: 'cellular' } } }).api.estadoRedAudio(), { conectada: true, segura: false })
  assert.equal((await montar({ desktop: {}, navigatorMock: { onLine: false } }).api.estadoRedAudio()).conectada, false)
})


test('iOS con URL firmada nueva inicia tarea fresh y borra sólo el parcial viejo', async () => {
  const h = montar(); const a = h.api.transferirAudio('uno.m4a', 'url:vieja', () => {})
  h.tasks[0].progress(10, 20); const pausa = await a.pausar(); await a.resultado
  h.files.set('file:///docs/descargas/audio-otra.m4a', 50)
  const b = h.api.transferirAudio('uno.m4a', 'url:nueva', () => {}, pausa)
  assert.equal(h.tasks[1].url, 'url:nueva'); assert.equal(h.tasks[1].resumed, undefined)
  assert.notEqual(h.tasks[1].dest.uri, pausa.fileUri)
  assert.equal(h.files.has(pausa.fileUri), false)
  assert.equal(h.files.get('file:///docs/descargas/audio-otra.m4a'), 50)
  h.tasks[1].complete(20); assert.equal((await b.resultado).bytes, 20)
  assert.equal((await h.api.listarAudio()).length, 2)
})


test('iOS prepara la próxima canción en sesión normal y conserva background para offline', async () => {
 const h = montar()
 const a = h.api.transferirAudio('a.m4a', 'url:a', () => {}, undefined, 'reproduccion')
 assert.equal(h.tasks[0].options.sessionType, 'foreground')
 h.tasks[0].complete(10); await a.resultado
 const b = h.api.transferirAudio('b.m4a', 'url:b', () => {})
 assert.equal(h.tasks[1].options.sessionType, 'background')
 h.tasks[1].complete(10); await b.resultado
})
test('adoptar un parcial offline cambia la sesión al reanudar sin publicar un archivo incompleto', async () => {
 const h = montar()
 const a = h.api.transferirAudio('a.m4a', 'url:a', () => {})
 h.tasks[0].progress(5, 10)
 const pausa = await a.pausar(); await a.resultado
 const b = h.api.transferirAudio('a.m4a', 'url:a', () => {}, pausa, 'reproduccion')
 assert.equal(h.tasks[1].options.sessionType, 'foreground')
 assert.equal(h.tasks[1].resumed, true)
 assert.deepEqual(await h.api.listarAudio(), [])
 h.tasks[1].complete(10); await b.resultado
 assert.equal((await h.api.listarAudio()).length, 1)
})
