import test from 'node:test'
import assert from 'node:assert/strict'
import { activeLyricIndex, enfoque, parseLrc } from '../src/services/letra.ts'

test('el intérprete de LRC ignora metadatos y ordena por tiempo', () => {
  const lines = parseLrc('[ar:Cigarettes After Sex]\n[00:20.5]dos\n[00:10.25]uno\n[00:30.00]\n')
  assert.deepEqual(
    lines.map((l) => [l.atMs, l.text]),
    [
      [10_250, 'uno'],
      [20_500, 'dos'],
    ],
  )
})

test('el corrimiento del archivo corre la letra entera', () => {
  const lines = parseLrc('[offset:+500]\n[00:10.00]uno\n[00:20.00]dos\n')
  assert.deepEqual(
    lines.map((l) => l.atMs),
    [9500, 19_500],
  )
})

test('las marcas por palabra se sacan del texto en vez de dibujarse', () => {
  // El LRC «mejorado» trae el tiempo de cada palabra. No lo usamos —la unidad
  // es el verso— pero hay que limpiarlo: si no, los corchetes angulares se
  // dibujan tal cual en la pantalla.
  const [linea] = parseLrc('[00:12.00]<00:12.00>Sweet <00:12.60>how <00:13.40>the words slip\n')
  assert.equal(linea.text, 'Sweet how the words slip')
  assert.equal(linea.atMs, 12_000)
})

test('la línea que corresponde a cada momento', () => {
  const lines = parseLrc('[00:10.00]uno\n[00:20.00]dos\n[00:30.00]tres\n')
  assert.equal(activeLyricIndex(lines, 0), -1, 'antes de la primera, ninguna')
  assert.equal(activeLyricIndex(lines, 10_000), 0)
  assert.equal(activeLyricIndex(lines, 19_999), 0)
  assert.equal(activeLyricIndex(lines, 20_000), 1)
  assert.equal(activeLyricIndex(lines, 999_999), 2)
})

/** Versos en los segundos que se le pidan. */
const versos = (...segundos) => segundos.map((s, i) => ({ atMs: s * 1000, text: `verso ${i}` }))

test('con los versos pegados, la pantalla no se adelanta nunca', () => {
  // Es el caso peligroso: adelantarse acá sería subir la letra mientras todavía
  // se está cantando el verso que está a la vista.
  const lines = versos(0, 3, 6, 9)
  for (let ms = 3000; ms < 6000; ms += 100) {
    assert.equal(enfoque(lines, 1, ms), 1, `a los ${ms}ms sigue en la que suena`)
  }
})

test('en un instrumental largo, la próxima se pone en su lugar antes de sonar', () => {
  const lines = versos(0, 10, 30)
  // El verso 1 tiene veinte segundos de hueco detrás.
  assert.equal(enfoque(lines, 1, 12_000), 1, 'recién cantado, se queda')
  assert.equal(enfoque(lines, 1, 27_000), 1, 'a tres segundos del próximo, todavía')
  assert.equal(enfoque(lines, 1, 27_500), 2, 'a dos segundos y medio, ya está puesta la que viene')
  assert.equal(enfoque(lines, 1, 29_900), 2)
})

test('el adelanto no depende de cuándo terminó de cantarse el verso', () => {
  // Se cuenta desde la línea que **viene**, que es un dato del archivo, y no
  // desde el final de la que suena, que habría que estimar. El momento del
  // salto es el mismo tenga el verso anterior diez segundos o treinta.
  const corto = versos(0, 29, 40)
  const largo = versos(0, 10, 40)
  assert.equal(enfoque(corto, 1, 37_500), 2)
  assert.equal(enfoque(largo, 1, 37_500), 2)
  assert.equal(enfoque(corto, 1, 37_000), 1)
  assert.equal(enfoque(largo, 1, 37_000), 1)
})

test('antes de la primera línea y en la última no hay a dónde adelantarse', () => {
  const lines = versos(0, 10, 30)
  assert.equal(enfoque(lines, -1, 0), -1)
  assert.equal(enfoque(lines, 2, 999_999), 2)
})
