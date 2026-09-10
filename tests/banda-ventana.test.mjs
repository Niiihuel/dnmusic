import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

/**
 * El cromo de la ventana no ocupa layout.
 *
 * El módulo lee `navigator.windowControlsOverlay` **al cargarse**, así que cada
 * caso necesita su propia carga: por eso se transpila el archivo cada vez en
 * vez de importarlo una sola vez.
 */
function cargar({ overlay = false, web = true } = {}) {
  const source = readFileSync('src/ui/BandaVentana.tsx', 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  })
  const exports = {}
  new Function('exports', 'require', 'navigator', outputText)(
    exports,
    (id) => {
      if (id === './Glass') return { ES_WEB: web }
      throw Error(id)
    },
    overlay ? { windowControlsOverlay: { visible: true } } : {},
  )
  return exports
}

test('sin overlay no hay zona de arrastre: el navegador y la PWA no la necesitan', () => {
  const sin = cargar({ overlay: false })
  assert.equal(sin.HAY_BANDA_VENTANA, false)
  assert.equal(sin.ARRASTRE_VENTANA, '')
  assert.equal(sin.SIN_ARRASTRE, '')
})

test('fuera de la web tampoco: el teléfono no tiene ventana que arrastrar', () => {
  const movil = cargar({ overlay: true, web: false })
  assert.equal(movil.HAY_BANDA_VENTANA, false)
  assert.equal(movil.ARRASTRE_VENTANA, '')
})

test('con cromo propio publica las dos clases, la de arrastrar y la de salirse', () => {
  const escritorio = cargar({ overlay: true })
  assert.equal(escritorio.HAY_BANDA_VENTANA, true)
  assert.equal(escritorio.ARRASTRE_VENTANA, 'dn-arrastrar')
  assert.equal(escritorio.SIN_ARRASTRE, 'dn-no-arrastrar')
})

test('el cromo va encima del layout, no adentro: nadie reserva una fila arriba', () => {
  const layout = readFileSync('app/_layout.tsx', 'utf8')
  assert.doesNotMatch(layout, /BandaVentana/, 'la app no monta ninguna franja que ocupe alto')
  const componente = readFileSync('src/ui/BandaVentana.tsx', 'utf8')
  assert.doesNotMatch(componente, /<View/, 'el módulo no dibuja: sólo dice qué clase corresponde')
  // El `env()` que queda es el de la franja **absoluta** del acceso: no ocupa alto.
  const css = readFileSync('global.css', 'utf8')
  assert.match(css, /\.dn-arrastre-superior[\s\S]*?position:\s*absolute/)
})

test('se arrastra desde el encabezado lateral y sus botones se salen de la zona', () => {
  const cabecera = readFileSync('src/ui/CabeceraLateral.tsx', 'utf8')
  assert.match(cabecera, /CabeceraLateral[\s\S]*?\$\{ARRASTRE_VENTANA\}/)
  assert.match(cabecera, /BotonLateral[\s\S]*?\$\{SIN_ARRASTRE\}/)
  const css = readFileSync('global.css', 'utf8')
  assert.match(css, /\.dn-arrastrar[\s\S]*?-webkit-app-region:\s*drag/)
  assert.match(css, /\.dn-no-arrastrar[\s\S]*?-webkit-app-region:\s*no-drag/)
})

test('el acceso, que no tiene barra lateral, trae su propia franja de arrastre', () => {
  const acceso = readFileSync('src/ui/Acceso.tsx', 'utf8')
  assert.match(acceso, /ARRASTRE_SUPERIOR \? <View className=\{ARRASTRE_SUPERIOR\} \/> : null/)
  const escritorio = cargar({ overlay: true })
  assert.equal(escritorio.ARRASTRE_SUPERIOR, 'dn-arrastre-superior')
  assert.equal(cargar({ overlay: false }).ARRASTRE_SUPERIOR, '')
})

test('la ventana sigue sin barra de título del sistema, con los botones teñidos', () => {
  const main = readFileSync('desktop/src/main.ts', 'utf8')
  assert.match(main, /titleBarStyle: 'hidden'/)
  assert.match(main, /titleBarOverlay: \{ color: '#121212', symbolColor: '#B3B3B3', height: BANDA_VENTANA \}/)
  assert.match(main, /const BANDA_VENTANA = 38/)
})
