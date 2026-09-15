import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
/* La escala de Apple de verdad: la prueba mide lo que mide la app. */
const MEDIDAS = JSON.parse(readFileSync('src/ui/apple.json', 'utf8')).texto
const texto = e => ({ fontSize: MEDIDAS[e].size, lineHeight: MEDIDAS[e].leading, letterSpacing: MEDIDAS[e].tracking })


function cargar(path, deps, globals = {}, extra = '') {
  const source = ts.transpileModule(readFileSync(path, 'utf8') + extra, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText
  const exports = {}
  new Function('exports', 'require', ...Object.keys(globals), source)(exports, id => {
    assert.ok(id in deps, `Dependencia sin simular: ${id}`)
    return deps[id]
  }, ...Object.values(globals))
  return exports
}
const bytes = new Uint8Array([0, 0, 0, 20, 102, 116, 121, 112]).buffer
const asset = { uri: 'file:///cache/exportado.mp4', fileName: 'IMG_1234.MOV', mimeType: 'video/quicktime', type: 'video', width: 720, height: 1280 }
function picker({ os = 'ios', elegido = asset, size = bytes.byteLength, canceled = false, error, readError } = {}) {
  let options, reads = 0, paths = []
  const api = cargar('src/lib/pickImage.ts', {
    'react-native': { Platform: { OS: os } },
    'expo-image-picker': {
      VideoExportPreset: { H264_1280x720: 6 },
      async launchImageLibraryAsync(o) {
        options = o
        if (error) throw error
        return { canceled, assets: canceled ? null : [elegido] }
      },
      requestMediaLibraryPermissionsAsync() { assert.fail('PHPicker con exportación no debe bloquearse por permiso global de Fotos') },
    },
    'expo-file-system': { File: class {
      constructor(uri) { paths.push(uri) }
      get size() { return size }
      async arrayBuffer() { reads++; if (readError) throw readError; return size === 0 ? new ArrayBuffer(0) : bytes }
    } },
  }, { fetch() { assert.fail('No leer file:// mediante fetch/Blob de React Native') } })
  return { ...api, get options() { return options }, get reads() { return reads }, paths }
}

test('iOS exporta el video de PHPicker a H.264 con descarga de iCloud y conserva los bytes MP4', async () => {
  const h = picker()
  const result = await h.pickImage({ conVideo: true })
  assert.equal(h.options.videoExportPreset, 6)
  assert.equal(h.options.shouldDownloadFromNetwork, true)
  assert.equal(h.options.allowsEditing, false)
  assert.deepEqual(h.options.mediaTypes, ['images', 'videos'])
  assert.equal(result.mime, 'video/mp4', 'manda el formato exportado, no el original MOV')
  assert.equal(result.fileName, 'exportado.mp4')
  assert.equal(result.blob, bytes)
  assert.equal(result.uri, asset.uri)
  assert.equal(result.alto, 1280 / 720)
  assert.deepEqual(h.paths, [asset.uri])
})

test('MOV sin nombre/MIME conserva video/quicktime; metadatos genéricos no lo convierten a JPEG', async () => {
  const h = picker({ elegido: { ...asset, uri: 'file:///cache/CLIP.MOV', fileName: null, mimeType: 'text/plain' } })
  const result = await h.pickImage({ conVideo: true })
  assert.equal(result.mime, 'video/quicktime')
  assert.equal(result.fileName, 'CLIP.MOV')
})

test('MIME de video sin extensión sigue siendo video; formato indeterminado falla explícitamente', async () => {
  const h = picker({ elegido: { ...asset, uri: 'file:///cache/exportado', fileName: 'Clip', mimeType: ' VIDEO/MP4; codecs=avc1 ' } })
  assert.equal((await h.pickImage({ conVideo: true })).mime, 'video/mp4')
  const desconocido = picker({ elegido: { ...asset, uri: 'file:///cache/exportado', fileName: null, mimeType: null } })
  await assert.rejects(desconocido.pickImage({ conVideo: true }), /formato del video/)
})

test('rechaza más de 25 MB antes de leerlos en JS y rechaza archivos vacíos', async () => {
  const grande = picker({ size: 25 * 1024 * 1024 + 1 })
  await assert.rejects(grande.pickImage({ conVideo: true }), /25 MB/)
  assert.equal(grande.reads, 0)
  await assert.rejects(picker({ size: 0 }).pickImage({ conVideo: true }), /vacío/)
})

test('cancelar no lee archivos; fallos de iCloud y lectura llegan al editor', async () => {
  const cancelado = picker({ canceled: true })
  assert.equal(await cancelado.pickImage({ conVideo: true }), null)
  assert.equal(cancelado.reads, 0)
  for (const options of [{ error: new Error('iCloud sin conexión') }, { readError: new Error('archivo no disponible') }]) {
    await assert.rejects(picker(options).pickImage({ conVideo: true }), options.error ?? options.readError)
  }
})

test('las fotos/GIF y Android mantienen sus opciones sin exportación iOS', async () => {
  for (const options of [{ os: 'ios', conVideo: false }, { os: 'android', conVideo: true }]) {
    const h = picker({ ...options, elegido: { ...asset, type: 'image', uri: 'file:///cache/animado.gif', mimeType: 'image/gif' } })
    assert.equal((await h.pickImage({ conVideo: options.conVideo })).mime, 'image/gif')
    assert.equal(h.options.videoExportPreset, undefined)
    assert.equal(h.options.allowsEditing, false)
  }
})

function storage({ evento = 'load', status = 200, signedError } = {}) {
  const requests = [], subidas = [], firmadas = []
  const bucket = {
    async upload(...args) { subidas.push(args); return {} },
    async createSignedUploadUrl(path) {
      firmadas.push(path)
      return signedError ? { error: signedError } : { data: { signedUrl: 'https://storage.invalid/upload?token=simulado' } }
    },
    getPublicUrl(path) { return { data: { publicUrl: `https://storage.invalid/${path}` } } },
  }
  const api = cargar('src/services/showcases.ts', {
    '../lib/artwork': {}, '../lib/tema': {},
    './storageBudget': { assertStorageBudget: async () => {} },
    '../lib/supabase': { SUPABASE_ANON_KEY: 'simulada', getSupabase: () => ({
      storage: { from(name) { assert.equal(name, 'showcases'); return bucket } },
      auth: { getSession: async () => ({ data: { session: { access_token: 'simulado' } } }) },
    }) },
  }, { XMLHttpRequest: class {
    upload = {}; headers = {}; status = status
    constructor() { requests.push(this) }
    open(method, url) { this.method = method; this.url = url }
    setRequestHeader(k, v) { this.headers[k] = v }
    send(body) {
      this.body = body
      this.upload.onprogress?.({ lengthComputable: true, loaded: 4, total: 8 })
      this.upload.onprogress?.({ lengthComputable: true, loaded: 8, total: 8 })
      queueMicrotask(() => this[`on${evento}`]())
    }
  } })
  return { ...api, requests, subidas, firmadas }
}

test('ambas subidas mantienen MIME, extensión reproducible y ArrayBuffer sin FormData', async () => {
  for (const [name, mime, ext] of [['Clip', 'video/mp4', 'mp4'], ['original.MOV', 'video/mp4', 'mp4'], ['original.mp4', 'video/quicktime', 'mov']]) {
    const h = storage(), progreso = []
    const simple = await h.uploadIlustracion('owner', bytes, name, mime)
    const path = await h.uploadIlustracionConProgreso('owner', bytes, name, mime, p => progreso.push(p))
    assert.ok(simple.endsWith(`.${ext}`)); assert.ok(path.endsWith(`.${ext}`))
    assert.equal(h.esVideo(path), true)
    assert.equal(h.subidas[0][1], bytes)
    assert.equal(h.subidas[0][2].contentType, mime)
    assert.equal(h.requests[0].body, bytes)
    assert.equal(h.requests[0].headers['Content-Type'], mime)
    assert.equal(h.requests[0].method, 'PUT')
    assert.deepEqual(progreso, [.5, .99, 1])
  }
})

test('la selección iOS atraviesa subida y detección de render como MP4', async () => {
  const file = await picker().pickImage({ conVideo: true })
  const h = storage()
  const path = await h.uploadIlustracionConProgreso('owner', file.blob, file.fileName, file.mime, () => {})
  assert.equal(h.esVideo(h.ilustracionUrl(path)), true)
  assert.equal(h.requests[0].headers['Content-Type'], 'video/mp4')
})

test('videos con query/hash se detectan; imágenes nunca son videos', () => {
  const h = storage()
  assert.equal(h.esVideo('owner/clip.MOV?token=abc#preview'), true)
  assert.equal(h.esVideo('owner/clip.mp4?cache=1'), true)
  assert.equal(h.esVideo('owner/image.gif?nombre=clip.mp4'), false)
})

test('subidas fallidas, abortadas y sin respuesta no marcan finalización', async () => {
  for (const options of [{ evento: 'error' }, { evento: 'timeout' }, { evento: 'abort' }, { status: 415 }]) {
    const h = storage(options), progreso = []
    await assert.rejects(h.uploadIlustracionConProgreso('owner', bytes, 'clip.mov', 'video/quicktime', p => progreso.push(p)))
    assert.ok(!progreso.includes(1))
    assert.equal(h.requests[0].timeout, 120_000)
  }
  const h = storage({ signedError: new Error('storage no disponible') })
  await assert.rejects(h.uploadIlustracionConProgreso('owner', bytes, 'clip.mov', 'video/quicktime', () => {}), /storage no disponible/)
  assert.equal(h.requests.length, 0)
})

test('subida rechaza bytes vacíos, tamaño excedido y MIME no admitido antes de firmar', async () => {
  const h = storage()
  for (const [body, mime] of [[new ArrayBuffer(0), 'video/mp4'], [new ArrayBuffer(25 * 1024 * 1024 + 1), 'video/mp4'], [bytes, 'text/plain']]) {
    await assert.rejects(h.uploadIlustracionConProgreso('owner', body, 'clip.mp4', mime, () => {}))
  }
  assert.equal(h.firmadas.length, 0)
})

const jsx = (type, props, key) => ({ type, props, key })
function fondo() {
  let activa = true, i = 0, play = 0, pause = 0, initialized = false
  const states = [], effects = [], listeners = new Set()
  const player = { status: 'loading', play() { play++ }, pause() { pause++ }, addListener(event, fn) {
    assert.equal(event, 'statusChange'); listeners.add(fn); return { remove: () => listeners.delete(fn) }
  } }
  const react = {
    useState(value) { const n = i++; if (!(n in states)) states[n] = value; return [states[n], v => { states[n] = v }] },
    useEffect(fn, deps) {
      const n = i++, previous = effects[n]
      if (!previous || deps.some((d, k) => !Object.is(d, previous.deps[k]))) {
        previous?.cleanup?.(); effects[n] = { deps, cleanup: fn() }
      }
    },
  }
  const source = readFileSync('src/ui/PerfilPublico.tsx', 'utf8')
  const ast = ts.createSourceFile('perfil.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const names = ['FondoClip', 'FondoPerfil', 'hayFondo']
  const fragment = ast.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name.text)).map(n => n.getText(ast)).join('\n')
  const code = ts.transpileModule(fragment + '\nexport { FondoClip }', { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const globals = { ...react, useAppActiva: () => activa, useVideoPlayer(uri, setup) {
    if (!initialized) { setup(player); initialized = true }
    return player
  }, VideoView: 'VideoView', View: 'View', Text: 'Text', LinearGradient: 'Gradient', EfectoPerfil: 'Efecto', FondoImagen: 'FondoImagen',
  ilustracionUrl: path => `https://storage.invalid/${path}`, esVideo: storage().esVideo, texto }
  const exports = {}
  new Function('exports', 'require', ...Object.keys(globals), code)(exports, () => ({ jsx, jsxs: jsx }), ...Object.values(globals))
  return { player, listeners, get play() { return play }, get pause() { return pause },
    active(v) { activa = v }, render(props = { uri: asset.uri, animado: true }) { i = 0; return exports.FondoClip(props) },
    status(v) { player.status = v; for (const listener of listeners) listener() },
    unmount() { for (const effect of effects) effect?.cleanup?.() }, exports,
  }
}

test('VideoView nativo es mudo, en bucle, inline y reanuda al cargar o volver al primer plano', () => {
  const h = fondo(), ui = h.render()
  assert.equal(ui.type, 'VideoView')
  assert.equal(ui.props.nativeControls, false)
  assert.equal(ui.props.playsInline, true)
  assert.equal(ui.props.contentFit, 'cover')
  assert.equal(h.player.muted, true)
  assert.equal(h.player.loop, true)
  assert.equal(h.player.audioMixingMode, 'mixWithOthers')
  assert.equal(h.player.showNowPlayingNotification, false)
  const initial = h.play
  h.status('readyToPlay'); assert.ok(h.play > initial)
  h.active(false); h.render(); assert.equal(h.pause, 1)
  const paused = h.play
  h.status('readyToPlay'); assert.equal(h.play, paused)
  h.active(true); h.render(); assert.ok(h.play > paused)
  h.render({ uri: asset.uri, animado: false }); assert.equal(h.pause, 2)
  assert.equal(h.listeners.size, 1)
  h.unmount(); assert.equal(h.listeners.size, 0)
})

test('fallo asíncrono de AVPlayer se muestra y se limpia al recuperarse', () => {
  const h = fondo()
  h.render(); h.status('error')
  const ui = h.render()
  assert.equal(ui.props.children.props.accessibilityRole, 'alert')
  assert.match(ui.props.children.props.children, /No se pudo reproducir/)
  h.status('readyToPlay'); assert.equal(h.render().type, 'VideoView')
})

test('FondoPerfil elige VideoView para MOV/MP4 y reinicia el componente al cambiar de clip', () => {
  const h = fondo()
  const first = h.exports.FondoPerfil({ bannerPath: 'owner/a.MOV' }).props.children[0]
  const next = h.exports.FondoPerfil({ bannerPath: 'owner/b.mp4' }).props.children[0]
  assert.equal(first.type, h.exports.FondoClip)
  assert.equal(next.type, h.exports.FondoClip)
  assert.notEqual(first.key, next.key)
  assert.equal(h.exports.FondoPerfil({ bannerPath: 'owner/a.gif' }).props.children[0].type, 'FondoImagen')
})
