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
