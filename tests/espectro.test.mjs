import test from 'node:test'
import assert from 'node:assert/strict'
import { crearAnalizador } from '../src/lib/espectro.ts'
const tono = (bin, amplitud = 0.8) =>
  Array.from({ length: 1024 }, (_, i) => amplitud * Math.sin((2 * Math.PI * bin * i) / 1024))
test('el silencio no genera barras ficticias', () => {
  assert.deepEqual(crearAnalizador()([{ frames: Array(1024).fill(0) }]), [0, 0, 0, 0])
})
test('separa graves, medios y agudos a partir de PCM', () => {
  const analizar = crearAnalizador()
  for (const [banda, bin] of [4, 16, 64, 256].entries()) {
    const valores = analizar([{ frames: tono(bin) }])
    assert.equal(valores.indexOf(Math.max(...valores)), banda)
    assert.ok(valores[banda] > 0.5)
  }
})
test('una señal más débil genera menos energía, y captura el canal derecho', () => {
  const analizar = crearAnalizador()
  assert.ok(analizar([{ frames: tono(16, 0.8) }])[1] > analizar([{ frames: tono(16, 0.04) }])[1])
  assert.ok(analizar([{ frames: Array(1024).fill(0) }, { frames: tono(16) }])[1] > 0.5)
})
test('un golpe suave sube de inmediato y el valle siguiente baja ampliamente', () => {
  for (const [banda, bin] of [4, 16, 64, 256].entries()) {
    const analizar = crearAnalizador()
    const golpe = analizar([{ frames: tono(bin, 0.05) }], 0)[banda]
    const valle = analizar([{ frames: tono(bin, 0.005) }], 50)[banda]
    assert.ok(golpe > 0.85, `banda ${banda}: golpe visible incluso con PCM débil`)
    assert.ok(valle < 0.2, `banda ${banda}: conserva la bajada de volumen`)
    assert.deepEqual(analizar([{ frames: tono(bin, 0) }], 100), [0, 0, 0, 0])
    assert.ok(analizar([{ frames: tono(bin, 0.1) }], 150)[banda] > 0.85)
  }
})
test('la ganancia se adapta al volumen sin inventar pulsos en una señal constante', () => {
  const analizar = crearAnalizador()
  analizar([{ frames: tono(16, 0.8) }], 0)
  const alBajar = analizar([{ frames: tono(16, 0.04) }], 50)[1]
  let recuperado
  for (let ms = 100; ms <= 12000; ms += 50)
    recuperado = analizar([{ frames: tono(16, 0.04) }], ms)[1]
  assert.ok(alBajar < 0.1)
  assert.ok(recuperado > 0.85)
  for (let ms = 12050; ms <= 15000; ms += 50)
    assert.equal(analizar([{ frames: tono(16, 0.04) }], ms)[1], recuperado)
})
test('el silencio y el ruido muy bajo no se amplifican aunque pasen varios segundos', () => {
  const analizar = crearAnalizador()
  analizar([{ frames: tono(64) }], 0)
  for (let ms = 50; ms <= 30000; ms += 50)
    assert.deepEqual(analizar([{ frames: tono(64, 0.0001) }], ms), [0, 0, 0, 0])
})
