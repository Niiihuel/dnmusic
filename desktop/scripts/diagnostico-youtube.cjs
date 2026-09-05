// Modos independientes, sin credenciales de dnmusic ni aportes a Storage.
const { leerOpciones, AYUDA } = require('../dist/diagnostico-opciones.js')
let opciones
try { opciones = leerOpciones(process.argv.slice(2)) }
catch (e) { console.error(e.message); process.exit(2) }
if (opciones.ayuda) { console.log(AYUDA); process.exit(0) }
if (!process.versions.electron) {
  console.error('Ejecutá este diagnóstico con npm run diagnostico:youtube -- [opciones].')
  process.exit(2)
}

const { app } = require('electron')
const fs = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { createHash } = require('node:crypto')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const { describirError } = require('../dist/diagnostico-error.js')
const started = Date.now()
const informe = {
  esquema: 1, inicio: new Date(started).toISOString(),
  prueba: { modo: opciones.modo, videoId: opciones.videoId, consulta: opciones.consulta,
    cliente: opciones.cliente ?? 'auto', chunkBytes: opciones.chunkBytes, timeoutSegundos: opciones.timeout },
  entorno: { plataforma: process.platform, arquitectura: process.arch, electron: process.versions.electron,
    chromium: process.versions.chrome, node: process.versions.node, youtubei: require('youtubei.js/package.json').version },
  eventos: [],
}
let archivo
try { if (opciones.json) archivo = fs.openSync(opciones.json, 'wx', 0o600) }
catch (e) { console.error(`No se puede crear el informe (${e.code}). Elegí un archivo nuevo.`); app.exit(2) }
const perfil = fs.mkdtempSync(join(tmpdir(), 'dnmusic-diagnostico-'))
app.setPath('userData', perfil)
const controller = new AbortController()
let cerrar = () => {}
let terminado = false
let etapa = 'inicio'
const evento = dato => {
  if (terminado) return
  etapa = dato.etapa
  const entrada = { ms: Date.now() - started, ...dato }
  informe.eventos.push(entrada)
  console.log(JSON.stringify(entrada))
}
const terminar = (resultado, error) => {
  if (terminado) return
  terminado = true
  clearTimeout(timer)
  informe.duracionMs = Date.now() - started
  informe.ok = !error
  if (error) informe.error = { etapa, ...describirError(error) }
  else informe.resultado = resultado
  controller.abort()
  cerrar()
  let code = error ? 1 : 0
  try { if (archivo !== undefined) fs.writeFileSync(archivo, JSON.stringify(informe, null, 2) + '\n') }
  catch { console.error('No se pudo escribir el informe.'); code = 2 }
  finally { if (archivo !== undefined) fs.closeSync(archivo) }
  console.log(JSON.stringify(error ? informe.error : resultado))
  // El cierre del perfil puede demorarse en Windows; no debe borrar el resultado del diagnóstico.
  app.once('quit', () => {
    try { fs.rmSync(perfil, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }) } catch {}
  })
  app.exit(code)
}
const timer = setTimeout(() => terminar(null, new DOMException('Diagnóstico agotó el plazo', 'TimeoutError')), opciones.timeout * 1000)
process.once('SIGINT', () => terminar(null, new DOMException('Cancelado', 'AbortError')))

app.whenReady().then(async () => {
  informe.entorno.gpu = app.getGPUFeatureStatus()
  if (opciones.modo === 'entorno') return informe.entorno
  const { Log, Innertube, ClientType } = require('youtubei.js')
  Log.setLevel(Log.Level.NONE)
  const { acunarEnNavegador, cerrarTokens, userAgentTokens } = require('../dist/potoken-navegador.js')
  cerrar = cerrarTokens
  process.env.DNMUSIC_YT_USER_AGENT = userAgentTokens()
  if (opciones.modo === 'buscar') {
    etapa = 'busqueda'
    const { fetchYt, UA_NAVEGADOR } = require('../dist/salida.js')
    const yt = await Innertube.create({ client_type: ClientType.MUSIC, retrieve_player: false,
      retrieve_innertube_config: false, generate_session_locally: false, user_agent: UA_NAVEGADOR,
      fetch: (input, init) => fetchYt(input, { ...init, signal: controller.signal }) })
    const res = await yt.music.search(opciones.consulta, { type: 'song' })
    return { resultados: (res.songs?.contents ?? []).slice(0, 10).map(item => ({
      videoId: item.id, titulo: item.title, artista: item.artists?.map(a => a.name).join(', '),
    })) }
  }
  const { configurarProveedorTokens } = require('../dist/potoken.js')
  configurarProveedorTokens(async binding => {
    const inicio = Date.now()
    etapa = 'token'
    const token = await acunarEnNavegador(binding)
    evento({ etapa: 'token', estado: 'generado', duracionMs: Date.now() - inicio })
    return token
  })
  if (opciones.modo === 'token') {
    etapa = 'token'
    await acunarEnNavegador(opciones.videoId)
    return { generado: true, aceptacionCDN: 'no_comprobada' }
  }
  const { descargarAudio, inspeccionarAudio } = require('../dist/resolutor.js')
  const config = { cliente: opciones.cliente, signal: controller.signal,
    chunkBytes: opciones.chunkBytes, onEvento: evento }
  if (opciones.modo === 'formatos') return inspeccionarAudio(opciones.videoId, config)
  const audio = await descargarAudio(opciones.videoId, config)
  const resultado = { bytes: audio.bytes.length, durationMs: audio.durationMs,
    sha256: createHash('sha256').update(audio.bytes).digest('hex') }
  if (opciones.ffprobe) {
    etapa = 'validacion_audio'
    const ruta = join(perfil, 'audio.m4a')
    fs.writeFileSync(ruta, audio.bytes)
    try {
      const { stdout } = await promisify(execFile)(opciones.ffprobe, [
        '-v', 'error', '-show_entries', 'stream=codec_name,codec_type:format=duration', '-of', 'json', ruta,
      ], { timeout: 15000, signal: controller.signal, maxBuffer: 1024 * 1024 })
      const info = JSON.parse(stdout)
      const streams = info.streams ?? []
      const durationMs = Math.round(Number(info.format?.duration) * 1000)
      if (!streams.length || streams.some(s => s.codec_type !== 'audio' || s.codec_name !== 'aac')
        || !Number.isFinite(durationMs) || durationMs <= 0
        || (audio.durationMs > 0 && Math.abs(durationMs - audio.durationMs) > 7000)) {
        throw new Error('ffprobe: códec o duración inesperados')
      }
      resultado.validacion = { codec: 'aac', durationMs, diferenciaMs: durationMs - audio.durationMs }
    } catch (e) { throw new Error('ffprobe no validó el audio', { cause: e }) }
    finally { fs.rmSync(ruta, { force: true }) }
  }
  return resultado
}).then(resultado => terminar(resultado), error => terminar(null, error))
