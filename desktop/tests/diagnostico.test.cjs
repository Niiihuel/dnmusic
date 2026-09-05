const { test } = require('node:test')
const assert = require('node:assert/strict')
const { leerOpciones, identificarVideo } = require('../dist/diagnostico-opciones.js')
const { describirError } = require('../dist/diagnostico-error.js')
const { evaluarPlayer } = require('../dist/evaluar-player.js')
const { ErrorDescargaYouTube } = require('../dist/descarga-youtube.js')

test('acepta ID, watch, shorts y enlace corto, sin aceptar hosts ajenos', () => {
  for (const input of ['nhys3nF4ZDU', 'https://youtu.be/nhys3nF4ZDU?t=5',
    'https://music.youtube.com/watch?v=nhys3nF4ZDU', 'https://www.youtube.com/shorts/nhys3nF4ZDU']) {
    assert.equal(identificarVideo(input), 'nhys3nF4ZDU')
  }
  for (const input of ['https://youtube.com.example.test/watch?v=nhys3nF4ZDU',
    'javascript:alert(1)', 'https://example.test/nhys3nF4ZDU', 'abc']) assert.throws(() => identificarVideo(input))
})

test('opciones de diagnóstico mantienen compatibilidad y admiten modos separados', () => {
  assert.equal(leerOpciones(['nhys3nF4ZDU']).modo, 'descarga')
  assert.equal(leerOpciones(['--modo', 'entorno']).videoId, undefined)
  assert.equal(leerOpciones(['--modo', 'buscar', '--consulta', 'Reflections']).consulta, 'Reflections')
  const o = leerOpciones(['nhys3nF4ZDU', '--cliente', 'MWEB', '--chunk-kib', '512', '--timeout', '60', '--json', 'test.json'])
  assert.equal(o.chunkBytes, 524288)
  assert.equal(o.cliente, 'MWEB')
  assert.equal(o.timeout, 60)
})

for (const args of [[], ['--modo', 'buscar'], ['--timeout', '0'], ['--desconocido'],
  ['nhys3nF4ZDU', '--cliente', 'IOS'], ['--modo', 'entorno', '--chunk-kib', '64'],
  ['--modo', 'entorno', '--consulta', 'a'], ['nhys3nF4ZDU', '--json'],
  ['nhys3nF4ZDU', '--timeout', '60', '--timeout', '90']]) {
  test(`rechaza argumentos incompletos o incompatibles: ${args.join(' ') || '(vacío)'}`, () => assert.throws(() => leerOpciones(args)))
}

test('los informes de error no incluyen mensajes, URLs ni credenciales de dependencias', () => {
  const error = new Error('falló https://host.test/?pot=secreto Authorization: Bearer privado')
  const result = describirError(error)
  assert.equal(result.codigo, 'ERROR')
  assert.doesNotMatch(JSON.stringify(result), /secreto|privado|host.test/)
  assert.equal(describirError(new ErrorDescargaYouTube(403, 1048576, 60000)).desde, 1048576)
  assert.equal(describirError(new DOMException('x', 'TimeoutError')).codigo, 'TIMEOUT')
})

test('el descifrado recibe variables y la invocación está cubierta por el timeout', () => {
  assert.equal(evaluarPlayer({ output: 'return n + 1' }, { n: 3 }), 4)
  assert.throws(() => evaluarPlayer({ output: 'while (true) {}' }, {}, 20), /timed out/)
})

test('el comparador trabaja sobre informes locales y rechaza esquemas desconocidos', () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
  const { spawnSync } = require('node:child_process')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dnmusic-comparar-'))
  const script = path.join(__dirname, '../scripts/comparar-diagnosticos.cjs')
  try {
    const a = path.join(dir, 'a.json'), b = path.join(dir, 'b.json')
    fs.writeFileSync(a, JSON.stringify({ esquema: 1, prueba: { modo: 'descarga' }, ok: true, duracionMs: 50, eventos: [], resultado: { bytes: 4 } }))
    fs.writeFileSync(b, JSON.stringify({ esquema: 1, prueba: { modo: 'descarga' }, ok: false, duracionMs: 100, eventos: [], error: { codigo: 'HTTP_403', desde: 1048576 } }))
    const ok = spawnSync(process.execPath, [script, a, b], { encoding: 'utf8' })
    assert.equal(ok.status, 0)
    assert.match(ok.stdout, /HTTP_403/)
    assert.match(ok.stdout, /1048576/)
    fs.writeFileSync(b, '{}')
    const fail = spawnSync(process.execPath, [script, a, b], { encoding: 'utf8' })
    assert.equal(fail.status, 2)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
