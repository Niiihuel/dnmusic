import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const apple = require('../src/ui/apple.json')
const tailwind = require('../tailwind.config.js')
const ejecutar = orden => require('node:child_process').execSync(orden, { encoding: 'utf8' })

/**
 * La escala de Apple, escrita a mano acá.
 *
 * Es a propósito que esté duplicada: `apple.json` es la fuente que la app lee,
 * y esto es el testigo contra el que se compara. Sin un testigo, cambiar un
 * número en la fuente no rompe nada y la escala se va corriendo de a poco hasta
 * dejar de ser la de iOS — que es exactamente cómo estaba antes de esta
 * migración, con `text-[14px]` y `text-[19px]` sueltos por el código.
 *
 * Medido del UI Kit oficial de iOS 27 (kit 27.0.2). Si algún día hay que
 * cambiarlo, se cambian los dos lados y el commit dice de dónde salió el número
 * nuevo.
 */
const APPLE = {
  largeTitle: [34, 41, 0.4],
  title1: [28, 34, 0.38],
  title2: [22, 28, -0.26],
  title3: [20, 25, -0.45],
  headline: [17, 22, -0.43],
  body: [17, 22, -0.43],
  callout: [16, 21, -0.31],
  subheadline: [15, 20, -0.23],
  footnote: [13, 18, -0.08],
  caption1: [12, 16, 0],
  caption2: [11, 13, 0.06],
}

test('la escala de texto es la de iOS, con su interlineado y su tracking', () => {
  const nuestros = Object.keys(apple.texto).filter(k => !k.startsWith('_'))
  assert.deepEqual(nuestros.sort(), Object.keys(APPLE).sort())
  for (const [nombre, [size, leading, tracking]] of Object.entries(APPLE)) {
    assert.deepEqual(apple.texto[nombre], { size, leading, tracking }, nombre)
  }
})

test('las clases de Tailwind salen de la misma tabla que los Animated.*', () => {
  /* Los dos lectores de `apple.json`. Si se separan, la mitad de la app queda
     en una escala y la otra mitad en otra, y no lo nota nadie hasta verlo.

     Los nombres van **escritos**, no derivados: derivarlos con la misma función
     que los genera es una prueba que no prueba nada, y así fue como
     `text-caption1` terminó llamándose `text-caption-1` en la config mientras
     el código escribía el otro. Ciento cuarenta y seis textos cayendo al
     tamaño por defecto del navegador, con todo en verde. */
  const CLASE = {
    largeTitle: 'large-title', title1: 'title1', title2: 'title2', title3: 'title3',
    headline: 'headline', body: 'body', callout: 'callout', subheadline: 'subheadline',
    footnote: 'footnote', caption1: 'caption1', caption2: 'caption2',
  }
  for (const [nombre, [size, leading, tracking]] of Object.entries(APPLE)) {
    assert.deepEqual(
      tailwind.theme.extend.fontSize[CLASE[nombre]],
      [`${size}px`, { lineHeight: `${leading}px`, letterSpacing: `${tracking}px` }],
      nombre,
    )
  }
})

test('los radios son los que el kit le da a cada pieza, no una rampa inventada', () => {
  /* Los que subieron en iOS 27 y son los que delatan una app vieja: menú,
     alerta y menú contextual pasaron de 14 a 34, y el popover a 38. */
  assert.equal(apple.radio.menu, 34)
  assert.equal(apple.radio.alerta, 34)
  assert.equal(apple.radio.menuContextual, 34)
  assert.equal(apple.radio.popover, 38)
  assert.equal(apple.radio.hojaGrande, 38)
  assert.equal(apple.radio.pildora, 9999)
  assert.equal(apple.radio.agrupado, 10)
  /* `card` y `pill` son de la app, no del kit, y conservan su valor: los radios
     de Apple entran con nombre propio para poder aplicarse pieza por pieza. */
  assert.equal(tailwind.theme.extend.borderRadius.card, '20px')
})

test('las alturas del sistema son las de iOS 27, que subió la barra de arriba', () => {
  assert.equal(apple.control.toque, 44)
  assert.equal(apple.control.barraSuperior, 54)
  assert.equal(apple.control.barraPestanas, 95)
})

test('cada clase de la escala que el código escribe existe de verdad', () => {
  /*
   * El puente que faltaba entre lo que se define y lo que se usa.
   *
   * `text-caption1` estuvo escrito 85 veces contra una config que la llamaba
   * `text-caption-1`: la clase no existía, esos textos salían al tamaño por
   * defecto del navegador, y las pruebas seguían en verde porque medían la
   * config contra sí misma. Acá se leen los archivos y se exige que cada clase
   * escrita esté definida.
   */
  const fuentes = ejecutar('grep -rhoE "\\\\btext-[a-z][a-z0-9-]*" src app --include=*.tsx')
  const definidas = new Set(Object.keys(tailwind.theme.extend.fontSize))
  const colores = new Set(Object.keys(tailwind.theme.extend.colors))
  const huerfanas = new Set()
  for (const uso of fuentes.split('\n').filter(Boolean)) {
    const nombre = uso.slice('text-'.length)
    /* Las de color y las de alineación de Tailwind no son de esta escala. */
    if (colores.has(nombre) || ['center', 'left', 'right', 'justify'].includes(nombre)) continue
    if (!definidas.has(nombre)) huerfanas.add(uso)
  }
  assert.deepEqual([...huerfanas], [], 'clases de texto que no existen')
})
